import Redis from 'ioredis';

// In-memory fallback for Redis
const fallbackStorage = new Map();

class RedisClient {
  constructor() {
    this.redis = null;
    this.connected = false;
    this.useFallback = false;
    this.TTL = 24 * 60 * 60; // 24 hours

    this.connect();
  }

  async connect() {
    const redisUrl = process.env.REDIS_URL;
    
    if (!redisUrl) {
      console.log('[ProxyOS backend] Redis URL not configured, using in-memory fallback');
      this.useFallback = true;
      return;
    }

    try {
      this.redis = new Redis(redisUrl);
      
      this.redis.on('connect', () => {
        console.log('[ProxyOS backend] Redis connection established');
        this.connected = true;
        this.useFallback = false;
      });

      this.redis.on('error', (error) => {
        console.error('[ProxyOS backend] Redis connection error:', error);
        this.connected = false;
        this.useFallback = true;
      });

      this.redis.on('close', () => {
        console.log('[ProxyOS backend] Redis connection closed');
        this.connected = false;
      });

      // Test connection
      await this.redis.ping();
    } catch (error) {
      console.error('[ProxyOS backend] Failed to connect to Redis:', error);
      this.useFallback = true;
    }
  }

  async saveContext(userId, context) {
    const contextData = {
      ...context,
      updatedAt: new Date().toISOString()
    };

    if (this.useFallback || !this.connected) {
      fallbackStorage.set(userId, contextData);
      return;
    }

    try {
      await this.redis.set(`context:${userId}`, JSON.stringify(contextData), 'EX', this.TTL);
    } catch (error) {
      console.error('[ProxyOS backend] Failed to save context to Redis:', error);
      this.useFallback = true;
      fallbackStorage.set(userId, contextData);
    }
  }

  async getContext(userId) {
    if (this.useFallback || !this.connected) {
      return fallbackStorage.get(userId) || { messages: [], provider: 'nvidia' };
    }

    try {
      const contextData = await this.redis.get(`context:${userId}`);
      if (contextData) {
        return JSON.parse(contextData);
      }
      return { messages: [], provider: 'nvidia' };
    } catch (error) {
      console.error('[ProxyOS backend] Failed to get context from Redis:', error);
      this.useFallback = true;
      return fallbackStorage.get(userId) || { messages: [], provider: 'nvidia' };
    }
  }

  async clearContext(userId) {
    if (this.useFallback || !this.connected) {
      fallbackStorage.delete(userId);
      return;
    }

    try {
      await this.redis.del(`context:${userId}`);
    } catch (error) {
      console.error('[ProxyOS backend] Failed to clear context from Redis:', error);
      this.useFallback = true;
      fallbackStorage.delete(userId);
    }
  }

  async healthCheck() {
    if (!process.env.REDIS_URL) {
      return {
        status: 'disabled',
        message: 'Redis not configured'
      };
    }

    if (this.useFallback) {
      return {
        status: 'unhealthy',
        message: 'Using in-memory fallback'
      };
    }

    try {
      const result = await this.redis.ping();
      if (result === 'PONG') {
        const info = await this.redis.info('memory');
        const usedMemory = info.match(/used_memory:\d+/)?.[0]?.split(':')[1];
        const usedMemoryHuman = info.match(/used_memory_human:\S+/)?.[0]?.split(':')[1];
        
        return {
          status: 'healthy',
          message: 'Redis connection healthy',
          memory: {
            used: usedMemory,
            usedHuman: usedMemoryHuman
          }
        };
      }
      return {
        status: 'unhealthy',
        message: 'Ping failed'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: error.message
      };
    }
  }
}

export const redisClient = new RedisClient();
