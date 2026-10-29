import { Router } from 'express';
import { CreatePlanSchema, Permissions, UserRole } from '@followcare/shared';
import { pool } from '../../config/db.js';
import { encrypt, decrypt } from '../../lib/crypto.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { deptScope } from '../../middleware/deptScope.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAuditLog } from '../../middleware/audit.js';
import { AppError } from '../../middleware/errorHandler.js';
import { scheduleRemindersForPlan } from '../../jobs/processors.js';

export const plansRouter = Router();

// ============================================================================
// POST /plans (Create Plan with Version 1 and Auto-Task)
// ============================================================================
plansRouter.post(
  '/plans',
  authenticate,
  requirePermission(Permissions.PLAN_CREATE),
  deptScope(),
  validateBody(CreatePlanSchema),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const {
        patient_id,
        department_id,
        window_start,
        window_end,
        urgency,
        reason_category,
        reason_note,
        channel,
        instructions_text,
        required_tests = [],
        required_documents = [],
        owner_task_assignee
      } = req.body;

      // Department scope check
      if (req.departmentIds !== null && !req.departmentIds.includes(department_id)) {
        return next(new AppError('Forbidden: Cannot create follow-up plan for unauthorized department', 403, 'https://followcare.org/errors/forbidden'));
      }

      // Check patient exists
      const ptRes = await client.query(`SELECT id FROM patients WHERE id = $1 AND deleted_at IS NULL`, [patient_id]);
      if (ptRes.rowCount === 0) {
        return next(new AppError('Patient not found', 404));
      }

      await client.query('BEGIN');

      // Nurse plans are draft/pending_approval, Doctor/Admin plans are active (ARCHITECTURE.md Section 8.2)
      const isNurse = req.user.role === UserRole.NURSE;
      const initialStatus = isNurse ? 'pending_approval' : 'active';
      const approvedBy = isNurse ? null : req.user.id;
      const approvedAt = isNurse ? null : new Date();

      const planRes = await client.query(
        `INSERT INTO follow_up_plans (
          patient_id, department_id, created_by, owner_task_assignee,
          window_start, window_end, urgency, reason_category, reason_note_enc,
          channel, status, required_tests, required_documents,
          current_version, approved_by, approved_at, ack_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 1, $14, $15, 'pending')
        RETURNING *`,
        [
          patient_id,
          department_id,
          req.user.id,
          owner_task_assignee || null,
          window_start,
          window_end,
          urgency,
          reason_category,
          reason_note ? encrypt(reason_note) : null,
          channel,
          initialStatus,
          required_tests,
          required_documents,
          approvedBy,
          approvedAt
        ]
      );
      const plan = planRes.rows[0];

      // Save plan instructions
      await client.query(
        `INSERT INTO plan_instructions (
          plan_id, original_text, approved_text, approved_by, approved_at
        ) VALUES ($1, $2, $2, $3, $4)`,
        [plan.id, instructions_text, approvedBy, approvedAt]
      );

      // Save Version 1 snapshot (ARCHITECTURE.md Section 8.2)
      const snapshot = {
        version: 1,
        window_start,
        window_end,
        urgency,
        reason_category,
        channel,
        status: initialStatus,
        required_tests,
        required_documents,
        instructions_text
      };

      await client.query(
        `INSERT INTO follow_up_plan_versions (
          plan_id, version, snapshot, changed_by, change_reason
        ) VALUES ($1, 1, $2, $3, 'Initial follow-up plan creation')`,
        [plan.id, JSON.stringify(snapshot), req.user.id]
      );

      // Auto-create initial contact task (ARCHITECTURE.md Section 8.1 & 9.5)
      let initialScore = 0;
      const priorityReasons = [];
      if (urgency === 'urgent') {
        initialScore += 30;
        priorityReasons.push({ rule: 'urgency_urgent', points: 30 });
      } else if (urgency === 'priority') {
        initialScore += 15;
        priorityReasons.push({ rule: 'urgency_priority', points: 15 });
      }

      const taskRes = await client.query(
        `INSERT INTO tasks (
          plan_id, patient_id, department_id, type, title, status,
          priority_score, priority_reasons, assignee_id, due_at, created_by
        ) VALUES ($1, $2, $3, 'contact_patient', $4, 'todo', $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          plan.id,
          patient_id,
          department_id,
          `Initial contact: ${reason_category}`,
          initialScore,
          JSON.stringify(priorityReasons),
          owner_task_assignee || null,
          window_start,
          req.user.id
        ]
      );

      // Build the initial task checklist from plan-required tests and documents.
      const checklistLabels = [
        ...required_tests.map((item) => `Required test: ${item}`),
        ...required_documents.map((item) => `Required document: ${item}`)
      ];
      for (const label of checklistLabels) {
        await client.query(
          'INSERT INTO task_checklist_items (task_id, label) VALUES ($1, $2)',
          [taskRes.rows[0].id, label]
        );
      }

      // Queue generic reminders only for plans that are already clinician-approved
      if (initialStatus === 'active') {
        await scheduleRemindersForPlan(client, {
          planId: plan.id, patientId: patient_id, windowStart: window_start, windowEnd: window_end
        });
      }

      await client.query('COMMIT');

      await recordAuditLog({
        req,
        action: 'create',
        entityType: 'follow_up_plans',
        entityId: plan.id,
        patientId: patient_id,
        departmentId: department_id,
        metadata: { urgency, status: initialStatus, version: 1 }
      });

      res.status(201).json({
        message: 'Follow-up plan created successfully',
        plan: {
          ...plan,
          initialTaskId: taskRes.rows[0].id
        }
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
// GET /plans (Department-scoped list with computed statuses)
// ============================================================================
plansRouter.get(
  '/plans',
  authenticate,
  deptScope(),
  async (req, res, next) => {
    try {
      let queryText = `
        SELECT 
          p.id,
          p.patient_id,
          p.department_id,
          d.name AS department_name,
          p.window_start,
          p.window_end,
          p.urgency,
          p.reason_category,
          p.channel,
          p.status,
          p.ack_status,
          p.current_version,
          p.owner_task_assignee,
          u.full_name AS owner_name,
          v.computed_status,
          v.days_remaining,
          p.created_at
        FROM follow_up_plans p
        LEFT JOIN departments d ON p.department_id = d.id
        LEFT JOIN users u ON p.owner_task_assignee = u.id
        LEFT JOIN v_follow_up_status v ON p.id = v.plan_id
        WHERE p.deleted_at IS NULL
      `;
      const params = [];

      if (req.departmentIds !== null) {
        if (req.departmentIds.length === 0) {
          return res.status(200).json({ plans: [] });
        }
        queryText += ` AND p.department_id = ANY($1::uuid[])`;
        params.push(req.departmentIds);
      }

      if (req.query.status) {
        params.push(req.query.status);
        queryText += ` AND p.status = $${params.length}`;
      }

      if (req.query.urgency) {
        params.push(req.query.urgency);
        queryText += ` AND p.urgency = $${params.length}`;
      }

      queryText += ` ORDER BY p.window_end ASC LIMIT 100`;

      const result = await pool.query(queryText, params);
      res.status(200).json({ plans: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// GET /plans/:id (Detail with versions and instructions)
// ============================================================================
plansRouter.get(
  '/plans/:id',
  authenticate,
  deptScope(),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const planRes = await pool.query(
        `SELECT 
          p.*,
          d.name AS department_name,
          u.full_name AS created_by_name,
          oa.full_name AS owner_name,
          v.computed_status,
          v.days_remaining
        FROM follow_up_plans p
        LEFT JOIN departments d ON p.department_id = d.id
        LEFT JOIN users u ON p.created_by = u.id
        LEFT JOIN users oa ON p.owner_task_assignee = oa.id
        LEFT JOIN v_follow_up_status v ON p.id = v.plan_id
        WHERE p.id = $1 AND p.deleted_at IS NULL`,
        [id]
      );

      if (planRes.rowCount === 0) {
        return next(new AppError('Follow-up plan not found', 404));
      }

      const plan = planRes.rows[0];

      if (req.departmentIds !== null && !req.departmentIds.includes(plan.department_id)) {
        return next(new AppError('Forbidden: Access to this plan department is denied', 403));
      }

      // Load instructions
      const instRes = await pool.query(
        `SELECT id, original_text, approved_text, language, approved_at, ambiguity_flag
         FROM plan_instructions WHERE plan_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [id]
      );

      // Load version history
      const versRes = await pool.query(
        `SELECT id, version, snapshot, change_reason, created_at, changed_by
         FROM follow_up_plan_versions WHERE plan_id = $1 ORDER BY version DESC`,
        [id]
      );

      res.status(200).json({
        plan: {
          ...plan,
          reason_note: plan.reason_note_enc ? decrypt(plan.reason_note_enc) : null,
          instructions: instRes.rows[0] || null,
          versions: versRes.rows
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// PATCH /plans/:id (Edit plan, increments version and saves snapshot)
// ============================================================================
plansRouter.patch(
  '/plans/:id',
  authenticate,
  requirePermission(Permissions.PLAN_EDIT),
  deptScope(),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const {
        window_start,
        window_end,
        urgency,
        reason_category,
        reason_note,
        channel,
        instructions_text,
        change_reason = 'Administrative update'
      } = req.body;

      const curPlanRes = await client.query(
        `SELECT * FROM follow_up_plans WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      if (curPlanRes.rowCount === 0) {
        return next(new AppError('Follow-up plan not found', 404));
      }

      const curPlan = curPlanRes.rows[0];
      if (req.departmentIds !== null && !req.departmentIds.includes(curPlan.department_id)) {
        return next(new AppError('Forbidden: Access to department denied', 403));
      }

      await client.query('BEGIN');

      const nextVersion = curPlan.current_version + 1;

      const updatedPlanRes = await client.query(
        `UPDATE follow_up_plans SET
          window_start = COALESCE($1, window_start),
          window_end = COALESCE($2, window_end),
          urgency = COALESCE($3, urgency),
          reason_category = COALESCE($4, reason_category),
          reason_note_enc = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE reason_note_enc END,
          channel = COALESCE($6, channel),
          current_version = $7,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $8
        RETURNING *`,
        [
          window_start || null,
          window_end || null,
          urgency || null,
          reason_category || null,
          reason_note ? encrypt(reason_note) : null,
          channel || null,
          nextVersion,
          id
        ]
      );

      // If instructions updated, insert new instruction entry
      if (instructions_text) {
        await client.query(
          `INSERT INTO plan_instructions (
            plan_id, original_text, approved_text, approved_by, approved_at
          ) VALUES ($1, $2, $2, $3, CURRENT_TIMESTAMP)`,
          [id, instructions_text, req.user.id]
        );
      }

      // Record new version snapshot
      const snapshot = {
        version: nextVersion,
        window_start: updatedPlanRes.rows[0].window_start,
        window_end: updatedPlanRes.rows[0].window_end,
        urgency: updatedPlanRes.rows[0].urgency,
        reason_category: updatedPlanRes.rows[0].reason_category,
        channel: updatedPlanRes.rows[0].channel,
        instructions_text: instructions_text || undefined
      };

      await client.query(
        `INSERT INTO follow_up_plan_versions (
          plan_id, version, snapshot, changed_by, change_reason
        ) VALUES ($1, $2, $3, $4, $5)`,
        [id, nextVersion, JSON.stringify(snapshot), req.user.id, change_reason]
      );

      await client.query('COMMIT');

      await recordAuditLog({
        req,
        action: 'update',
        entityType: 'follow_up_plans',
        entityId: id,
        patientId: curPlan.patient_id,
        departmentId: curPlan.department_id,
        metadata: { newVersion: nextVersion, changeReason: change_reason }
      });

      res.status(200).json({
        message: `Plan updated to version ${nextVersion}`,
        plan: updatedPlanRes.rows[0]
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
// POST /plans/:id/approve (Doctor/Admin Approval)
// ============================================================================
plansRouter.post(
  '/plans/:id/approve',
  authenticate,
  requirePermission(Permissions.PLAN_APPROVE),
  deptScope(),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const planRes = await pool.query(
        `SELECT id, department_id, patient_id, status FROM follow_up_plans WHERE id = $1 AND deleted_at IS NULL`,
        [id]
      );
      if (planRes.rowCount === 0) {
        return next(new AppError('Follow-up plan not found', 404));
      }

      const plan = planRes.rows[0];
      if (req.departmentIds !== null && !req.departmentIds.includes(plan.department_id)) {
        return next(new AppError('Forbidden: Access to department denied', 403));
      }

      const updated = await pool.query(
        `UPDATE follow_up_plans 
         SET status = 'active', approved_by = $1, approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 RETURNING *`,
        [req.user.id, id]
      );

      if (plan.status === 'pending_approval') {
        const approvedPlan = updated.rows[0];
        const reminderClient = await pool.connect();
        try {
          await scheduleRemindersForPlan(reminderClient, {
            planId: id,
            patientId: plan.patient_id,
            windowStart: approvedPlan.window_start,
            windowEnd: approvedPlan.window_end
          });
        } finally {
          reminderClient.release();
        }
      }

      await recordAuditLog({
        req,
        action: 'update',
        entityType: 'follow_up_plans',
        entityId: id,
        patientId: plan.patient_id,
        departmentId: plan.department_id,
        metadata: { action: 'approved', approvedBy: req.user.id }
      });

      res.status(200).json({ message: 'Plan approved and activated', plan: updated.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// POST /plans/:id/acknowledge
// ============================================================================
plansRouter.post(
  '/plans/:id/acknowledge',
  authenticate,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const updated = await pool.query(
        `UPDATE follow_up_plans 
         SET ack_status = 'acknowledged', acknowledged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND deleted_at IS NULL RETURNING id, ack_status, acknowledged_at`,
        [id]
      );

      if (updated.rowCount === 0) {
        return next(new AppError('Follow-up plan not found', 404));
      }

      res.status(200).json({ message: 'Plan acknowledged', plan: updated.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);
