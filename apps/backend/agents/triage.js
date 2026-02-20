const TRIAGE_SYSTEM_PROMPT = `You are a task triage classifier for ProxyOS, an AI agent swarm. Your job is to analyze the user's input and decide which agents should handle it and what sub-specialization each should use.

Available agents and their specializations:

MINION (technical execution — code, scripts, deployment):
- backend: APIs, server logic, databases, authentication
- frontend: UI components, React/Next.js, CSS, state management
- devops: Docker, CI/CD, deployment, infrastructure
- database: Schema design, queries, migrations, optimization
- scripting: Automation scripts, CLI tools, data processing

SCOUT (research & intelligence gathering):
- market-research: Market analysis, trends, pricing, competitors
- technical-research: Tech evaluation, API docs, library comparison
- competitive-analysis: Competitor features, positioning, SWOT
- data-gathering: Scraping, data collection, source aggregation

SAGE (strategy, QA & review):
- code-review: Code quality, patterns, bugs, refactoring suggestions
- security-audit: Vulnerabilities, OWASP, auth flaws, data exposure
- architecture-review: System design, scalability, coupling, trade-offs
- ux-review: User flows, accessibility, edge cases, error states

Rules:
1. Assign 1-3 agents. Most tasks need only 1 agent.
2. Pick the BEST specialization for each agent based on the task.
3. Rewrite task_description to be specific to each agent's role — do NOT just copy the raw input.
4. Set priority 1-10 (10 = most urgent). Default to 7 for normal tasks.
5. Set task_type to one of: code, research, strategy, automation, review.
6. Return ONLY valid JSON — no markdown fences, no explanation, no extra text.

Response format:
{"delegations":[{"agent":"minion","specialization":"backend","task_description":"...","task_type":"code","priority":8}]}`;

const TRIAGE_PROVIDERS = ['groq', 'bonsai'];
const TRIAGE_TIMEOUT_MS = 5000;

/**
 * Classify a user message using an LLM call, returning structured delegation info.
 * @param {string} rawInput - The user's raw input message
 * @param {Function} callProviderFn - Function to call an LLM provider: (providerName, systemContent, userContent) => string
 * @returns {Promise<{delegations: Array}>}
 */
export async function triageWithLLM(rawInput, callProviderFn) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRIAGE_TIMEOUT_MS);

  let lastError = null;

  for (const provider of TRIAGE_PROVIDERS) {
    try {
      const result = await Promise.race([
        callProviderFn(provider, TRIAGE_SYSTEM_PROMPT, rawInput),
        new Promise((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new Error('Triage timeout'))
          );
        })
      ]);

      clearTimeout(timeout);

      const parsed = parseTriageResponse(result);
      if (parsed) return parsed;

      lastError = new Error('Failed to parse triage LLM response');
    } catch (err) {
      lastError = err;
      console.log(`[ProxyOS] Triage provider ${provider} failed: ${err.message}`);
      if (controller.signal.aborted) break;
    }
  }

  clearTimeout(timeout);
  throw lastError || new Error('All triage providers failed');
}

/**
 * Parse and validate the LLM's triage response.
 */
function parseTriageResponse(raw) {
  if (!raw || typeof raw !== 'string') return null;

  // Strip markdown fences if the LLM included them despite instructions
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (!parsed.delegations || !Array.isArray(parsed.delegations) || parsed.delegations.length === 0) {
    return null;
  }

  const VALID_AGENTS = ['minion', 'scout', 'sage'];
  const VALID_SPECIALIZATIONS = {
    minion: ['backend', 'frontend', 'devops', 'database', 'scripting'],
    scout: ['market-research', 'technical-research', 'competitive-analysis', 'data-gathering'],
    sage: ['code-review', 'security-audit', 'architecture-review', 'ux-review']
  };

  const validated = [];
  for (const d of parsed.delegations) {
    if (!d.agent || !VALID_AGENTS.includes(d.agent)) continue;

    const specialization = VALID_SPECIALIZATIONS[d.agent]?.includes(d.specialization)
      ? d.specialization
      : VALID_SPECIALIZATIONS[d.agent][0]; // default to first specialization

    validated.push({
      agent: d.agent,
      specialization,
      task_description: typeof d.task_description === 'string' ? d.task_description : '',
      task_type: typeof d.task_type === 'string' ? d.task_type : 'code',
      priority: typeof d.priority === 'number' ? Math.max(1, Math.min(10, d.priority)) : 7
    });
  }

  if (validated.length === 0) return null;

  return { delegations: validated };
}

/**
 * Keyword-based fallback — same logic as the original analyzeAndDelegate, extracted as a pure function.
 * Returns the same JSON format as triageWithLLM.
 * @param {string} rawInput
 * @returns {{delegations: Array}}
 */
export function keywordFallback(rawInput) {
  const input = rawInput.toLowerCase();
  const delegations = [];

  // Minion keywords
  if (
    input.includes('code') ||
    input.includes('deploy') ||
    input.includes('github') ||
    input.includes('schema') ||
    input.includes('api')
  ) {
    delegations.push({
      agent: 'minion',
      specialization: 'backend',
      task_description: rawInput,
      task_type: 'code',
      priority: 8
    });
  }

  // Scout keywords
  if (
    input.includes('research') ||
    input.includes('find') ||
    input.includes('scrape') ||
    input.includes('supplier') ||
    input.includes('market') ||
    input.includes('competitor')
  ) {
    delegations.push({
      agent: 'scout',
      specialization: 'market-research',
      task_description: rawInput,
      task_type: 'research',
      priority: 7
    });
  }

  // Sage keywords
  if (
    input.includes('review') ||
    input.includes('strategy') ||
    input.includes('qa') ||
    input.includes('polish') ||
    input.includes('analyze') ||
    input.includes('validate')
  ) {
    delegations.push({
      agent: 'sage',
      specialization: 'code-review',
      task_description: rawInput,
      task_type: 'strategy',
      priority: 9
    });
  }

  // Default fallback — scout research
  if (delegations.length === 0) {
    delegations.push({
      agent: 'scout',
      specialization: 'technical-research',
      task_description: `Research and analyze: ${rawInput}`,
      task_type: 'research',
      priority: 5
    });
  }

  return { delegations };
}
