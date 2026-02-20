import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import nodeCron from 'node-cron';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Groq } from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ProviderFailoverManager } from './providers/failover-manager.js';
import { checkAllProviders } from './providers/provider-checks.js';
import { callAnthropicAPI } from './providers/anthropic-client.js';
import { callGitHubCopilotAPI } from './providers/github-copilot-client.js';
import { redisClient } from './lib/redis.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 7860;

// --- Provider Failover Manager ---
const llmFailover = new ProviderFailoverManager();

// --- Context Storage (Redis with in-memory fallback) ---
async function saveContext(userId, context) {
  await redisClient.saveContext(userId, context);
}

async function getContext(userId) {
  return await redisClient.getContext(userId);
}

async function clearContext(userId) {
  await redisClient.clearContext(userId);
}

// --- OpenClaw Cloud Fallback ---
const OPENCLOUD_API_URL = process.env.OPENCLOUD_API_URL || 'https://taz7770-proxyos-openclaw.hf.space/api/agent';

async function callOpenCloudAPI(message, context = []) {
  const response = await fetch(OPENCLOUD_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      message,
      context: context.slice(-10)
    })
  });
  
  if (!response.ok) {
    throw new Error(`OpenClaw cloud error: ${response.status}`);
  }
  
  return response.json();
}

// --- Shared provider call helper ---
async function callProvider(providerName, systemContent, userContent) {
  switch (providerName) {
    case 'nvidia':
      if (!nvidiaApiKey) throw new Error('NVIDIA_API_KEY not configured');
      return await callNvidiaAPI(systemContent, userContent);
    case 'groq':
      if (!groq) throw new Error('GROQ_API_KEY not configured');
      const completion = await groq.chat.completions.create({
        messages: [
          { role: 'system', content: systemContent || '' },
          { role: 'user', content: userContent }
        ],
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 2048
      });
      return completion.choices[0].message.content;
    case 'bonsai':
      if (!bonsaiApiKey) throw new Error('BONSAI_API_KEY not configured');
      return await callBonsaiAPI(systemContent, userContent);
    case 'zai':
      if (!zaiApiKey) throw new Error('ZAI_API_KEY not configured');
      return await callZaiAPI(systemContent, userContent);
    case 'github-copilot':
      if (!githubCopilotToken) throw new Error('GITHUB_COPILOT_TOKEN not configured');
      return await callGitHubCopilotAPI(systemContent, userContent);
    case 'opencode':
      if (!opencodeApiKey) throw new Error('OPENCODE_API_KEY not configured');
      return await callOpenCodeAPI(systemContent, userContent);
    case 'openrouter':
      if (!openrouterApiKey) throw new Error('OPENROUTER_API_KEY not configured');
      return await callOpenRouterAPI(systemContent, userContent);
    case 'anthropic':
      if (!anthropicApiKey) throw new Error('ANTHROPIC_API_KEY not configured');
      return await callAnthropicAPI(systemContent, userContent);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

// --- Unified LLM Call with Failover ---
async function unifiedLLMCall(message, preferredProvider = null, contextMessages = []) {
  const systemPrompt = contextMessages.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n');

  // If a preferred provider is specified, try it first
  if (preferredProvider) {
    try {
      const result = await callProvider(preferredProvider, systemPrompt, message);
      if (result) {
        console.log(`[ProxyOS] LLM call succeeded with preferred provider: ${preferredProvider}`);
        llmFailover.recordSuccess(preferredProvider);
        return { response: result, provider: preferredProvider };
      }
    } catch (e) {
      console.log(`[ProxyOS] Preferred provider ${preferredProvider} failed: ${e.message}, falling through to failover chain`);
      llmFailover.recordFailure(preferredProvider);
    }
  }

  // Use the ProviderFailoverManager for automatic failover with circuit breakers
  try {
    const result = await llmFailover.executeWithFailover(async (providerName) => {
      const output = await callProvider(providerName, systemPrompt, message);
      return { response: output };
    });
    console.log(`[ProxyOS] LLM call succeeded with provider: ${result.provider}`);
    return { response: result.response, provider: result.provider };
  } catch (failoverError) {
    console.log('[ProxyOS] All providers failed, falling back to OpenClaw cloud...');
  }

  // Final fallback to OpenClaw cloud
  try {
    const cloudResult = await callOpenCloudAPI(message, contextMessages);
    return { response: cloudResult.response || cloudResult, provider: 'openclaw-cloud' };
  } catch (cloudError) {
    console.error('[ProxyOS] OpenClaw cloud failed:', cloudError.message);
    throw new Error('All LLM providers failed including OpenClaw cloud fallback');
  }
}

// --- Supabase client --------------------------------------------------------

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    '[ProxyOS backend] SUPABASE_URL or SUPABASE_SERVICE_KEY missing – backend will not function until configured.'
  );
}

const supabase = createClient(supabaseUrl ?? '', supabaseServiceKey ?? '');

// --- LLM clients ------------------------------------------------------------

const groqApiKey = process.env.GROQ_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;
const nvidiaApiKey = process.env.NVIDIA_API_KEY;
const bonsaiApiKey = process.env.BONSAI_API_KEY;
const opencodeApiKey = process.env.OPENCODE_API_KEY;
const openrouterApiKey = process.env.OPENROUTER_API_KEY;
const zaiApiKey = process.env.ZAI_API_KEY;
const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const githubCopilotToken = process.env.GITHUB_COPILOT_TOKEN;
const nvidiaModel = process.env.NVIDIA_MODEL || 'z-ai/glm5';

const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

async function callNvidiaAPI(systemContent, userContent) {
  const messages = [];
  if (systemContent) {
    messages.push({ role: 'system', content: systemContent });
  }
  messages.push({ role: 'user', content: userContent });

  const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${nvidiaApiKey}`
    },
    body: JSON.stringify({
      model: nvidiaModel,
      messages: messages,
      temperature: 0.7,
      top_p: 1,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Nvidia API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callBonsaiAPI(systemContent, userContent) {
  const messages = [];
  if (systemContent) {
    messages.push({ role: 'system', content: systemContent });
  }
  messages.push({ role: 'user', content: userContent });

  const response = await fetch('https://go.trybons.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${bonsaiApiKey}`
    },
    body: JSON.stringify({
      model: 'auto',
      messages: messages,
      temperature: 0.7,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bonsai API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callOpenCodeAPI(systemContent, userContent) {
  const messages = [];
  if (systemContent) messages.push({ role: 'system', content: systemContent });
  messages.push({ role: 'user', content: userContent });

  const response = await fetch('https://api.opencode.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': opencodeApiKey
    },
    body: JSON.stringify({
      model: 'opencode/default',
      messages,
      temperature: 0.7,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenCode API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callZaiAPI(systemContent, userContent) {
  const messages = [];
  if (systemContent) messages.push({ role: 'system', content: systemContent });
  messages.push({ role: 'user', content: userContent });

  const response = await fetch('https://api.z.ai/api/coding/paas/v4/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${zaiApiKey}`
    },
    body: JSON.stringify({
      model: 'GLM-4.7-Flash',
      messages,
      temperature: 0.7,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Z.ai API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callOpenRouterAPI(systemContent, userContent) {
  const messages = [];
  if (systemContent) messages.push({ role: 'system', content: systemContent });
  messages.push({ role: 'user', content: userContent });

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openrouterApiKey}`,
      'HTTP-Referer': 'https://taz7770-proxyos-backend.hf.space',
      'X-Title': 'ProxyOS Backend'
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      messages,
      temperature: 0.7,
      max_tokens: 4096
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function routeToLLM(agentRole, prompt, context, taskType, selectedProvider) {
  // If a preferred provider is specified, try it first
  if (selectedProvider) {
    try {
      const result = await callProvider(selectedProvider, context ?? '', prompt);
      if (result) {
        console.log(`[ProxyOS] Agent ${agentRole} succeeded with provider: ${selectedProvider}`);
        llmFailover.recordSuccess(selectedProvider);
        return result;
      }
    } catch (e) {
      console.log(`[ProxyOS] Agent ${agentRole} preferred provider ${selectedProvider} failed: ${e.message}, falling through to failover`);
      llmFailover.recordFailure(selectedProvider);
    }
  }

  // Use the ProviderFailoverManager for automatic failover with circuit breakers
  try {
    const result = await llmFailover.executeWithFailover(async (providerName) => {
      const output = await callProvider(providerName, context ?? '', prompt);
      return { response: output };
    });
    console.log(`[ProxyOS] Agent ${agentRole} succeeded with provider: ${result.provider}`);
    return result.response;
  } catch (failoverError) {
    console.log(`[ProxyOS] Agent ${agentRole}: all providers failed, trying Gemini for ${taskType}...`);
  }

  // Gemini fallback for strategy/deep reasoning tasks
  const useGemini = genAI && (taskType === 'strategy' || taskType === 'deep_reasoning');
  if (useGemini) {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent([
      { text: context ?? '' },
      { text: prompt }
    ]);
    return result.response.text();
  }

  throw new Error(`No LLM provider available for agent ${agentRole}`);
}

// --- Memory sync ------------------------------------------------------------

async function syncMemoriesOnBoot() {
  try {
    const { data, error } = await supabase.from('agent_memories').select('*');
    if (error) throw error;
    if (!data) return;

    for (const agent of data) {
      const agentDir = path.join(__dirname, 'agents', agent.agent_role);
      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(path.join(agentDir, 'soul.md'), agent.soul_markdown);
      await fs.writeFile(path.join(agentDir, 'memory.md'), agent.memory_markdown);
    }

    // eslint-disable-next-line no-console
    console.log('[ProxyOS backend] Memories synced for agents:', data.map(a => a.agent_role));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ProxyOS backend] Failed to sync memories:', err.message);
  }
}

async function persistMemory(agentRole, memoryContent) {
  try {
    await supabase
      .from('agent_memories')
      .update({
        memory_markdown: memoryContent,
        last_updated: new Date().toISOString()
      })
      .eq('agent_role', agentRole);
  } catch (err) {
    console.error(`[ProxyOS backend] Failed to persist memory for ${agentRole}:`, err.message);
  }
}

// --- Agent implementations ---------------------------------------------------

class AgentMinion {
  constructor() {
    this.role = 'minion';
  }

  async execute(task) {
    const started = Date.now();
    let provider = 'nvidia';
    try {
      const { data: contextRow } = await supabase
        .from('proxy_context')
        .select('metadata')
        .eq('id', task.context_id)
        .single();
      if (contextRow?.metadata?.provider) {
        provider = contextRow.metadata.provider;
      }
    } catch (e) {}

    try {
      const dir = path.join(__dirname, 'agents', 'minion');
      const soul = await fs.readFile(path.join(dir, 'soul.md'), 'utf8');
      const memory = await fs.readFile(path.join(dir, 'memory.md'), 'utf8');

      const prompt = `
TASK: ${task.task_description}

Execute this as the Minion (coder / automation engine).
Return only:
- Shell commands (if any)
- Code blocks (if any)
- Deployment notes
Do not include conversational filler.`;

      const output = await routeToLLM(this.role, prompt, `${soul}\n\n${memory}`, 'code', provider);

      const newMemory =
        memory +
        `\n\n## Execution ${new Date().toISOString()}\n- Task: ${task.task_description}\n- Status: completed\n`;
      await fs.writeFile(path.join(dir, 'memory.md'), newMemory);
      await persistMemory('minion', newMemory);

      return {
        status: 'success',
        output,
        execution_time: Date.now() - started
      };
    } catch (err) {
      return {
        status: 'failed',
        error: err.message,
        execution_time: Date.now() - started
      };
    }
  }
}

class AgentScout {
  constructor() {
    this.role = 'scout';
  }

  async execute(task) {
    const started = Date.now();
    let provider = 'nvidia';
    try {
      const { data: contextRow } = await supabase
        .from('proxy_context')
        .select('metadata')
        .eq('id', task.context_id)
        .single();
      if (contextRow?.metadata?.provider) {
        provider = contextRow.metadata.provider;
      }
    } catch (e) {}

    try {
      const dir = path.join(__dirname, 'agents', 'scout');
      const soul = await fs.readFile(path.join(dir, 'soul.md'), 'utf8');
      const memory = await fs.readFile(path.join(dir, 'memory.md'), 'utf8');

      const prompt = `
RESEARCH TASK: ${task.task_description}

Return structured findings:
- Markdown tables
- Bullet-point insights
- Citations / URLs (plain text)
`;

      const output = await routeToLLM(this.role, prompt, `${soul}\n\n${memory}`, 'research', provider);

      const newMemory =
        memory +
        `\n\n## Research ${new Date().toISOString()}\n- Query: ${task.task_description}\n- Notes captured.\n`;
      await fs.writeFile(path.join(dir, 'memory.md'), newMemory);
      await persistMemory('scout', newMemory);

      return {
        status: 'success',
        output,
        execution_time: Date.now() - started
      };
    } catch (err) {
      return {
        status: 'failed',
        error: err.message,
        execution_time: Date.now() - started
      };
    }
  }
}

class AgentSage {
  constructor() {
    this.role = 'sage';
  }

  async execute(task) {
    const started = Date.now();
    let provider = 'nvidia';
    try {
      const { data: contextRow } = await supabase
        .from('proxy_context')
        .select('metadata')
        .eq('id', task.context_id)
        .single();
      if (contextRow?.metadata?.provider) {
        provider = contextRow.metadata.provider;
      }
    } catch (e) {}

    try {
      const dir = path.join(__dirname, 'agents', 'sage');
      const soul = await fs.readFile(path.join(dir, 'soul.md'), 'utf8');
      const memory = await fs.readFile(path.join(dir, 'memory.md'), 'utf8');

      const ctx = [];
      if (task.context_id) {
        const { data: contextRow } = await supabase
          .from('proxy_context')
          .select('*')
          .eq('id', task.context_id)
          .single();
        if (contextRow?.raw_input) ctx.push(contextRow.raw_input);
      }

      const prompt = `
REVIEW TASK: ${task.task_description}

CONTEXT:
${ctx.join('\n\n')}

Respond with:
- PASS or NEEDS_WORK
- Specific issues
- Concrete improvements
- Any cross-country / scaling considerations
`;

      const output = await routeToLLM(this.role, prompt, `${soul}\n\n${memory}`, 'strategy', provider);

      const verdict = output.includes('PASS') ? 'PASS' : 'NEEDS_WORK';
      const newMemory =
        memory +
        `\n\n## Review ${new Date().toISOString()}\n- Task: ${task.task_description}\n- Verdict: ${verdict}\n`;
      await fs.writeFile(path.join(dir, 'memory.md'), newMemory);
      await persistMemory('sage', newMemory);

      return {
        status: 'success',
        output,
        execution_time: Date.now() - started
      };
    } catch (err) {
      return {
        status: 'failed',
        error: err.message,
        execution_time: Date.now() - started
      };
    }
  }
}

const agents = {
  minion: new AgentMinion(),
  scout: new AgentScout(),
  sage: new AgentSage()
};

// --- Task processing ---------------------------------------------------------

async function processTask(taskId) {
  const { data: task, error } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('id', taskId)
    .single();

  if (error || !task) {
    // eslint-disable-next-line no-console
    console.error('[ProxyOS backend] Task not found:', taskId, error?.message);
    return;
  }

  // Mark working
  await supabase
    .from('agent_tasks')
    .update({ status: 'working', updated_at: new Date().toISOString() })
    .eq('id', taskId);

  await supabase.from('execution_logs').insert({
    task_id: taskId,
    agent_role: task.agent_role,
    log_type: 'info',
    message: `Starting execution: ${task.task_description}`
  });

  const agent = agents[task.agent_role];
  if (!agent) return;

  const result = await agent.execute(task);

  await supabase
    .from('agent_tasks')
    .update({
      status: result.status,
      output_log: result.output ?? result.error ?? null,
      execution_time_ms: result.execution_time,
      updated_at: new Date().toISOString()
    })
    .eq('id', taskId);

  await supabase.from('execution_logs').insert({
    task_id: taskId,
    agent_role: task.agent_role,
    log_type: result.status === 'success' ? 'success' : 'error',
    message: result.status === 'success' ? 'Execution completed' : result.error,
    metadata: result
  });
}

async function processQueue() {
  const { data: pending, error } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('status', 'pending')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(5);

  if (error || !pending?.length) return;

  for (const task of pending) {
    const { data: activeForAgent } = await supabase
      .from('agent_tasks')
      .select('id')
      .eq('agent_role', task.agent_role)
      .eq('status', 'working')
      .limit(1);

    if (!activeForAgent || activeForAgent.length === 0) {
      // Fire and forget
      // eslint-disable-next-line no-void
      void processTask(task.id);
    }
  }
}

nodeCron.schedule('*/10 * * * * *', processQueue);
nodeCron.schedule('*/15 * * * * *', checkContextCompletion);

async function checkContextCompletion() {
  const { data: pendingDeliveries } = await supabase
    .from('outbound_deliveries')
    .select('context_id')
    .eq('status', 'pending')
    .eq('payload', '');

  if (!pendingDeliveries?.length) return;

  for (const delivery of pendingDeliveries) {
    const { data: tasks } = await supabase
      .from('agent_tasks')
      .select('status, output_log, agent_role')
      .eq('context_id', delivery.context_id);

    if (!tasks?.length) continue;

    const allDone = tasks.every(t =>
      ['success', 'failed', 'halted'].includes(t.status)
    );

    if (!allDone) continue;

    const aggregatedText = tasks
      .filter(t => t.status === 'success' && t.output_log)
      .map(t => `[${t.agent_role.toUpperCase()}]: ${t.output_log}`)
      .join('\n\n');

    const fallbackText = aggregatedText || '[ProxyOS] Tasks completed with no output.';

    await supabase
      .from('outbound_deliveries')
      .update({
        payload: fallbackText,
        updated_at: new Date().toISOString()
      })
      .eq('context_id', delivery.context_id)
      .eq('status', 'pending');
  }
}

// --- API routes --------------------------------------------------------------

app.get('/', (_req, res) => {
  res.json({
    status: 'ProxyOS Swarm Online',
    agents: Object.keys(agents),
    timestamp: new Date().toISOString()
  });
});

app.get('/health', async (_req, res) => {
  try {
    const { error } = await supabase.from('proxy_stats').select('id').limit(1);
    if (error) throw error;
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'degraded', error: err.message });
  }
});

app.get('/api/providers', (_req, res) => {
  const githubCopilotKey = process.env.GITHUB_COPILOT_TOKEN;
  const providerStatus = llmFailover.getProviderStatus();
  
  res.json({
    providers: providerStatus.map(p => ({
      ...p,
      model: p.name === 'nvidia' ? 'nvidia/llama-3.1-nemotron-70b-instruct' :
             p.name === 'groq' ? 'llama-3.3-70b-versatile' :
             p.name === 'bonsai' ? 'auto (frontier stealth)' :
             p.name === 'zai' ? 'GLM-4.7-Flash' :
             p.name === 'opencode' ? 'opencode/default' :
             p.name === 'openrouter' ? 'anthropic/claude-3.5-sonnet' :
             p.name === 'anthropic' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o'
    })),
    fallback: {
      url: OPENCLOUD_API_URL,
      enabled: true
    },
    config_source: 'unified-llm-router',
    failover_manager: {
      current_provider: llmFailover.currentProvider,
      initialized: true
    }
  });
});

app.get('/api/providers/health', async (_req, res) => {
  try {
    const healthResults = await checkAllProviders();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      providers: healthResults
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

app.post('/api/llm', async (req, res) => {
  const { message, provider, context } = req.body ?? {};
  
  if (!message) {
    return res.status(400).json({ status: 'error', message: 'message is required' });
  }

  try {
    const contextMessages = Array.isArray(context) ? context : [];
    const result = await unifiedLLMCall(message, provider, contextMessages);
    res.json({
      status: 'success',
      ...result
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.post('/api/feed-context', async (req, res) => {
  const { raw_input, input_type = 'text', project_tag, metadata = {} } = req.body ?? {};

  if (!raw_input || typeof raw_input !== 'string') {
    return res.status(400).json({ status: 'error', message: 'raw_input is required' });
  }

  try {
    const energyGained = Math.min(Math.max(Math.floor(raw_input.length / 10), 5), 50);

    const { data: contextRow, error: ctxError } = await supabase
      .from('proxy_context')
      .insert({
        raw_input,
        input_type,
        project_tag,
        metadata,
        energy_gained: energyGained
      })
      .select()
      .single();

    if (ctxError) throw ctxError;

    try {
      await supabase.rpc('increment_proxy_energy', {
        energy_amount: energyGained
      });
    } catch (e) {
      // ignore if RPC not defined yet
    }

    const delegation = await analyzeAndDelegate(raw_input, contextRow.id, project_tag);

    return res.json({
      status: 'success',
      context_id: contextRow.id,
      delegation
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

async function analyzeAndDelegate(raw_input, contextId, projectTag) {
  const input = raw_input.toLowerCase();
  const delegations = [];

  // Minion
  if (
    input.includes('code') ||
    input.includes('deploy') ||
    input.includes('github') ||
    input.includes('schema') ||
    input.includes('api')
  ) {
    const { data } = await supabase
      .from('agent_tasks')
      .insert({
        context_id: contextId,
        agent_role: 'minion',
        task_description: raw_input,
        task_type: 'code',
        project_tag: projectTag,
        priority: 8
      })
      .select()
      .single();
    if (data) delegations.push({ agent: 'minion', task_id: data.id });
  }

  // Scout
  if (
    input.includes('research') ||
    input.includes('find') ||
    input.includes('scrape') ||
    input.includes('supplier') ||
    input.includes('market') ||
    input.includes('competitor')
  ) {
    const { data } = await supabase
      .from('agent_tasks')
      .insert({
        context_id: contextId,
        agent_role: 'scout',
        task_description: raw_input,
        task_type: 'research',
        project_tag: projectTag,
        priority: 7
      })
      .select()
      .single();
    if (data) delegations.push({ agent: 'scout', task_id: data.id });
  }

  // Sage
  if (
    input.includes('review') ||
    input.includes('strategy') ||
    input.includes('qa') ||
    input.includes('polish') ||
    input.includes('analyze') ||
    input.includes('validate')
  ) {
    const { data } = await supabase
      .from('agent_tasks')
      .insert({
        context_id: contextId,
        agent_role: 'sage',
        task_description: raw_input,
        task_type: 'strategy',
        project_tag: projectTag,
        priority: 9
      })
      .select()
      .single();
    if (data) delegations.push({ agent: 'sage', task_id: data.id });
  }

  if (delegations.length === 0) {
    const { data } = await supabase
      .from('agent_tasks')
      .insert({
        context_id: contextId,
        agent_role: 'scout',
        task_description: `Research and analyze: ${raw_input}`,
        task_type: 'research',
        project_tag: projectTag,
        priority: 5
      })
      .select()
      .single();
    if (data) delegations.push({ agent: 'scout', task_id: data.id });
  }

  return delegations;
}

app.get('/api/swarm-status', async (_req, res) => {
  try {
    const { data: tasks } = await supabase
      .from('agent_tasks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: stats } = await supabase.from('proxy_stats').select('*').limit(1).maybeSingle();

    res.json({
      tasks: tasks ?? [],
      proxy_stats: stats ?? null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/assign-task', async (req, res) => {
  const { agent_role, task_description, project_tag, priority = 5 } = req.body ?? {};
  if (!agent_role || !task_description) {
    return res.status(400).json({ error: 'agent_role and task_description required' });
  }

  try {
    const { data, error } = await supabase
      .from('agent_tasks')
      .insert({
        agent_role,
        task_description,
        project_tag,
        priority,
        status: 'pending'
      })
      .select()
      .single();
    if (error) throw error;
    return res.json({ status: 'success', task: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/halt-task/:taskId', async (req, res) => {
  const { taskId } = req.params;
  try {
    await supabase
      .from('agent_tasks')
      .update({ status: 'halted', updated_at: new Date().toISOString() })
      .eq('id', taskId);
    return res.json({ status: 'success', message: 'Task halted' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/memories/:agentRole', async (req, res) => {
  const { agentRole } = req.params;
  try {
    const { data, error } = await supabase
      .from('agent_memories')
      .select('*')
      .eq('agent_role', agentRole)
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/inbound-message', async (req, res) => {
  const {
    raw_input,
    channel,
    channel_user_id,
    reply_metadata = {},
    project_tag,
    idempotency_key,
    provider,
    enable_context = true
  } = req.body ?? {};

  const selectedProvider = provider || 'nvidia';

  if (!raw_input || typeof raw_input !== 'string') {
    return res.status(400).json({ status: 'error', message: 'raw_input is required' });
  }

  if (!channel || typeof channel !== 'string') {
    return res.status(400).json({ status: 'error', message: 'channel is required' });
  }

  if (!channel_user_id || typeof channel_user_id !== 'string') {
    return res.status(400).json({ status: 'error', message: 'channel_user_id is required' });
  }

  try {
    // Get existing context for this user
    const userContext = await getContext(channel_user_id);
    
    // Add user's message to context
    if (enable_context) {
      userContext.messages.push({ role: 'user', content: raw_input });
      
      // Keep only last 20 messages for context window
      if (userContext.messages.length > 20) {
        userContext.messages = userContext.messages.slice(-20);
      }
      userContext.provider = selectedProvider;
    }

    // Check for idempotency
    if (idempotency_key) {
      const { data: existing } = await supabase
        .from('proxy_context')
        .select('id')
        .eq('metadata->idempotency_key', idempotency_key)
        .maybeSingle();

      if (existing) {
        return res.json({
          status: 'success',
          context_id: existing.id,
          message: 'Context already exists (idempotent)'
        });
      }
    }

    const energyGained = Math.min(Math.max(Math.floor(raw_input.length / 10), 5), 50);

    const metadata = {
      reply_address: {
        channel,
        channel_user_id,
        ...reply_metadata
      },
      idempotency_key,
      provider: selectedProvider
    };

    const { data: contextRow, error: ctxError } = await supabase
      .from('proxy_context')
      .insert({
        raw_input,
        input_type: 'text',
        project_tag,
        metadata,
        energy_gained: energyGained
      })
      .select()
      .single();

    if (ctxError) throw ctxError;

    try {
      await supabase.rpc('increment_proxy_energy', {
        energy_amount: energyGained
      });
    } catch (e) {}

    const { error: deliveryError } = await supabase
      .from('outbound_deliveries')
      .insert({
        context_id: contextRow.id,
        channel,
        channel_user_id,
        channel_extra: reply_metadata,
        payload: '',
        status: 'pending'
      });

    if (deliveryError) {
      console.error('[ProxyOS backend] Failed to create delivery row:', deliveryError.message);
    }

    // If context enabled, call LLM with context
    let llmResponse = null;
    if (enable_context && userContext.messages.length > 0) {
      try {
        const contextContent = userContext.messages.map(m => m.content).join('\n');
        llmResponse = await unifiedLLMCall(raw_input, selectedProvider, userContext.messages);
        
        // Save LLM response to context
        if (llmResponse && llmResponse.response) {
          userContext.messages.push({ role: 'assistant', content: llmResponse.response });
          
          // Keep context manageable
          if (userContext.messages.length > 20) {
            userContext.messages = userContext.messages.slice(-20);
          }
        }
      } catch (llmError) {
        console.error('[ProxyOS] LLM call failed:', llmError.message);
      }
    }

    // Save updated context
    await saveContext(channel_user_id, userContext);

    const delegation = await analyzeAndDelegate(raw_input, contextRow.id, project_tag);

    return res.json({
      status: 'success',
      context_id: contextRow.id,
      delegation,
      llm_response: llmResponse ? llmResponse.response : null,
      provider: llmResponse ? llmResponse.provider : null
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// --- OpenClaw Bridge Endpoint -----------------------------------------------
// Receives messages from OpenClaw and processes through ProxyOS agent system

app.post('/api/openclaw-message', async (req, res) => {
  const {
    raw_input,
    channel = 'openclaw',
    channel_user_id,
    reply_metadata = {},
    project_tag = 'openclaw-bridge',
    provider,
    enable_context = true
  } = req.body ?? {};

  const selectedProvider = provider || 'nvidia';

  if (!raw_input || typeof raw_input !== 'string') {
    return res.status(400).json({ status: 'error', message: 'raw_input is required' });
  }

  if (!channel_user_id || typeof channel_user_id !== 'string') {
    return res.status(400).json({ status: 'error', message: 'channel_user_id is required' });
  }

  try {
    console.log(`[ProxyOS] OpenClaw message received from ${channel_user_id}: ${raw_input.substring(0, 50)}...`);

    // Get existing context for this user
    const userContext = await getContext(`openclaw:${channel_user_id}`);
    
    // Add user's message to context
    if (enable_context) {
      userContext.messages.push({ role: 'user', content: raw_input });
      
      // Keep only last 20 messages for context window
      if (userContext.messages.length > 20) {
        userContext.messages = userContext.messages.slice(-20);
      }
      userContext.provider = selectedProvider;
    }

    const energyGained = Math.min(Math.max(Math.floor(raw_input.length / 10), 5), 50);

    const metadata = {
      reply_address: {
        channel,
        channel_user_id,
        ...reply_metadata
      },
      source: 'openclaw-bridge',
      provider: selectedProvider
    };

    // Create context in database
    const { data: contextRow, error: ctxError } = await supabase
      .from('proxy_context')
      .insert({
        raw_input,
        input_type: 'text',
        project_tag,
        metadata,
        energy_gained: energyGained
      })
      .select()
      .single();

    if (ctxError) throw ctxError;

    // Try to increment energy
    try {
      await supabase.rpc('increment_proxy_energy', {
        energy_amount: energyGained
      });
    } catch (e) {}

    // Create outbound delivery entry for OpenClaw to poll
    const { error: deliveryError } = await supabase
      .from('outbound_deliveries')
      .insert({
        context_id: contextRow.id,
        channel,
        channel_user_id,
        channel_extra: reply_metadata,
        payload: '',
        status: 'pending'
      });

    if (deliveryError) {
      console.error('[ProxyOS backend] Failed to create OpenClaw delivery row:', deliveryError.message);
    }

    // If context enabled, call LLM with context for immediate response
    let llmResponse = null;
    if (enable_context && userContext.messages.length > 0) {
      try {
        llmResponse = await unifiedLLMCall(raw_input, selectedProvider, userContext.messages);
        
        // Save LLM response to context
        if (llmResponse && llmResponse.response) {
          userContext.messages.push({ role: 'assistant', content: llmResponse.response });
          
          // Keep context manageable
          if (userContext.messages.length > 20) {
            userContext.messages = userContext.messages.slice(-20);
          }
        }
      } catch (llmError) {
        console.error('[ProxyOS] OpenClaw LLM call failed:', llmError.message);
      }
    }

    // Save updated context
    await saveContext(`openclaw:${channel_user_id}`, userContext);

    // Delegate to agents for async processing
    const delegation = await analyzeAndDelegate(raw_input, contextRow.id, project_tag);

    console.log(`[ProxyOS] OpenClaw context ${contextRow.id} created, delegations: ${delegation.length}`);

    return res.json({
      status: 'processing',
      context_id: contextRow.id,
      delegation,
      llm_response: llmResponse ? llmResponse.response : null,
      provider: llmResponse ? llmResponse.provider : selectedProvider
    });
  } catch (err) {
    console.error('[ProxyOS] OpenClaw message error:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// --- Context Management Endpoints ---

app.get('/api/user-context/:userId', async (req, res) => {
  const { userId } = req.params;
  const context = await getContext(userId);
  res.json({
    user_id: userId,
    message_count: context.messages.length,
    provider: context.provider,
    updated_at: context.updatedAt,
    messages: context.messages.slice(-5) // Last 5 messages for preview
  });
});

app.delete('/api/user-context/:userId', async (req, res) => {
  const { userId } = req.params;
  await clearContext(userId);
  res.json({ status: 'success', message: `Context cleared for user ${userId}` });
});

app.get('/api/health', async (req, res) => {
  try {
    const { checkAllServices } = await import('./providers/provider-checks.js');
    const health = await checkAllServices();
    res.json(health);
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/context/:id/status', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: context, error: ctxError } = await supabase
      .from('proxy_context')
      .select('id, status')
      .eq('id', id)
      .maybeSingle();

    if (ctxError) throw ctxError;
    if (!context) {
      return res.status(404).json({ status: 'error', message: 'Context not found' });
    }

    const { data: tasks, error: tasksError } = await supabase
      .from('agent_tasks')
      .select('status')
      .eq('context_id', id);

    if (tasksError) throw tasksError;

    const total = tasks?.length ?? 0;
    const done = tasks?.filter(t =>
      ['success', 'failed', 'halted'].includes(t.status)
    ).length ?? 0;
    const working = tasks?.filter(t => t.status === 'working').length ?? 0;

    let status = 'pending';
    if (total === 0) {
      status = 'pending';
    } else if (done === total) {
      status = 'completed';
    } else if (working > 0) {
      status = 'working';
    }

    return res.json({
      context_id: id,
      status,
      tasks_done: done,
      tasks_total: total
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/context/:id/result', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: context, error: ctxError } = await supabase
      .from('proxy_context')
      .select('id, raw_input')
      .eq('id', id)
      .maybeSingle();

    if (ctxError) throw ctxError;
    if (!context) {
      return res.status(404).json({ status: 'error', message: 'Context not found' });
    }

    const { data: tasks, error: tasksError } = await supabase
      .from('agent_tasks')
      .select('status, output_log, agent_role, execution_time_ms')
      .eq('context_id', id);

    if (tasksError) throw tasksError;

    const total = tasks?.length ?? 0;
    const done = tasks?.filter(t =>
      ['success', 'failed', 'halted'].includes(t.status)
    ).length ?? 0;

    if (total === 0 || done < total) {
      return res.status(202).json({
        context_id: id,
        status: 'pending',
        message: 'Tasks still processing',
        tasks_done: done,
        tasks_total: total
      });
    }

    const { data: delivery } = await supabase
      .from('outbound_deliveries')
      .select('payload')
      .eq('context_id', id)
      .maybeSingle();

    const outputs = tasks.map(t => ({
      agent_role: t.agent_role,
      status: t.status,
      output_log: t.output_log,
      execution_time_ms: t.execution_time_ms
    }));

    const aggregatedText = delivery?.payload || tasks
      .filter(t => t.status === 'success' && t.output_log)
      .map(t => `[${t.agent_role.toUpperCase()}]: ${t.output_log}`)
      .join('\n\n');

    return res.json({
      context_id: id,
      status: 'completed',
      summary: context.raw_input,
      outputs,
      aggregated_text: aggregatedText
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// --- Browserbase Browser Sessions --------------------------------------------

import { Browserbase } from '@browserbasehq/sdk';

const browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
const bb = browserbaseApiKey ? new Browserbase({ apiKey: browserbaseApiKey }) : null;

app.post('/api/browser/create-session', async (req, res) => {
  try {
    if (!bb || !browserbaseProjectId) {
      return res.status(503).json({ 
        status: 'error', 
        message: 'Browserbase not configured. Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID.' 
      });
    }

    const { browserSettings } = req.body || {};

    const session = await bb.sessions.create({
      projectId: browserbaseProjectId,
      browserSettings: browserSettings || {
        fingerprint: {
          browsers: ['chrome'],
          devices: ['desktop'],
          operatingSystems: ['macos']
        }
      }
    });

    res.json({
      status: 'success',
      session: {
        id: session.id,
        connectUrl: `wss://connect.browserbase.com?sessionId=${session.id}`,
        pageUrl: session.pageUrl
      }
    });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/browser/session/:sessionId', async (req, res) => {
  try {
    if (!bb) {
      return res.status(503).json({ status: 'error', message: 'Browserbase not configured' });
    }

    const session = await bb.sessions.retrieve(req.params.sessionId);
    res.json({ status: 'success', session });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.delete('/api/browser/session/:sessionId', async (req, res) => {
  try {
    if (!bb) {
      return res.status(503).json({ status: 'error', message: 'Browserbase not configured' });
    }

    await bb.sessions.update(req.params.sessionId, { status: 'CLOSED' });
    res.json({ status: 'success', message: 'Session closed' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/api/browser/sessions', async (_req, res) => {
  try {
    if (!bb || !browserbaseProjectId) {
      return res.status(503).json({ status: 'error', message: 'Browserbase not configured' });
    }

    const sessions = await bb.sessions.list({ projectId: browserbaseProjectId });
    res.json({ status: 'success', sessions });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

// --- Startup -----------------------------------------------------------------

app.listen(PORT, async () => {
  // eslint-disable-next-line no-console
  console.log(`[ProxyOS backend] Listening on port ${PORT}`);
  await syncMemoriesOnBoot();
  
  // Telegram bot runs as a standalone adapter — see adapters/telegram.js
  if (process.env.TELEGRAM_BOT_TOKEN) {
    console.log('[ProxyOS backend] TELEGRAM_BOT_TOKEN detected. Use the standalone adapter: node adapters/telegram.js');
  }
  
});
