import { afterEach, describe, expect, it, vi } from 'vitest';

const { redisMock } = vi.hoisted(() => ({
  redisMock: { incr: vi.fn(), expire: vi.fn(), ttl: vi.fn() }
}));

vi.mock('../src/config/redis.js', () => ({ redis: redisMock }));

import { rateLimit } from '../src/middleware/rateLimit.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('rate limiter Redis failure policy', () => {
  it('blocks authentication when Redis is unavailable and failClosed is enabled', async () => {
    vi.stubEnv('RATE_LIMIT_IN_TEST', '1');
    redisMock.incr.mockRejectedValue(new Error('Redis unavailable'));
    const next = vi.fn();
    const req = { ip: '127.0.0.1' };
    const res = { set: vi.fn() };

    await rateLimit({ name: 'auth-test', windowSec: 60, max: 5, failClosed: true })(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 503,
      message: 'Authentication protection is temporarily unavailable. Please try again later.'
    });
  });

  it('retains fail-open behavior for non-auth limits unless explicitly configured', async () => {
    vi.stubEnv('RATE_LIMIT_IN_TEST', '1');
    redisMock.incr.mockRejectedValue(new Error('Redis unavailable'));
    const next = vi.fn();

    await rateLimit({ name: 'general-test', windowSec: 60, max: 5 })(
      { ip: '127.0.0.1' },
      { set: vi.fn() },
      next
    );

    expect(next).toHaveBeenCalledWith();
  });
});
