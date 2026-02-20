import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import nodeCron from "node-cron";
import nodeCache from "node-cache";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Groq } from "groq-sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Browserbase } from "@browserbasehq/sdk";
import { Bot } from "grammy";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 7860;
const cache = new nodeCache({ stdTTL: 300 });

// --- Telegram Configuration ---
const TELEGRAM_ENABLED = process.env.TELEGRAM_ENABLED !== "false";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_RATE_LIMIT = parseInt(process.env.TELEGRAM_RATE_LIMIT || "20");
const TELEGRAM_GROUPS_ENABLED = process.env.TELEGRAM_GROUPS_ENABLED === "true";
const TELEGRAM_GROUP_MENTION_ONLY =
  process.env.TELEGRAM_GROUP_MENTION_ONLY === "true";
const TELEGRAM_ALLOWED_USERS = (process.env.TELEGRAM_ALLOWED_USERS || "")
  .split(",")
  .filter((id) => id.trim())
  .map((id) => id.trim());
const TELEGRAM_ADMIN_USERS = (process.env.TELEGRAM_ADMIN_USERS || "")
  .split(",")
  .filter((id) => id.trim())
  .map((id) => id.trim());

// --- In-Memory Context Storage ---
const userContexts = new Map();
const userProviders = new Map();
const userMessageCounts = new Map();

function saveContext(key, context) {
  userContexts.set(key, {
    ...context,
    updatedAt: new Date().toISOString(),
  });
}

function getContext(key) {
  return userContexts.get(key) || { messages: [], provider: "nvidia" };
}

function clearContext(key) {
  userContexts.delete(key);
}

function isAdmin(userId) {
  return TELEGRAM_ADMIN_USERS.includes(String(userId));
}

// Rate limiting reset
setInterval(() => {
  userMessageCounts.clear();
}, 60000);

// --- OpenClaw Cloud Fallback ---
const OPENCLOUD_API_URL =
  process.env.OPENCLOUD_API_URL ||
  "https://taz7770-proxyos-openclaw.hf.space/api/agent";

async function callOpenCloudAPI(message, context = []) {
  const response = await fetch(OPENCLOUD_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      context: context.slice(-10),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenClaw cloud error: ${response.status}`);
  }

  return response.json();
}

// --- Provider Failover Manager ---
class ProviderFailoverManager {
  constructor() {
    this.providers = [
      {
        name: "nvidia",
        priority: 1,
        healthy: true,
        enabled: true,
        circuitBreaker: { state: "closed", failures: 0 },
      },
      {
        name: "groq",
        priority: 2,
        healthy: true,
        enabled: true,
        circuitBreaker: { state: "closed", failures: 0 },
      },
      {
        name: "zai",
        priority: 3,
        healthy: true,
        enabled: true,
        circuitBreaker: { state: "closed", failures: 0 },
      },
      {
        name: "opencode",
        priority: 4,
        healthy: true,
        enabled: true,
        circuitBreaker: { state: "closed", failures: 0 },
      },
      {
        name: "openrouter",
        priority: 5,
        healthy: true,
        enabled: true,
        circuitBreaker: { state: "closed", failures: 0 },
      },
    ];
    this.currentProvider = "nvidia";
  }

  getProviderStatus() {
    return this.providers;
  }

  async checkProviderHealth(providerName) {
    const provider = this.providers.find((p) => p.name === providerName);
    if (!provider) return false;

    try {
      // Basic health check - in production would make actual API call
      provider.healthy = true;
      provider.circuitBreaker.state = "closed";
      return true;
    } catch (e) {
      provider.healthy = false;
      provider.circuitBreaker.failures++;
      if (provider.circuitBreaker.failures > 3) {
        provider.circuitBreaker.state = "open";
      }
      return false;
    }
  }

  async failover() {
    for (const p of this.providers) {
      if (p.enabled && p.healthy && p.circuitBreaker.state !== "open") {
        this.currentProvider = p.name;
        return p.name;
      }
    }
    return "opencloud";
  }
}

const llmFailover = new ProviderFailoverManager();

async function checkAllProviders() {
  const results = [];
  for (const provider of llmFailover.providers) {
    const healthy = await llmFailover.checkProviderHealth(provider.name);
    results.push({
      name: provider.name,
      healthy,
      priority: provider.priority,
      enabled: provider.enabled,
    });
  }
  return results;
}

// --- Supabase client --------------------------------------------------------

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn(
    "[ProxyOS backend] SUPABASE_URL or SUPABASE_SERVICE_KEY missing – backend will not function until configured.",
  );
}

const supabase = createClient(supabaseUrl ?? "", supabaseServiceKey ?? "");

// --- LLM clients ------------------------------------------------------------

const groqApiKey = process.env.GROQ_API_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;
const nvidiaApiKey = process.env.NVIDIA_API_KEY;
const bonsaiApiKey = process.env.BONSAI_API_KEY;
const opencodeApiKey = process.env.OPENCODE_API_KEY;
const openrouterApiKey = process.env.OPENROUTER_API_KEY;
const zaiApiKey = process.env.ZAI_API_KEY;
const llmProvider = process.env.LLM_PROVIDER || "nvidia";
const nvidiaModel = process.env.NVIDIA_MODEL || "z-ai/glm5";

const groq = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;
const genAI = geminiApiKey ? new GoogleGenerativeAI(geminiApiKey) : null;

async function callNvidiaAPI(systemContent, userContent) {
  const messages = [];
  if (systemContent) {
    messages.push({ role: "system", content: systemContent });
  }
  messages.push({ role: "user", content: userContent });

  const response = await fetch(
    "https://integrate.api.nvidia.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${nvidiaApiKey}`,
      },
      body: JSON.stringify({
        model: nvidiaModel,
        messages: messages,
        temperature: 0.7,
        top_p: 1,
        max_tokens: 4096,
      }),
    },
  );

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
    messages.push({ role: "system", content: systemContent });
  }
  messages.push({ role: "user", content: userContent });

  const response = await fetch("https://go.trybons.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bonsaiApiKey}`,
    },
    body: JSON.stringify({
      model: "auto",
      messages: messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
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
  if (systemContent) messages.push({ role: "system", content: systemContent });
  messages.push({ role: "user", content: userContent });

  const response = await fetch("https://api.opencode.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": opencodeApiKey,
    },
    body: JSON.stringify({
      model: "opencode/default",
      messages,
      temperature: 0.7,
      max_tokens: 4096,
    }),
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
  if (systemContent) messages.push({ role: "system", content: systemContent });
  messages.push({ role: "user", content: userContent });

  const response = await fetch(
    "https://api.z.ai/api/coding/paas/v4/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${zaiApiKey}`,
      },
      body: JSON.stringify({
        model: "GLM-4.7-Flash",
        messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Z.ai API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callOpenRouterAPI(systemContent, userContent) {
  const messages = [];
  if (systemContent) messages.push({ role: "system", content: systemContent });
  messages.push({ role: "user", content: userContent });

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openrouterApiKey}`,
        "HTTP-Referer": "https://taz7770-proxyos-backend.hf.space",
        "X-Title": "ProxyOS Backend",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3.5-sonnet",
        messages,
        temperature: 0.7,
        max_tokens: 4096,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// --- Unified LLM Call with Failover ---
async function unifiedLLMCall(
  message,
  preferredProvider = null,
  contextMessages = [],
) {
  const providers = ["nvidia", "groq", "zai", "opencode", "openrouter"];
  const systemPrompt = contextMessages
    .slice(-10)
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  for (const provider of providers) {
    if (preferredProvider && provider !== preferredProvider) continue;

    try {
      let result;
      switch (provider) {
        case "nvidia":
          if (nvidiaApiKey) result = await callNvidiaAPI(systemPrompt, message);
          break;
        case "groq":
          if (groq) {
            const completion = await groq.chat.completions.create({
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message },
              ],
              model: "llama-3.3-70b-versatile",
              temperature: 0.3,
              max_tokens: 2048,
            });
            result = completion.choices[0].message.content;
          }
          break;
        case "zai":
          if (zaiApiKey) result = await callZaiAPI(systemPrompt, message);
          break;
        case "opencode":
          if (opencodeApiKey)
            result = await callOpenCodeAPI(systemPrompt, message);
          break;
        case "openrouter":
          if (openrouterApiKey)
            result = await callOpenRouterAPI(systemPrompt, message);
          break;
      }

      if (result) {
        console.log(`[ProxyOS] LLM call succeeded with provider: ${provider}`);
        return { response: result, provider };
      }
    } catch (e) {
      console.error(`[ProxyOS] Provider ${provider} failed:`, e.message);
    }
  }

  console.log("[ProxyOS] Falling back to OpenClaw cloud...");
  try {
    return await callOpenCloudAPI(message, contextMessages);
  } catch (cloudError) {
    console.error("[ProxyOS] OpenClaw cloud failed:", cloudError.message);
    throw new Error("All LLM providers failed");
  }
}

async function routeToLLM(
  agentRole,
  prompt,
  context,
  taskType,
  selectedProvider,
) {
  const provider = selectedProvider || "nvidia";

  switch (provider) {
    case "nvidia":
      if (nvidiaApiKey) {
        try {
          return await callNvidiaAPI(context, prompt);
        } catch (e) {
          console.error(
            "[ProxyOS] Nvidia API failed, trying fallback:",
            e.message,
          );
        }
      }
      break;
    case "groq":
      if (groq) {
        try {
          const completion = await groq.chat.completions.create({
            messages: [
              { role: "system", content: context ?? "" },
              { role: "user", content: prompt },
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.3,
            max_tokens: 2048,
          });
          return completion.choices[0].message.content;
        } catch (e) {
          console.error("[ProxyOS] Groq API failed:", e.message);
        }
      }
      break;
    case "opencode":
      if (opencodeApiKey) {
        try {
          return await callOpenCodeAPI(context, prompt);
        } catch (e) {
          console.error("[ProxyOS] OpenCode API failed:", e.message);
        }
      }
      break;
    case "zai":
      if (zaiApiKey) {
        try {
          return await callZaiAPI(context, prompt);
        } catch (e) {
          console.error("[ProxyOS] Z.ai API failed:", e.message);
        }
      }
      break;
    case "openrouter":
      if (openrouterApiKey) {
        try {
          return await callOpenRouterAPI(context, prompt);
        } catch (e) {
          console.error("[ProxyOS] OpenRouter API failed:", e.message);
        }
      }
      break;
  }

  if (nvidiaApiKey) {
    try {
      return await callNvidiaAPI(context, prompt);
    } catch (e) {
      console.error("[ProxyOS] Nvidia API failed, trying fallback:", e.message);
    }
  }

  if (groq) {
    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: context ?? "" },
          { role: "user", content: prompt },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.3,
        max_tokens: 2048,
      });
      return completion.choices[0].message.content;
    } catch (e) {
      console.error("[ProxyOS] Groq API failed:", e.message);
    }
  }

  const useGemini =
    genAI && (taskType === "strategy" || taskType === "deep_reasoning");

  if (useGemini) {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent([
      { text: context ?? "" },
      { text: prompt },
    ]);
    return result.response.text();
  }

  throw new Error("No LLM provider available");
}

// --- Memory sync ------------------------------------------------------------

async function syncMemoriesOnBoot() {
  try {
    const { data, error } = await supabase.from("agent_memories").select("*");
    if (error) throw error;
    if (!data) return;

    for (const agent of data) {
      const agentDir = path.join(__dirname, "agents", agent.agent_role);
      await fs.mkdir(agentDir, { recursive: true });
      await fs.writeFile(path.join(agentDir, "soul.md"), agent.soul_markdown);
      await fs.writeFile(
        path.join(agentDir, "memory.md"),
        agent.memory_markdown,
      );
    }

    console.log(
      "[ProxyOS backend] Memories synced for agents:",
      data.map((a) => a.agent_role),
    );
  } catch (err) {
    console.error("[ProxyOS backend] Failed to sync memories:", err.message);
  }
}

async function persistMemory(agentRole, memoryContent) {
  try {
    await supabase
      .from("agent_memories")
      .update({
        memory_markdown: memoryContent,
        last_updated: new Date().toISOString(),
      })
      .eq("agent_role", agentRole);
  } catch (err) {
    console.error(
      `[ProxyOS backend] Failed to persist memory for ${agentRole}:`,
      err.message,
    );
  }
}

// --- Agent implementations ---------------------------------------------------

class AgentMinion {
  constructor() {
    this.role = "minion";
  }

  async execute(task) {
    const started = Date.now();
    let provider = "nvidia";
    try {
      const { data: contextRow } = await supabase
        .from("proxy_context")
        .select("metadata")
        .eq("id", task.context_id)
        .single();
      if (contextRow?.metadata?.provider) {
        provider = contextRow.metadata.provider;
      }
    } catch (e) {}

    try {
      const dir = path.join(__dirname, "agents", "minion");
      const soul = await fs.readFile(path.join(dir, "soul.md"), "utf8");
      const memory = await fs.readFile(path.join(dir, "memory.md"), "utf8");

      const prompt = `
TASK: ${task.task_description}

Execute this as the Minion (coder / automation engine).
Return only:
- Shell commands (if any)
- Code blocks (if any)
- Deployment notes
Do not include conversational filler.`;

      const output = await routeToLLM(
        this.role,
        prompt,
        `${soul}\n\n${memory}`,
        "code",
        provider,
      );

      const newMemory =
        memory +
        `\n\n## Execution ${new Date().toISOString()}\n- Task: ${task.task_description}\n- Status: completed\n`;
      await fs.writeFile(path.join(dir, "memory.md"), newMemory);
      await persistMemory("minion", newMemory);

      return {
        status: "success",
        output,
        execution_time: Date.now() - started,
      };
    } catch (err) {
      return {
        status: "failed",
        error: err.message,
        execution_time: Date.now() - started,
      };
    }
  }
}

class AgentScout {
  constructor() {
    this.role = "scout";
  }

  async execute(task) {
    const started = Date.now();
    let provider = "nvidia";
    try {
      const { data: contextRow } = await supabase
        .from("proxy_context")
        .select("metadata")
        .eq("id", task.context_id)
        .single();
      if (contextRow?.metadata?.provider) {
        provider = contextRow.metadata.provider;
      }
    } catch (e) {}

    try {
      const dir = path.join(__dirname, "agents", "scout");
      const soul = await fs.readFile(path.join(dir, "soul.md"), "utf8");
      const memory = await fs.readFile(path.join(dir, "memory.md"), "utf8");

      const prompt = `
RESEARCH TASK: ${task.task_description}

Return structured findings:
- Markdown tables
- Bullet-point insights
- Citations / URLs (plain text)
`;

      const output = await routeToLLM(
        this.role,
        prompt,
        `${soul}\n\n${memory}`,
        "research",
        provider,
      );

      const newMemory =
        memory +
        `\n\n## Research ${new Date().toISOString()}\n- Query: ${task.task_description}\n- Notes captured.\n`;
      await fs.writeFile(path.join(dir, "memory.md"), newMemory);
      await persistMemory("scout", newMemory);

      return {
        status: "success",
        output,
        execution_time: Date.now() - started,
      };
    } catch (err) {
      return {
        status: "failed",
        error: err.message,
        execution_time: Date.now() - started,
      };
    }
  }
}

class AgentSage {
  constructor() {
    this.role = "sage";
  }

  async execute(task) {
    const started = Date.now();
    let provider = "nvidia";
    try {
      const { data: contextRow } = await supabase
        .from("proxy_context")
        .select("metadata")
        .eq("id", task.context_id)
        .single();
      if (contextRow?.metadata?.provider) {
        provider = contextRow.metadata.provider;
      }
    } catch (e) {}

    try {
      const dir = path.join(__dirname, "agents", "sage");
      const soul = await fs.readFile(path.join(dir, "soul.md"), "utf8");
      const memory = await fs.readFile(path.join(dir, "memory.md"), "utf8");

      const ctx = [];
      if (task.context_id) {
        const { data: contextRow } = await supabase
          .from("proxy_context")
          .select("*")
          .eq("id", task.context_id)
          .single();
        if (contextRow?.raw_input) ctx.push(contextRow.raw_input);
      }

      const prompt = `
REVIEW TASK: ${task.task_description}

CONTEXT:
${ctx.join("\n\n")}

Respond with:
- PASS or NEEDS_WORK
- Specific issues
- Concrete improvements
- Any cross-country / scaling considerations
`;

      const output = await routeToLLM(
        this.role,
        prompt,
        `${soul}\n\n${memory}`,
        "strategy",
        provider,
      );

      const verdict = output.includes("PASS") ? "PASS" : "NEEDS_WORK";
      const newMemory =
        memory +
        `\n\n## Review ${new Date().toISOString()}\n- Task: ${task.task_description}\n- Verdict: ${verdict}\n`;
      await fs.writeFile(path.join(dir, "memory.md"), newMemory);
      await persistMemory("sage", newMemory);

      return {
        status: "success",
        output,
        execution_time: Date.now() - started,
      };
    } catch (err) {
      return {
        status: "failed",
        error: err.message,
        execution_time: Date.now() - started,
      };
    }
  }
}

const agents = {
  minion: new AgentMinion(),
  scout: new AgentScout(),
  sage: new AgentSage(),
};

// --- Task processing ---------------------------------------------------------

async function processTask(taskId) {
  const { data: task, error } = await supabase
    .from("agent_tasks")
    .select("*")
    .eq("id", taskId)
    .single();

  if (error || !task) {
    console.error("[ProxyOS backend] Task not found:", taskId, error?.message);
    return;
  }

  await supabase
    .from("agent_tasks")
    .update({ status: "working", updated_at: new Date().toISOString() })
    .eq("id", taskId);

  await supabase.from("execution_logs").insert({
    task_id: taskId,
    agent_role: task.agent_role,
    log_type: "info",
    message: `Starting execution: ${task.task_description}`,
  });

  const agent = agents[task.agent_role];
  if (!agent) return;

  const result = await agent.execute(task);

  await supabase
    .from("agent_tasks")
    .update({
      status: result.status,
      output_log: result.output ?? result.error ?? null,
      execution_time_ms: result.execution_time,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId);

  await supabase.from("execution_logs").insert({
    task_id: taskId,
    agent_role: task.agent_role,
    log_type: result.status === "success" ? "success" : "error",
    message: result.status === "success" ? "Execution completed" : result.error,
    metadata: result,
  });
}

async function processQueue() {
  const { data: pending, error } = await supabase
    .from("agent_tasks")
    .select("*")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(5);

  if (error || !pending?.length) return;

  for (const task of pending) {
    const { data: activeForAgent } = await supabase
      .from("agent_tasks")
      .select("id")
      .eq("agent_role", task.agent_role)
      .eq("status", "working")
      .limit(1);

    if (!activeForAgent || activeForAgent.length === 0) {
      void processTask(task.id);
    }
  }
}

nodeCron.schedule("*/10 * * * * *", processQueue);
nodeCron.schedule("*/15 * * * * *", checkContextCompletion);

async function checkContextCompletion() {
  const { data: pendingDeliveries } = await supabase
    .from("outbound_deliveries")
    .select("context_id")
    .eq("status", "pending")
    .eq("payload", "");

  if (!pendingDeliveries?.length) return;

  for (const delivery of pendingDeliveries) {
    const { data: tasks } = await supabase
      .from("agent_tasks")
      .select("status, output_log, agent_role")
      .eq("context_id", delivery.context_id);

    if (!tasks?.length) continue;

    const allDone = tasks.every((t) =>
      ["success", "failed", "halted"].includes(t.status),
    );

    if (!allDone) continue;

    const aggregatedText = tasks
      .filter((t) => t.status === "success" && t.output_log)
      .map((t) => `[${t.agent_role.toUpperCase()}]: ${t.output_log}`)
      .join("\n\n");

    const fallbackText =
      aggregatedText || "[ProxyOS] Tasks completed with no output.";

    await supabase
      .from("outbound_deliveries")
      .update({
        payload: fallbackText,
        updated_at: new Date().toISOString(),
      })
      .eq("context_id", delivery.context_id)
      .eq("status", "pending");
  }
}

// --- API routes --------------------------------------------------------------

app.get("/", (_req, res) => {
  res.json({
    status: "ProxyOS Swarm Online",
    agents: Object.keys(agents),
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", async (_req, res) => {
  try {
    const { error } = await supabase.from("proxy_stats").select("id").limit(1);
    if (error) throw error;
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: "degraded", error: err.message });
  }
});

app.get("/api/providers", (_req, res) => {
  const providerStatus = llmFailover.getProviderStatus();

  res.json({
    providers: providerStatus.map((p) => ({
      ...p,
      model:
        p.name === "nvidia"
          ? "nvidia/llama-3.1-nemotron-70b-instruct"
          : p.name === "groq"
            ? "llama-3.3-70b-versatile"
            : p.name === "zai"
              ? "GLM-4.7-Flash"
              : p.name === "opencode"
                ? "opencode/default"
                : p.name === "openrouter"
                  ? "anthropic/claude-3.5-sonnet"
                  : "gpt-4o",
    })),
    fallback: {
      url: OPENCLOUD_API_URL,
      enabled: true,
    },
    config_source: "unified-llm-router",
    failover_manager: {
      current_provider: llmFailover.currentProvider,
      initialized: true,
    },
  });
});

app.get("/api/providers/health", async (_req, res) => {
  try {
    const healthResults = await checkAllProviders();
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      providers: healthResults,
    });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

app.post("/api/llm", async (req, res) => {
  const { message, provider, context } = req.body ?? {};

  if (!message) {
    return res
      .status(400)
      .json({ status: "error", message: "message is required" });
  }

  try {
    const contextMessages = Array.isArray(context) ? context : [];
    const result = await unifiedLLMCall(message, provider, contextMessages);
    res.json({
      status: "success",
      ...result,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/feed-context", async (req, res) => {
  const {
    raw_input,
    input_type = "text",
    project_tag,
    metadata = {},
  } = req.body ?? {};

  if (!raw_input || typeof raw_input !== "string") {
    return res
      .status(400)
      .json({ status: "error", message: "raw_input is required" });
  }

  try {
    const energyGained = Math.min(
      Math.max(Math.floor(raw_input.length / 10), 5),
      50,
    );

    const { data: contextRow, error: ctxError } = await supabase
      .from("proxy_context")
      .insert({
        raw_input,
        input_type,
        project_tag,
        metadata,
        energy_gained: energyGained,
      })
      .select()
      .single();

    if (ctxError) throw ctxError;

    try {
      await supabase.rpc("increment_proxy_energy", {
        energy_amount: energyGained,
      });
    } catch (e) {}

    const delegation = await analyzeAndDelegate(
      raw_input,
      contextRow.id,
      project_tag,
    );

    return res.json({
      status: "success",
      context_id: contextRow.id,
      delegation,
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

async function analyzeAndDelegate(raw_input, contextId, projectTag) {
  const input = raw_input.toLowerCase();
  const delegations = [];

  if (
    input.includes("code") ||
    input.includes("deploy") ||
    input.includes("github") ||
    input.includes("schema") ||
    input.includes("api")
  ) {
    const { data } = await supabase
      .from("agent_tasks")
      .insert({
        context_id: contextId,
        agent_role: "minion",
        task_description: raw_input,
        task_type: "code",
        project_tag: projectTag,
        priority: 8,
      })
      .select()
      .single();
    if (data) delegations.push({ agent: "minion", task_id: data.id });
  }

  if (
    input.includes("research") ||
    input.includes("find") ||
    input.includes("scrape") ||
    input.includes("supplier") ||
    input.includes("market") ||
    input.includes("competitor")
  ) {
    const { data } = await supabase
      .from("agent_tasks")
      .insert({
        context_id: contextId,
        agent_role: "scout",
        task_description: raw_input,
        task_type: "research",
        project_tag: projectTag,
        priority: 7,
      })
      .select()
      .single();
    if (data) delegations.push({ agent: "scout", task_id: data.id });
  }

  if (
    input.includes("review") ||
    input.includes("strategy") ||
    input.includes("qa") ||
    input.includes("polish") ||
    input.includes("analyze") ||
    input.includes("validate")
  ) {
    const { data } = await supabase
      .from("agent_tasks")
      .insert({
        context_id: contextId,
        agent_role: "sage",
        task_description: raw_input,
        task_type: "strategy",
        project_tag: projectTag,
        priority: 9,
      })
      .select()
      .single();
    if (data) delegations.push({ agent: "sage", task_id: data.id });
  }

  if (delegations.length === 0) {
    const { data } = await supabase
      .from("agent_tasks")
      .insert({
        context_id: contextId,
        agent_role: "scout",
        task_description: `Research and analyze: ${raw_input}`,
        task_type: "research",
        project_tag: projectTag,
        priority: 5,
      })
      .select()
      .single();
    if (data) delegations.push({ agent: "scout", task_id: data.id });
  }

  return delegations;
}

app.get("/api/swarm-status", async (_req, res) => {
  try {
    const { data: tasks } = await supabase
      .from("agent_tasks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: stats } = await supabase
      .from("proxy_stats")
      .select("*")
      .limit(1)
      .maybeSingle();

    res.json({
      tasks: tasks ?? [],
      proxy_stats: stats ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/assign-task", async (req, res) => {
  const {
    agent_role,
    task_description,
    project_tag,
    priority = 5,
  } = req.body ?? {};
  if (!agent_role || !task_description) {
    return res
      .status(400)
      .json({ error: "agent_role and task_description required" });
  }

  try {
    const { data, error } = await supabase
      .from("agent_tasks")
      .insert({
        agent_role,
        task_description,
        project_tag,
        priority,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw error;
    return res.json({ status: "success", task: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/halt-task/:taskId", async (req, res) => {
  const { taskId } = req.params;
  try {
    await supabase
      .from("agent_tasks")
      .update({ status: "halted", updated_at: new Date().toISOString() })
      .eq("id", taskId);
    return res.json({ status: "success", message: "Task halted" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/memories/:agentRole", async (req, res) => {
  const { agentRole } = req.params;
  try {
    const { data, error } = await supabase
      .from("agent_memories")
      .select("*")
      .eq("agent_role", agentRole)
      .single();
    if (error) throw error;
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/inbound-message", async (req, res) => {
  const {
    raw_input,
    channel,
    channel_user_id,
    reply_metadata = {},
    project_tag,
    idempotency_key,
    provider,
    enable_context = true,
  } = req.body ?? {};

  const selectedProvider = provider || "nvidia";

  if (!raw_input || typeof raw_input !== "string") {
    return res
      .status(400)
      .json({ status: "error", message: "raw_input is required" });
  }

  if (!channel || typeof channel !== "string") {
    return res
      .status(400)
      .json({ status: "error", message: "channel is required" });
  }

  if (!channel_user_id || typeof channel_user_id !== "string") {
    return res
      .status(400)
      .json({ status: "error", message: "channel_user_id is required" });
  }

  try {
    const key = `${channel_user_id}`;
    const userContext = getContext(key);

    if (enable_context) {
      userContext.messages.push({ role: "user", content: raw_input });

      if (userContext.messages.length > 20) {
        userContext.messages = userContext.messages.slice(-20);
      }
      userContext.provider = selectedProvider;
    }

    if (idempotency_key) {
      const { data: existing } = await supabase
        .from("proxy_context")
        .select("id")
        .eq("metadata->idempotency_key", idempotency_key)
        .maybeSingle();

      if (existing) {
        return res.json({
          status: "success",
          context_id: existing.id,
          message: "Context already exists (idempotent)",
        });
      }
    }

    const energyGained = Math.min(
      Math.max(Math.floor(raw_input.length / 10), 5),
      50,
    );

    const metadata = {
      reply_address: {
        channel,
        channel_user_id,
        ...reply_metadata,
      },
      idempotency_key,
      provider: selectedProvider,
    };

    const { data: contextRow, error: ctxError } = await supabase
      .from("proxy_context")
      .insert({
        raw_input,
        input_type: "text",
        project_tag,
        metadata,
        energy_gained: energyGained,
      })
      .select()
      .single();

    if (ctxError) throw ctxError;

    try {
      await supabase.rpc("increment_proxy_energy", {
        energy_amount: energyGained,
      });
    } catch (e) {}

    const { error: deliveryError } = await supabase
      .from("outbound_deliveries")
      .insert({
        context_id: contextRow.id,
        channel,
        channel_user_id,
        channel_extra: reply_metadata,
        payload: "",
        status: "pending",
      });

    if (deliveryError) {
      console.error(
        "[ProxyOS backend] Failed to create delivery row:",
        deliveryError.message,
      );
    }

    let llmResponse = null;
    if (enable_context && userContext.messages.length > 0) {
      try {
        llmResponse = await unifiedLLMCall(
          raw_input,
          selectedProvider,
          userContext.messages,
        );

        if (llmResponse && llmResponse.response) {
          userContext.messages.push({
            role: "assistant",
            content: llmResponse.response,
          });

          if (userContext.messages.length > 20) {
            userContext.messages = userContext.messages.slice(-20);
          }
        }
      } catch (llmError) {
        console.error("[ProxyOS] LLM call failed:", llmError.message);
      }
    }

    saveContext(key, userContext);

    const delegation = await analyzeAndDelegate(
      raw_input,
      contextRow.id,
      project_tag,
    );

    // If channel is telegram and we have a valid LLM response, reply immediately.
    // This allows webhooks hitting /api/inbound-message to receive instant replies.
    if (channel === "telegram" && llmResponse && llmResponse.response && TELEGRAM_BOT_TOKEN) {
      try {
        const telegramBot = new Bot(TELEGRAM_BOT_TOKEN);
        const chatId = reply_metadata.chat_id || channel_user_id;
        const threadTs = reply_metadata.thread_ts;
        
        const replyOptions = {};
        if (threadTs) {
          replyOptions.message_thread_id = threadTs;
        }

        let replyText = llmResponse.response;
        if (replyText.length > 4000) {
          replyText = replyText.substring(0, 3950) + "\n\n... (truncated)";
        }
        
        await telegramBot.api.sendMessage(chatId, replyText, replyOptions);
        await markDeliverySent(contextRow.id);
        console.log(`[Telegram Webhook] Sent direct reply to ${chatId}`);
      } catch (e) {
        console.error("[Telegram Webhook] Failed to send direct reply:", e.message);
      }
    }

    return res.json({
      status: "success",
      context_id: contextRow.id,
      delegation,
      llm_response: llmResponse ? llmResponse.response : null,
      provider: llmResponse ? llmResponse.provider : null,
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/user-context/:userId", (req, res) => {
  const { userId } = req.params;
  const context = getContext(userId);
  res.json({
    user_id: userId,
    message_count: context.messages.length,
    provider: context.provider,
    updated_at: context.updatedAt,
    messages: context.messages.slice(-5),
  });
});

app.delete("/api/user-context/:userId", (req, res) => {
  const { userId } = req.params;
  clearContext(userId);
  res.json({
    status: "success",
    message: `Context cleared for user ${userId}`,
  });
});

app.get("/api/context/:id/status", async (req, res) => {
  const { id } = req.params;

  try {
    const { data: context, error: ctxError } = await supabase
      .from("proxy_context")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (ctxError) throw ctxError;
    if (!context) {
      return res
        .status(404)
        .json({ status: "error", message: "Context not found" });
    }

    const { data: tasks, error: tasksError } = await supabase
      .from("agent_tasks")
      .select("status")
      .eq("context_id", id);

    if (tasksError) throw tasksError;

    const total = tasks?.length ?? 0;
    const done =
      tasks?.filter((t) => ["success", "failed", "halted"].includes(t.status))
        .length ?? 0;
    const working = tasks?.filter((t) => t.status === "working").length ?? 0;

    let status = "pending";
    if (total === 0) {
      status = "pending";
    } else if (done === total) {
      status = "completed";
    } else if (working > 0) {
      status = "working";
    }

    return res.json({
      context_id: id,
      status,
      tasks_done: done,
      tasks_total: total,
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/context/:id/result", async (req, res) => {
  const { id } = req.params;

  try {
    const { data: context, error: ctxError } = await supabase
      .from("proxy_context")
      .select("id, raw_input")
      .eq("id", id)
      .maybeSingle();

    if (ctxError) throw ctxError;
    if (!context) {
      return res
        .status(404)
        .json({ status: "error", message: "Context not found" });
    }

    const { data: tasks, error: tasksError } = await supabase
      .from("agent_tasks")
      .select("status, output_log, agent_role, execution_time_ms")
      .eq("context_id", id);

    if (tasksError) throw tasksError;

    const total = tasks?.length ?? 0;
    const done =
      tasks?.filter((t) => ["success", "failed", "halted"].includes(t.status))
        .length ?? 0;

    if (total === 0 || done < total) {
      return res.status(202).json({
        context_id: id,
        status: "pending",
        message: "Tasks still processing",
        tasks_done: done,
        tasks_total: total,
      });
    }

    const { data: delivery } = await supabase
      .from("outbound_deliveries")
      .select("payload")
      .eq("context_id", id)
      .maybeSingle();

    const outputs = tasks.map((t) => ({
      agent_role: t.agent_role,
      status: t.status,
      output_log: t.output_log,
      execution_time_ms: t.execution_time_ms,
    }));

    const aggregatedText =
      delivery?.payload ||
      tasks
        .filter((t) => t.status === "success" && t.output_log)
        .map((t) => `[${t.agent_role.toUpperCase()}]: ${t.output_log}`)
        .join("\n\n");

    return res.json({
      context_id: id,
      status: "completed",
      summary: context.raw_input,
      outputs,
      aggregated_text: aggregatedText,
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

// --- Browserbase Browser Sessions --------------------------------------------

const browserbaseApiKey = process.env.BROWSERBASE_API_KEY;
const browserbaseProjectId = process.env.BROWSERBASE_PROJECT_ID;
const bb = browserbaseApiKey
  ? new Browserbase({ apiKey: browserbaseApiKey })
  : null;

app.post("/api/browser/create-session", async (req, res) => {
  try {
    if (!bb || !browserbaseProjectId) {
      return res.status(503).json({
        status: "error",
        message:
          "Browserbase not configured. Set BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID.",
      });
    }

    const { browserSettings } = req.body || {};

    const session = await bb.sessions.create({
      projectId: browserbaseProjectId,
      browserSettings: browserSettings || {
        fingerprint: {
          browsers: ["chrome"],
          devices: ["desktop"],
          operatingSystems: ["macos"],
        },
      },
    });

    res.json({
      status: "success",
      session: {
        id: session.id,
        connectUrl: `wss://connect.browserbase.com?sessionId=${session.id}`,
        pageUrl: session.pageUrl,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/browser/session/:sessionId", async (req, res) => {
  try {
    if (!bb) {
      return res
        .status(503)
        .json({ status: "error", message: "Browserbase not configured" });
    }

    const session = await bb.sessions.retrieve(req.params.sessionId);
    res.json({ status: "success", session });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.delete("/api/browser/session/:sessionId", async (req, res) => {
  try {
    if (!bb) {
      return res
        .status(503)
        .json({ status: "error", message: "Browserbase not configured" });
    }

    await bb.sessions.update(req.params.sessionId, { status: "CLOSED" });
    res.json({ status: "success", message: "Session closed" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/browser/sessions", async (_req, res) => {
  try {
    if (!bb || !browserbaseProjectId) {
      return res
        .status(503)
        .json({ status: "error", message: "Browserbase not configured" });
    }

    const sessions = await bb.sessions.list({
      projectId: browserbaseProjectId,
    });
    res.json({ status: "success", sessions });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// --- Startup -----------------------------------------------------------------

app.listen(PORT, async () => {
  console.log(`[ProxyOS backend] Listening on port ${PORT}`);
  await syncMemoriesOnBoot();

  if (TELEGRAM_ENABLED && TELEGRAM_BOT_TOKEN) {
    startTelegramBot();
  }

  // Tailscale can be enabled by uncommenting and setting TS_AUTH_KEY
  // startTailscale();
});

async function startTailscale() {
  const tsAuthKey = process.env.TS_AUTH_KEY;
  const tsHostname = process.env.TS_HOSTNAME || "proxyos-backend";

  if (!tsAuthKey) {
    console.log("⚠️ Tailscale auth key not configured (TS_AUTH_KEY env var)");
    console.log("   To enable Tailscale, set TS_AUTH_KEY environment variable");
    return;
  }

  try {
    console.log("🔄 Starting Tailscale...");
    const { exec } = await import("child_process");

    await new Promise((resolve, reject) => {
      exec(
        `tailscale up --authkey=${tsAuthKey} --hostname=${tsHostname}`,
        (error, stdout, stderr) => {
          if (error) {
            console.error("❌ Tailscale failed to start:", stderr);
            reject(error);
            return;
          }
          console.log("✅ Tailscale started:", stdout.trim());
          resolve(stdout);
        },
      );
    });

    setTimeout(async () => {
      const { exec } = await import("child_process");
      exec("tailscale ip -4", (error, stdout) => {
        if (!error && stdout) {
          console.log(`🌐 Tailscale IP: ${stdout.trim()}`);
        }
      });
    }, 5000);
  } catch (error) {
    console.error("❌ Tailscale initialization error:", error.message);
  }
}

// --- Telegram Bot Integration ------------------------------------------------

function startTelegramBot() {
  const bot = new Bot(TELEGRAM_BOT_TOKEN);

  // Rate limiting middleware
  bot.on("message:text", async (ctx) => {
    const userId = String(ctx.from?.id);
    const now = Date.now();

    // Check allowed users
    if (
      TELEGRAM_ALLOWED_USERS.length > 0 &&
      !TELEGRAM_ALLOWED_USERS.includes(userId)
    ) {
      console.log(`[Telegram] Unauthorized user: ${userId}`);
      return;
    }

    // Check rate limit
    let userData = userMessageCounts.get(userId) || {
      count: 0,
      resetTime: now + 60000,
    };

    if (now > userData.resetTime) {
      userData = { count: 0, resetTime: now + 60000 };
    }

    userData.count++;
    userMessageCounts.set(userId, userData);

    if (userData.count > TELEGRAM_RATE_LIMIT) {
      await ctx.reply("⚠️ Rate limit exceeded. Please wait a moment.");
      return;
    }

    // Check group chat settings
    const isGroup = ctx.chat.type === "group" || ctx.chat.type === "supergroup";

    if (isGroup) {
      if (!TELEGRAM_GROUPS_ENABLED) {
        return;
      }

      if (TELEGRAM_GROUP_MENTION_ONLY) {
        const botUsername = (await ctx.bot.api.getMe()).username;
        const messageText = ctx.message.text || "";
        const mention = `@${botUsername}`;

        if (!messageText.toLowerCase().includes(mention.toLowerCase())) {
          return;
        }
      }
    }

    const chatId = ctx.chat?.id;
    const threadTs = ctx.message?.message_thread_id;
    const text = ctx.message?.text;

    if (!userId || !chatId || !text) return;
    if (text.startsWith("/")) {
      await ctx.reply("Unrecognized command. Send a regular message to talk to the AI, or type /help for options.");
      return;
    }

    try {
      await ctx.replyWithChatAction("typing");

      const selectedProvider = userProviders.get(String(chatId));
      const key = `${chatId}:${userId}`;
      const userContext = getContext(key);

      const result = await sendToProxyOS(
        text,
        userId,
        chatId,
        threadTs,
        selectedProvider,
      );

      let replyText = result.llm_response;

      if (!replyText && result.context_id) {
        const finalResult = await pollForResult(result.context_id);
        if (finalResult && finalResult.aggregated_text) {
          replyText = finalResult.aggregated_text;
        }
      }

      if (!replyText) {
        await ctx.reply(
          "Sorry, I could not process your request. Please try again.",
        );
        return;
      }

      if (replyText.length > 4000) {
        replyText = replyText.substring(0, 3950) + "\n\n... (truncated)";
      }

      const replyOptions = {};
      if (threadTs) {
        replyOptions.message_thread_id = threadTs;
      }

      await ctx.reply(replyText, replyOptions);
      await markDeliverySent(result.context_id);
    } catch (err) {
      console.error("[Telegram] Error:", err.message);
      await ctx.reply(
        "An error occurred while processing your request. Please try again later.",
      );
    }
  });

  // Command: /start
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "👋 Hello! I'm your ProxyOS assistant.\n\n" +
        "Send me any message and I'll delegate it to my AI agents (Minion, Scout, Sage) " +
        "to research, code, analyze, or strategize for you.\n\n" +
        "Commands:\n" +
        "/start - Show this message\n" +
        "/help - Get help\n" +
        "/provider - Set LLM provider\n" +
        "/providers - Show provider status\n" +
        "/reset - Clear conversation history\n" +
        "/settings - Show your settings",
    );
  });

  // Command: /help
  bot.command("help", async (ctx) => {
    await ctx.reply(
      "🤖 ProxyOS AI Office Assistant\n\n" +
        "I have three specialized agents:\n\n" +
        "• Minion: Coding, deployment, APIs, GitHub\n" +
        "• Scout: Research, market analysis, finding info\n" +
        "• Sage: Strategy, QA, reviews, validation\n\n" +
        "Available providers:\n" +
        "• nvidia - NVIDIA GLM-5 (fast, recommended)\n" +
        "• groq - Groq Llama (fast, free tier)\n" +
        "• zai - Z.ai GLM-4 (free)\n" +
        "• opencode - OpenCode (experimental)\n" +
        "• openrouter - OpenRouter (multi-model)\n\n" +
        "Just send me a message describing what you need!",
    );
  });

  // Command: /provider
  bot.command("provider", async (ctx) => {
    const args = ctx.message.text.split(" ").slice(1);
    const chatId = String(ctx.chat.id);

    if (args.length === 0) {
      const current = userProviders.get(chatId) || "nvidia";
      await ctx.reply(
        `Current provider: ${current}\n\n` +
          "Available providers:\n" +
          "• nvidia - NVIDIA GLM-5 (fast, recommended)\n" +
          "• groq - Groq Llama (fast, free tier)\n" +
          "• zai - Z.ai GLM-4 (free)\n" +
          "• opencode - OpenCode (experimental)\n" +
          "• openrouter - OpenRouter (multi-model)\n\n" +
          "Use: /provider <name> to switch",
      );
      return;
    }

    const provider = args[0].toLowerCase();
    const validProviders = ["nvidia", "groq", "zai", "opencode", "openrouter"];

    if (!validProviders.includes(provider)) {
      await ctx.reply(
        `Invalid provider: ${provider}\nValid: ${validProviders.join(", ")}`,
      );
      return;
    }

    userProviders.set(chatId, provider);
    await ctx.reply(`Provider set to: ${provider}`);
  });

  // Command: /providers
  bot.command("providers", async (ctx) => {
    try {
      const response = await fetch(
        `${process.env.PROXYOS_BACKEND_URL || `http://localhost:${PORT}`}/api/providers`,
      );
      const data = await response.json();

      let message = "🔌 *Available Providers:*\n\n";
      for (const p of data.providers) {
        const status = p.healthy ? "✅" : "❌";
        const enabled = p.enabled ? "" : " (disabled)";
        message += `${status} *${p.name}*${enabled}\n`;
        message += `   Priority: ${p.priority}\n`;
        message += `   Model: ${p.model}\n\n`;
      }

      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
      await ctx.reply("Could not fetch provider status. Try again later.");
    }
  });

  // Command: /reset - Clear conversation history
  bot.command("reset", async (ctx) => {
    const userId = String(ctx.from?.id);
    const chatId = String(ctx.chat.id);
    const key = `${chatId}:${userId}`;

    // Clear from memory
    userContexts.delete(key);
    userProviders.delete(chatId);

    // Try to clear from Supabase if available
    if (supabase) {
      try {
        await supabase.from("user_contexts").delete().eq("user_id", key);
      } catch (e) {
        // Table might not exist, ignore
      }
    }

    await ctx.reply("✅ Conversation history cleared. Starting fresh!");
  });

  // Command: /settings - Show and update user settings
  bot.command("settings", async (ctx) => {
    const userId = String(ctx.from?.id);
    const chatId = String(ctx.chat.id);
    const key = `${chatId}:${userId}`;

    const currentProvider = userProviders.get(chatId) || "nvidia";
    const context = userContexts.get(key);
    const messageCount = context?.messages?.length || 0;

    await ctx.reply(
      `⚙️ *Your Settings*\n\n` +
        `Provider: \`${currentProvider}\`\n` +
        `Messages in context: ${messageCount}\n\n` +
        `Available providers:\n` +
        `• nvidia - Fast, recommended\n` +
        `• groq - Fast, free tier\n` +
        `• zai - Free\n` +
        `• opencode - Experimental\n` +
        `• openrouter - Multi-model\n\n` +
        `Change with: /provider <name>`,
      { parse_mode: "Markdown" },
    );
  });

  bot.catch((err) => {
    console.error("[Telegram] Bot error:", err);
  });

  bot.start();
  console.log("[Telegram Bot] Started successfully");
}

async function sendToProxyOS(
  rawInput,
  channelUserId,
  chatId,
  threadTs = null,
  selectedProvider = null,
) {
  const replyMetadata = {
    chat_id: chatId,
  };
  if (threadTs) {
    replyMetadata.thread_ts = threadTs;
  }

  const response = await fetch(`http://localhost:${PORT}/api/inbound-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      raw_input: rawInput,
      channel: "telegram",
      channel_user_id: String(channelUserId),
      reply_metadata: replyMetadata,
      provider: selectedProvider,
    }),
  });

  if (!response.ok) {
    throw new Error(`ProxyOS returned ${response.status}`);
  }

  return response.json();
}

async function pollForResult(contextId, maxAttempts = 60, intervalMs = 2000) {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(
      `http://localhost:${PORT}/api/context/${contextId}/result`,
    );

    if (response.status === 202) {
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }

    if (response.ok) {
      return response.json();
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return null;
}

async function markDeliverySent(contextId) {
  await supabase
    .from("outbound_deliveries")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("context_id", contextId)
    .eq("status", "pending");
}
