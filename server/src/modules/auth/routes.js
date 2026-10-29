import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { LoginSchema, PatientOtpRequestSchema, PatientOtpVerifySchema, ROLE_PERMISSIONS } from '@followcare/shared';
import { pool } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { hashPhone } from '../../lib/crypto.js';
import { AppError } from '../../middleware/errorHandler.js';
import { validateBody } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/auth.js';
import { recordAuditLog } from '../../middleware/audit.js';
import { rateLimit } from '../../middleware/rateLimit.js';
import { startSession } from '../../middleware/session.js';

export const authRouter = Router();

// ============================================================================
// Staff Authentication
// ============================================================================

authRouter.post(
  '/auth/login',
  rateLimit({ name: 'login', windowSec: 900, max: 10, keyFn: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`, failClosed: true }),
  validateBody(LoginSchema),
  async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const userRes = await pool.query(
      `SELECT id, email, password_hash, full_name, role, status FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (userRes.rowCount === 0) {
      return next(new AppError('Invalid email or password', 401, 'https://followcare.org/errors/unauthorized'));
    }

    const user = userRes.rows[0];

    if (user.status !== 'active') {
      await recordAuditLog({
        req,
        action: 'failed_login',
        entityType: 'users',
        entityId: user.id,
        metadata: { reason: `account_${user.status}` }
      });
      return next(new AppError(`Account is ${user.status}. Please contact administrator.`, 403, 'https://followcare.org/errors/forbidden'));
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      await recordAuditLog({
        req,
        action: 'failed_login',
        entityType: 'users',
        entityId: user.id,
        metadata: { reason: 'invalid_credentials' }
      });
      return next(new AppError('Invalid email or password', 401, 'https://followcare.org/errors/unauthorized'));
    }

    // Update last login
    await pool.query(`UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1`, [user.id]);

    // Load departments
    const deptRes = await pool.query(
      `SELECT d.id, d.name, d.code, dm.role_in_dept 
       FROM department_members dm
       JOIN departments d ON dm.department_id = d.id
       WHERE dm.user_id = $1 AND dm.active = TRUE AND d.active = TRUE`,
      [user.id]
    );

    // Load permission overrides
    const overrideRes = await pool.query(
      `SELECT permission_id, granted FROM user_permission_overrides WHERE user_id = $1`,
      [user.id]
    );

    const permsSet = new Set(ROLE_PERMISSIONS[user.role] || []);
    for (const ov of overrideRes.rows) {
      if (ov.granted) permsSet.add(ov.permission_id);
      else permsSet.delete(ov.permission_id);
    }
    const permissions = Array.from(permsSet);

    // Save session
    await startSession(req, { userId: user.id });

    await recordAuditLog({
      req,
      action: 'login',
      entityType: 'users',
      entityId: user.id
    });

    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        status: user.status
      },
      permissions,
      departments: deptRes.rows
    });
  } catch (err) {
    next(err);
  }
  }
);

authRouter.post('/auth/logout', async (req, res, next) => {
  try {
    if (req.session?.userId) {
      await recordAuditLog({
        req,
        action: 'logout',
        entityType: 'users',
        entityId: req.session.userId
      });
    }

    req.session.destroy(err => {
      if (err) return next(err);
      res.clearCookie('fc.sid');
      res.status(200).json({ message: 'Logged out successfully' });
    });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/auth/me', authenticate, async (req, res) => {
  if (req.user) {
    return res.status(200).json({
      user: {
        id: req.user.id,
        email: req.user.email,
        fullName: req.user.fullName,
        role: req.user.role,
        status: req.user.status
      },
      permissions: req.user.permissions,
      departments: req.user.departments
    });
  }

  if (req.patient) {
    return res.status(200).json({
      patient: req.patient,
      role: 'patient'
    });
  }

  res.status(401).json({ error: 'Unauthenticated' });
});

// ============================================================================
// Patient OTP Authentication
// ============================================================================

const OTP_TTL_SEC = 300;
const OTP_MAX_ATTEMPTS = 5;

authRouter.post(
  '/patient-auth/otp/request',
  rateLimit({ name: 'otp-req-ip', windowSec: 600, max: 20, failClosed: true }),
  validateBody(PatientOtpRequestSchema),
  rateLimit({ name: 'otp-req-phone', windowSec: 600, max: 5, keyFn: (req) => hashPhone(req.body.phone), failClosed: true }),
  async (req, res, next) => {
    try {
      const { phone } = req.body;
      const phoneH = hashPhone(phone);

      const ptRes = await pool.query(
        `SELECT id FROM patients WHERE phone_hash = $1 AND deleted_at IS NULL`,
        [phoneH]
      );

      let debugCode;
      if (ptRes.rowCount > 0) {
        const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
        await redis.set(`otp:${phoneH}`, code, 'EX', OTP_TTL_SEC);
        await redis.del(`otp:attempts:${phoneH}`);
        // Mock provider only: surface the code outside production so the portal can be tested without SMS.
        if (process.env.NODE_ENV !== 'production') debugCode = code;
      }

      // Anti-enumeration: identical 200 response whether or not the number is registered
      res.status(200).json({
        message: 'If this number is registered, a one-time verification code has been sent.',
        expiresInSeconds: OTP_TTL_SEC,
        debugCode
      });
    } catch (err) {
      next(err);
    }
  }
);

authRouter.post(
  '/patient-auth/otp/verify',
  rateLimit({ name: 'otp-verify-ip', windowSec: 600, max: 30, failClosed: true }),
  validateBody(PatientOtpVerifySchema),
  async (req, res, next) => {
  try {
    const { phone, code } = req.body;
    const phoneH = hashPhone(phone);

    const invalid = () =>
      new AppError('Invalid or expired verification code', 400, 'https://followcare.org/errors/bad-request');

    const cachedCode = await redis.get(`otp:${phoneH}`);
    if (!cachedCode) return next(invalid());

    // Cap guesses per issued code, then burn the code
    const attempts = await redis.incr(`otp:attempts:${phoneH}`);
    if (attempts === 1) await redis.expire(`otp:attempts:${phoneH}`, OTP_TTL_SEC);
    if (attempts > OTP_MAX_ATTEMPTS) {
      await redis.del(`otp:${phoneH}`, `otp:attempts:${phoneH}`);
      return next(invalid());
    }

    const a = Buffer.from(String(cachedCode));
    const b = Buffer.from(String(code));
    const isValid = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!isValid) return next(invalid());

    const ptRes = await pool.query(
      `SELECT id, hospital_reg_no, status FROM patients WHERE phone_hash = $1 AND deleted_at IS NULL`,
      [phoneH]
    );

    if (ptRes.rowCount === 0) return next(invalid());

    const patient = ptRes.rows[0];

    // Create patient session with 10 min idle timeout
    await startSession(req, { patientId: patient.id }, 10 * 60 * 1000);

    await recordAuditLog({
      req,
      action: 'login',
      entityType: 'patients',
      entityId: patient.id,
      patientId: patient.id
    });

    // Invalidate used OTP
    await redis.del(`otp:${phoneH}`);

    res.status(200).json({
      message: 'Authentication successful',
      patient: {
        id: patient.id,
        hospitalRegNo: patient.hospital_reg_no
      }
    });
  } catch (err) {
    next(err);
  }
  }
);
