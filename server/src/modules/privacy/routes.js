import { Router } from 'express';
import { Permissions } from '@followcare/shared';
import { pool } from '../../config/db.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';

export const privacyRouter = Router();

// Staff/Admin audit logs
privacyRouter.get(
  '/audit-logs',
  authenticate,
  requirePermission(Permissions.AUDIT_VIEW),
  async (req, res, next) => {
    try {
      const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
      const offset = parseInt(req.query.offset || '0', 10);

      const logsRes = await pool.query(
        `SELECT 
          al.id,
          al.actor_id,
          al.actor_role,
          al.action,
          al.entity_type,
          al.entity_id,
          al.patient_id,
          al.department_id,
          d.name AS department_name,
          al.ip,
          al.user_agent,
          al.request_id,
          al.metadata,
          al.created_at
        FROM audit_logs al
        LEFT JOIN departments d ON al.department_id = d.id
        ORDER BY al.created_at DESC
        LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      res.status(200).json({ auditLogs: logsRes.rows });
    } catch (err) {
      next(err);
    }
  }
);

// Patient transparency access log (DPDP data principal right)
privacyRouter.get(
  '/me/access-log',
  authenticate,
  async (req, res, next) => {
    try {
      if (!req.patient) {
        return res.status(403).json({ error: 'This endpoint is for patient self-access reviews' });
      }

      const logsRes = await pool.query(
        `SELECT 
          al.id,
          al.actor_role,
          al.action,
          al.entity_type,
          al.created_at
        FROM audit_logs al
        WHERE al.patient_id = $1
        ORDER BY al.created_at DESC
        LIMIT 50`,
        [req.patient.id]
      );

      res.status(200).json({ accessLog: logsRes.rows });
    } catch (err) {
      next(err);
    }
  }
);
