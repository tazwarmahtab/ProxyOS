const PROVIDER_CONFIGS = {
  nvidia: {
    name: 'NVIDIA',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    healthEndpoint: '/models',
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }),
    testModel: 'nvidia/llama-3.1-nemotron-70b-instruct'
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    healthEndpoint: '/models',
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }),
    testModel: 'llama-3.1-70b-versatile'
  },
  zai: {
    name: 'Z.ai',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    healthEndpoint: '/models',
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    }),
    testModel: 'GLM-4.7-Flash',
    free: true
  },
  'github-copilot': {
    name: 'GitHub Copilot',
    baseUrl: 'https://api.github.com',
    healthEndpoint: '/user',
    headers: (token) => ({
      'Authorization': `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Accept': 'application/json'
    }),
    testModel: 'copilot-chat'
  },
  opencode: {
    name: 'OpenCode',
    baseUrl: 'https://api.opencode.ai/v1',
    healthEndpoint: '/models',
    headers: (key) => ({
      'X-API-Key': key,
      'Content-Type': 'application/json'
    }),
    testModel: 'opencode/default'
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    healthEndpoint: '/models',
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://proxy-os.vercel.app',
      'X-Title': 'ProxyOS Backend',
      'Content-Type': 'application/json'
    }),
    testModel: 'anthropic/claude-3-opus'
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    healthEndpoint: '/models',
    headers: (key) => ({
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': key
    }),
    testModel: 'claude-3-5-sonnet-20241022'
  }
};

function getApiKey(provider) {
  const keys = {
    nvidia: process.env.NVIDIA_API_KEY,
    groq: process.env.GROQ_API_KEY,
    zai: process.env.ZAI_API_KEY,
    'github-copilot': process.env.GITHUB_COPILOT_TOKEN,
    opencode: process.env.OPENCODE_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY
  };
  return keys[provider];
}

async function checkProvider(provider) {
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    return { status: 'unknown', error: 'Provider configuration not found' };
  }

  const apiKey = getApiKey(provider);
  if (!apiKey) {
    return { 
      status: 'unconfigured', 
      error: 'API key not configured',
      name: config.name
    };
  }

  const startTime = Date.now();
  
  try {
    const response = await fetch(`${config.baseUrl}${config.healthEndpoint}`, {
      headers: config.headers(apiKey),
      method: 'GET'
    });

    const latency = Date.now() - startTime;
    
    return {
      status: response.ok ? 'healthy' : 'unhealthy',
      name: config.name,
      latency: `${latency}ms`,
      free: config.free || false,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    
    return {
      status: 'unhealthy',
      name: config.name,
      error: error.message,
      latency: `${latency}ms`,
      timestamp: new Date().toISOString()
    };
  }
}

async function checkRedis() {
  try {
    const { redisClient } = await import('../lib/redis.js');
    return await redisClient.healthCheck();
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

async function checkAllProviders() {
  const providers = ['nvidia', 'groq', 'zai', 'github-copilot', 'opencode', 'openrouter', 'anthropic'];
  const results = {};

  await Promise.all(
    providers.map(async (provider) => {
      try {
        results[provider] = await checkProvider(provider);
      } catch (error) {
        results[provider] = {
          status: 'error',
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    })
  );

  return results;
}

async function checkAllServices() {
  const [providers, redis] = await Promise.all([
    checkAllProviders(),
    checkRedis()
  ]);

  return {
    providers,
    redis
  };
}

export { checkProvider, checkAllProviders, checkAllServices, checkRedis, PROVIDER_CONFIGS };
