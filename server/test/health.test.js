import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index.js';
import { pool } from '../src/config/db.js';
import { redis } from '../src/config/redis.js';

describe('Server Infrastructure & Health Check Suite', () => {
  afterAll(async () => {
    // Clean up DB pool and Redis connections so vitest exits cleanly
    await pool.end().catch(() => {});
    await redis.quit().catch(() => {});
  });

  describe('GET /healthz (Liveness Probe)', () => {
    it('should return 200 with service status and X-Request-Id header', async () => {
      const res = await request(app).get('/healthz');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('service', 'followcare-api');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.headers).toHaveProperty('x-request-id');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('GET /readyz (Readiness Probe)', () => {
    it('should return 200 ready status when Postgres and Redis are reachable', async () => {
      const res = await request(app).get('/readyz');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ready');
      expect(res.body).toHaveProperty('database', 'connected');
      expect(res.body).toHaveProperty('redis', 'connected');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  describe('Fallback 404 & RFC 7807 Problem Details', () => {
    it('should return 404 problem+json format for undefined routes', async () => {
      const res = await request(app).get('/api/unmapped-route-xyz');

      expect(res.status).toBe(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toHaveProperty('status', 404);
      expect(res.body).toHaveProperty('title', 'Not Found');
      expect(res.body).toHaveProperty('detail');
      expect(res.body).toHaveProperty('instance', '/api/unmapped-route-xyz');
      expect(res.body).toHaveProperty('requestId');
    });
  });
});
