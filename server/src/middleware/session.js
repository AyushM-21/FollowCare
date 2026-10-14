import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { pool } from '../config/db.js';
import { config } from '../config/env.js';

const PgSession = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: 'session',
    createTableIfMissing: false
  }),
  name: 'fc.sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset cookie maxAge on every response
  cookie: {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000 // 15-minute staff idle timeout per ARCHITECTURE.md Section 11
  }
});

/**
 * Start a fresh session holding exactly ONE identity (staff user OR patient).
 * Regenerating drops any previous identity (a browser shares one cookie across
 * ports on localhost, so a staff login and a patient login would otherwise merge)
 * and prevents session fixation.
 */
export function startSession(req, identity, maxAgeMs) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      Object.assign(req.session, identity);
      if (maxAgeMs) req.session.cookie.maxAge = maxAgeMs;
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}
