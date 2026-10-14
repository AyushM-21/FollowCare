import { Router } from 'express';
import { PatientHelpRequestSchema } from '@followcare/shared';
import { pool } from '../../config/db.js';
import { authenticate } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAuditLog } from '../../middleware/audit.js';
import { AppError } from '../../middleware/errorHandler.js';

export const patientPortalRouter = Router();

// Middleware: ensure caller is authenticated as patient
function requirePatientAuth(req, res, next) {
  if (!req.patient) {
    return next(new AppError('Forbidden: Endpoint is restricted to patient portal sessions', 403));
  }
  next();
}

patientPortalRouter.use('/me', authenticate, requirePatientAuth);

// ============================================================================
// GET /me/follow-ups
// ============================================================================
patientPortalRouter.get('/me/follow-ups', async (req, res, next) => {
  try {
    const plansRes = await pool.query(
      `SELECT 
        p.id,
        p.window_start,
        p.window_end,
        p.urgency,
        p.reason_category,
        p.channel,
        p.status,
        p.ack_status,
        p.required_tests,
        p.required_documents,
        d.name AS department_name,
        pi.approved_text AS instructions_text
      FROM follow_up_plans p
      LEFT JOIN departments d ON p.department_id = d.id
      LEFT JOIN plan_instructions pi ON p.id = pi.plan_id
      WHERE p.patient_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.window_end ASC`,
      [req.patient.id]
    );

    res.status(200).json({ followUps: plansRes.rows });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// GET /me/appointments
// ============================================================================
patientPortalRouter.get('/me/appointments', async (req, res, next) => {
  try {
    const apptsRes = await pool.query(
      `SELECT 
        a.id,
        a.scheduled_at,
        a.status,
        a.checked_in_at,
        d.name AS department_name
      FROM appointments a
      LEFT JOIN departments d ON a.department_id = d.id
      WHERE a.patient_id = $1
      ORDER BY a.scheduled_at ASC`,
      [req.patient.id]
    );

    res.status(200).json({ appointments: apptsRes.rows });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// POST /me/follow-ups/:id/acknowledge
// ============================================================================
patientPortalRouter.post('/me/follow-ups/:id/acknowledge', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE follow_up_plans 
       SET ack_status = 'acknowledged', acknowledged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND patient_id = $2 AND deleted_at IS NULL
       RETURNING id, ack_status, acknowledged_at`,
      [id, req.patient.id]
    );

    if (result.rowCount === 0) {
      return next(new AppError('Follow-up plan not found', 404));
    }

    await recordAuditLog({
      req,
      action: 'update',
      entityType: 'follow_up_plans',
      entityId: id,
      patientId: req.patient.id,
      metadata: { action: 'patient_acknowledged' }
    });

    res.status(200).json({ message: 'Care instructions acknowledged', plan: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// POST /me/barriers (Report barrier to care & auto-create high-priority task)
// ============================================================================
patientPortalRouter.post(
  '/me/barriers',
  validateBody(PatientHelpRequestSchema),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { plan_id, barrier_type, note, requested_callback } = req.body;

      const planRes = await client.query(
        `SELECT id, department_id, reason_category FROM follow_up_plans WHERE id = $1 AND patient_id = $2 AND deleted_at IS NULL`,
        [plan_id, req.patient.id]
      );
      if (planRes.rowCount === 0) {
        return next(new AppError('Follow-up plan not found', 404));
      }
      const plan = planRes.rows[0];

      await client.query('BEGIN');

      // Auto-create barrier resolution task with rule weight 35 (Section 9.5)
      const taskRes = await client.query(
        `INSERT INTO tasks (
          plan_id, patient_id, department_id, type, title, status,
          priority_score, priority_reasons, due_at
        ) VALUES (
          $1, $2, $3, 'resolve_barrier', $4, 'todo', 35,
          '[{"rule": "patient_requested_help", "points": 35}]'::jsonb, NOW()
        ) RETURNING id`,
        [
          plan_id,
          req.patient.id,
          plan.department_id,
          `Patient reported barrier (${barrier_type}): ${plan.reason_category}`
        ]
      );
      const taskId = taskRes.rows[0].id;

      // Save barrier report
      const repRes = await client.query(
        `INSERT INTO barrier_reports (
          plan_id, patient_id, barrier_type, note, reported_via, resolved_task_id
        ) VALUES ($1, $2, $3, $4, 'patient_portal', $5)
        RETURNING *`,
        [plan_id, req.patient.id, barrier_type, note || null, taskId]
      );

      await client.query('COMMIT');

      await recordAuditLog({
        req,
        action: 'create',
        entityType: 'barrier_reports',
        entityId: repRes.rows[0].id,
        patientId: req.patient.id,
        departmentId: plan.department_id,
        metadata: { barrier_type, requested_callback }
      });

      res.status(201).json({
        message: 'Your care coordinator has been notified and will assist you shortly.',
        report: repRes.rows[0]
      });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);
