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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const PORT = process.env.PORT || 7860;

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
const llmProvider = process.env.LLM_PROVIDER || 'nvidia';
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

async function routeToLLM(agentRole, prompt, context, taskType) {
  if (nvidiaApiKey && (llmProvider === 'nvidia' || llmProvider === 'auto')) {
    return callNvidiaAPI(context, prompt);
  }

  if (groq) {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: context ?? '' },
        { role: 'user', content: prompt }
      ],
      model: 'llama3-70b-8192',
      temperature: 0.3,
      max_tokens: 2048
    });
    return completion.choices[0].message.content;
  }

  const useGemini = genAI && (taskType === 'strategy' || taskType === 'deep_reasoning' || prompt.length > 4000);

  if (useGemini) {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent([
      { text: context ?? '' },
      { text: prompt }
    ]);
    return result.response.text();
  }

  if (bonsaiApiKey && llmProvider === 'bonsai') {
    return callBonsaiAPI(context, prompt);
  }

  throw new Error('No LLM provider configured. Set NVIDIA_API_KEY, GROQ_API_KEY, or BONSAI_API_KEY');
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

      const output = await routeToLLM(this.role, prompt, `${soul}\n\n${memory}`, 'code');

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

      const output = await routeToLLM(this.role, prompt, `${soul}\n\n${memory}`, 'research');

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

      const output = await routeToLLM(this.role, prompt, `${soul}\n\n${memory}`, 'strategy');

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
    idempotency_key
  } = req.body ?? {};

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
      idempotency_key
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

// --- Startup -----------------------------------------------------------------

app.listen(PORT, async () => {
  // eslint-disable-next-line no-console
  console.log(`[ProxyOS backend] Listening on port ${PORT}`);
  await syncMemoriesOnBoot();
});

