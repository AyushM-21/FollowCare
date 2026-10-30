import { pool } from '../config/db.js';
import { logger } from '../config/logger.js';

export async function recordAuditLog({
  req,
  action,
  entityType,
  entityId,
  patientId = null,
  departmentId = null,
  metadata = {},
  required = false
}) {
  try {
    // audit_logs.actor_id references users(id); patient identities belong in patient_id only.
    const actorId = req?.user?.id || null;
    const actorRole = req?.user?.role || req?.patient?.role || null;
    const ip = req?.ip || req?.socket?.remoteAddress || '127.0.0.1';
    const userAgent = req?.headers?.['user-agent'] || null;
    const requestId = req?.id || null;

    await pool.query(
      `INSERT INTO audit_logs (
        actor_id, actor_role, action, entity_type, entity_id,
        patient_id, department_id, ip, user_agent, request_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        actorId,
        actorRole,
        action,
        entityType,
        String(entityId),
        patientId,
        departmentId,
        ip,
        userAgent,
        requestId,
        JSON.stringify(metadata)
      ]
    );
  } catch (err) {
    logger.error({ errorName: err.name, action, entityType }, 'Failed to write audit log');
    if (required) throw err;
  }
}
