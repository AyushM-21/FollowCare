import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { AppError } from './errorHandler.js';

/**
 * Fixed-window Redis rate limiter (ARCHITECTURE.md §11: abuse prevention).
 * keyFn(req) returns an identifier (e.g. IP + identifier); null/undefined skips limiting.
 * Fails open if Redis is unreachable so an outage cannot lock staff out.
 */
export function rateLimit({ name, windowSec, max, keyFn = (req) => req.ip }) {
  return async function rateLimitMiddleware(req, res, next) {
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
      logger.error({ err: err.message, name }, 'rateLimit: Redis error, failing open');
      return next();
    }
  };
}
