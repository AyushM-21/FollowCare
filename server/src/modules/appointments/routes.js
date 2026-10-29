import { Router } from 'express';
import { Permissions, AppointmentStatus, CreateAppointmentSchema, UpdateAppointmentSchema } from '@followcare/shared';
import { pool } from '../../config/db.js';
import { decrypt } from '../../lib/crypto.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { deptScope } from '../../middleware/deptScope.js';
import { recordAuditLog } from '../../middleware/audit.js';
import { AppError } from '../../middleware/errorHandler.js';
import { validateBody } from '../../middleware/validate.js';

export const appointmentsRouter = Router();

// ============================================================================
// GET /appointments (Department-scoped list)
// ============================================================================
appointmentsRouter.get(
  '/appointments',
  authenticate,
  requirePermission(Permissions.APPOINTMENT_BOOK),
  deptScope(),
  async (req, res, next) => {
    try {
      let queryText = `
        SELECT 
          a.id,
          a.plan_id,
          a.patient_id,
          p.hospital_reg_no,
          p.full_name_enc,
          a.department_id,
          d.name AS department_name,
          a.clinician_id,
          u.full_name AS clinician_name,
          a.scheduled_at,
          a.status,
          a.checked_in_at,
          a.walk_in
        FROM appointments a
        JOIN patients p ON a.patient_id = p.id
        LEFT JOIN departments d ON a.department_id = d.id
        LEFT JOIN users u ON a.clinician_id = u.id
        WHERE p.deleted_at IS NULL
      `;
      const params = [];

      if (req.departmentIds !== null) {
        if (req.departmentIds.length === 0) {
          return res.status(200).json({ appointments: [] });
        }
        queryText += ` AND a.department_id = ANY($1::uuid[])`;
        params.push(req.departmentIds);
      }

      queryText += ` ORDER BY a.scheduled_at ASC LIMIT 100`;

      const result = await pool.query(queryText, params);
      const appointments = result.rows.map(row => ({
        ...row,
        patientName: decrypt(row.full_name_enc),
        full_name_enc: undefined
      }));

      res.status(200).json({ appointments });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// POST /appointments (Book appointment)
// ============================================================================
appointmentsRouter.post(
  '/appointments',
  authenticate,
  requirePermission(Permissions.APPOINTMENT_BOOK),
  deptScope(),
  validateBody(CreateAppointmentSchema),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const {
        plan_id,
        patient_id,
        department_id,
        clinician_id,
        scheduled_at,
        walk_in = false
      } = req.body;

      if (!patient_id || !department_id || !scheduled_at) {
        return next(new AppError('patient_id, department_id, and scheduled_at are required', 400));
      }

      if (req.departmentIds !== null && !req.departmentIds.includes(department_id)) {
        return next(new AppError('Forbidden: Access to department denied', 403));
      }


      const patientRes = await client.query(
        `SELECT assigned_department_id, status FROM patients WHERE id = $1 AND deleted_at IS NULL`,
        [patient_id]
      );
      if (patientRes.rowCount === 0) {
        return next(new AppError('Patient not found', 404));
      }
      if (patientRes.rows[0].assigned_department_id && patientRes.rows[0].assigned_department_id !== department_id) {
        return next(new AppError('Appointment department must match the patient assigned department', 400));
      }
      if (patientRes.rows[0].status !== 'active') {
        return next(new AppError('Appointments can only be booked for active patients', 400));
      }

      if (clinician_id) {
        const clinicianRes = await client.query(
          `SELECT 1 FROM department_members WHERE user_id = $1 AND department_id = $2 AND active = TRUE`,
          [clinician_id, department_id]
        );
        if (clinicianRes.rowCount === 0) {
          return next(new AppError('Clinician must be an active member of the selected department', 400));
        }
      }

      if (plan_id) {
        const planRes = await client.query(
          `SELECT patient_id, department_id FROM follow_up_plans WHERE id = $1 AND deleted_at IS NULL`,
          [plan_id]
        );
        if (planRes.rowCount === 0) {
          return next(new AppError('Follow-up plan not found', 404));
        }
        const plan = planRes.rows[0];
        if (plan.patient_id !== patient_id || plan.department_id !== department_id) {
          return next(new AppError('Appointment patient and department must match the selected follow-up plan', 400));
        }
      }

      await client.query('BEGIN');

      const apptRes = await client.query(
        `INSERT INTO appointments (
          plan_id, patient_id, department_id, clinician_id, scheduled_at, status, walk_in
        ) VALUES ($1, $2, $3, $4, $5, 'confirmed', $6)
        RETURNING *`,
        [plan_id || null, patient_id, department_id, clinician_id || null, scheduled_at, walk_in]
      );

      // If tied to a follow-up plan, mark plan acknowledged
      if (plan_id) {
        await client.query(
          `UPDATE follow_up_plans SET ack_status = 'acknowledged', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [plan_id]
        );
      }

      await client.query('COMMIT');

      await recordAuditLog({
        req,
        action: 'create',
        entityType: 'appointments',
        entityId: apptRes.rows[0].id,
        patientId,
        departmentId
      });

      res.status(201).json({
        message: 'Appointment booked successfully',
        appointment: apptRes.rows[0]
      });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);

// ============================================================================
// PATCH /appointments/:id (Lifecycle status update: check-in, attended, missed, etc.)
// ============================================================================
appointmentsRouter.patch(
  '/appointments/:id',
  authenticate,
  requirePermission(Permissions.APPOINTMENT_BOOK),
  deptScope(),
  validateBody(UpdateAppointmentSchema),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { status, scheduled_at } = req.body;

      const apptRes = await client.query(`SELECT * FROM appointments WHERE id = $1`, [id]);
      if (apptRes.rowCount === 0) {
        return next(new AppError('Appointment not found', 404));
      }

      const appt = apptRes.rows[0];
      const allowedTransitions = {
        requested: ['scheduled', 'confirmed', 'cancelled'],
        scheduled: ['confirmed', 'checked_in', 'attended', 'missed', 'cancelled', 'rescheduled'],
        confirmed: ['checked_in', 'attended', 'missed', 'cancelled', 'rescheduled'],
        checked_in: ['attended', 'cancelled'],
        attended: [],
        missed: ['scheduled', 'confirmed', 'rescheduled', 'cancelled'],
        cancelled: [],
        rescheduled: ['scheduled', 'confirmed', 'cancelled']
      };
      if (status && status !== appt.status && !allowedTransitions[appt.status]?.includes(status)) {
        return next(new AppError(`Invalid appointment status transition: ${appt.status} -> ${status}`, 409, 'https://followcare.org/errors/conflict'));
      }
      if (req.departmentIds !== null && !req.departmentIds.includes(appt.department_id)) {
        return next(new AppError('Forbidden: Access to department denied', 403));
      }

      await client.query('BEGIN');

      const checkedInAt = status === AppointmentStatus.CHECKED_IN ? new Date() : appt.checked_in_at;

      const updated = await client.query(
        `UPDATE appointments SET
          status = COALESCE($1, status),
          scheduled_at = COALESCE($2, scheduled_at),
          checked_in_at = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *`,
        [status || null, scheduled_at || null, checkedInAt, id]
      );

      // Invariant (Section 8.5): 'missed' auto-creates a barrier-resolution task, not a penalty
      if (status === AppointmentStatus.MISSED && appt.status !== AppointmentStatus.MISSED) {
        await client.query(
          `INSERT INTO tasks (
            plan_id, patient_id, department_id, type, title, status,
            priority_score, priority_reasons, due_at
          ) VALUES ($1, $2, $3, 'resolve_barrier', 'Missed appointment follow-up: Check barriers to care', 'todo', 35, '[{"rule": "patient_requested_help", "points": 35}]'::jsonb, NOW())`,
          [appt.plan_id, appt.patient_id, appt.department_id]
        );
      }

      // If status is 'attended', close follow-up outcome
      if (status === AppointmentStatus.ATTENDED && appt.plan_id) {
        await client.query(
          `INSERT INTO follow_up_outcomes (plan_id, final_status, closed_by)
           VALUES ($1, 'attended', $2)
           ON CONFLICT (plan_id) DO UPDATE SET final_status = 'attended', closed_by = EXCLUDED.closed_by`,
          [appt.plan_id, req.user.id]
        );
        await client.query(
          `UPDATE follow_up_plans SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [appt.plan_id]
        );
      }

      await client.query('COMMIT');

      res.status(200).json({
        message: 'Appointment status updated',
        appointment: updated.rows[0]
      });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);
