class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttempt = Date.now();
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker is OPEN for ${this.name}`);
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this.lastFailureTime = null;
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.resetTimeout;
    }
  }

  getState() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      nextAttempt: this.nextAttempt
    };
  }
}

class ProviderFailoverManager {
  constructor() {
    this.providers = [
      { name: 'nvidia', priority: 1, healthy: true, enabled: true },
      { name: 'groq', priority: 2, healthy: true, enabled: true },
      { name: 'zai', priority: 3, healthy: true, enabled: true, free: true },
      { name: 'github-copilot', priority: 4, healthy: true, enabled: true },
      { name: 'opencode', priority: 5, healthy: true, enabled: true },
      { name: 'openrouter', priority: 6, healthy: true, enabled: true }
    ];
    this.circuitBreakers = new Map();
    this.currentProvider = 'nvidia';

    for (const provider of this.providers) {
      this.circuitBreakers.set(provider.name, new CircuitBreaker(provider.name));
    }
  }

  async executeWithFailover(operation) {
    const sortedProviders = this.providers
      .filter(p => p.healthy && p.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const provider of sortedProviders) {
      const circuitBreaker = this.circuitBreakers.get(provider.name);

      try {
        const result = await circuitBreaker.execute(async () => {
          return await operation(provider.name);
        });

        this.currentProvider = provider.name;
        this.recordSuccess(provider.name);
        return { ...result, provider: provider.name, failover: false };
      } catch (error) {
        this.recordFailure(provider.name);

        if (sortedProviders.indexOf(provider) < sortedProviders.length - 1) {
          const nextProvider = sortedProviders[sortedProviders.indexOf(provider) + 1];
          console.log(`[Failover] ${provider.name} failed, trying ${nextProvider.name}`);
        }
      }
    }

    throw new Error('All providers failed');
  }

  recordSuccess(providerName) {
    const provider = this.providers.find(p => p.name === providerName);
    if (provider) {
      provider.healthy = true;
    }
    const cb = this.circuitBreakers.get(providerName);
    if (cb) cb.onSuccess();
  }

  recordFailure(providerName) {
    const provider = this.providers.find(p => p.name === providerName);
    if (provider) {
      const cb = this.circuitBreakers.get(providerName);
      if (cb && cb.failureCount >= cb.failureThreshold - 1) {
        provider.healthy = false;
      }
    }
    const cb = this.circuitBreakers.get(providerName);
    if (cb) cb.onFailure();
  }

  enableProvider(providerName) {
    const provider = this.providers.find(p => p.name === providerName);
    if (provider) {
      provider.enabled = true;
      provider.healthy = true;
    }
  }

  disableProvider(providerName) {
    const provider = this.providers.find(p => p.name === providerName);
    if (provider) {
      provider.enabled = false;
    }
  }

  getProviderStatus() {
    return this.providers.map(p => ({
      ...p,
      circuitBreaker: this.circuitBreakers.get(p.name)?.getState()
    }));
  }

  forceProviderHealthy(providerName) {
    const provider = this.providers.find(p => p.name === providerName);
    if (provider) {
      provider.healthy = true;
    }
    const cb = this.circuitBreakers.get(providerName);
    if (cb) cb.onSuccess();
  }

  resetAllProviders() {
    for (const provider of this.providers) {
      provider.healthy = true;
      provider.enabled = true;
    }
    for (const cb of this.circuitBreakers.values()) {
      cb.onSuccess();
    }
  }
}

export { ProviderFailoverManager, CircuitBreaker };
