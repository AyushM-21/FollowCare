import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { AppError } from './errorHandler.js';

/**
 * Fixed-window Redis rate limiter (ARCHITECTURE.md §11: abuse prevention).
 * keyFn(req) returns an identifier (e.g. IP + identifier); null/undefined skips limiting.
 * Fails open if Redis is unreachable so an outage cannot lock staff out.
 */
export function rateLimit({ name, windowSec, max, keyFn = (req) => req.ip, failClosed = false }) {
  return async function rateLimitMiddleware(req, res, next) {
    // Vitest sets NODE_ENV=test; repeated test runs must not trip real limits (set RATE_LIMIT_IN_TEST=1 to exercise them)
    if (process.env.NODE_ENV === 'test' && !process.env.RATE_LIMIT_IN_TEST) return next();
    try {
      const id = keyFn(req);
      if (!id) return next();
      const key = `rl:${name}:${id}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSec);
      if (count > max) {
        const ttl = await redis.ttl(key);
        res.set('Retry-After', String(Math.max(ttl, 1)));
        return next(new AppError('Too many attempts. Please try again later.', 429, 'https://followcare.org/errors/rate-limited'));
      }
      return next();
    } catch (err) {
      logger.error({ name, failClosed }, 'rateLimit: Redis error');
      if (failClosed) {
        return next(new AppError('Authentication protection is temporarily unavailable. Please try again later.', 503, 'https://followcare.org/errors/service-unavailable'));
      }
      return next();
    }
  };
}
