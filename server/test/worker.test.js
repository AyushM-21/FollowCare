import { describe, it, expect, afterAll } from 'vitest';
import { initWorker } from '../src/worker.js';
import { redis } from '../src/config/redis.js';

describe('Worker Entry Point & Initialization Suite', () => {
  afterAll(async () => {
    try {
      await redis.quit();
    } catch (err) {
      // Safely ignore if already closed
    }
  });

  it('should initialize worker and confirm Redis connectivity without starting consumers or queue jobs', async () => {
    const res = await initWorker();

    expect(res).toBeDefined();
    expect(res.status).toBe('initialized');
    expect(res.redisConnected).toBe(true);
  });
});
