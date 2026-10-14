import Redis from 'ioredis';
import { config } from './env.js';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  lazyConnect: false
});

redis.on('connect', () => {
  // console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

export async function pingRedis() {
  try {
    const res = await redis.ping();
    return res === 'PONG';
  } catch (err) {
    return false;
  }
}
