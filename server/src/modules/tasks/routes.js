import { Router } from 'express';
import {
  AssignTaskSchema,
  LogContactAttemptSchema,
  Permissions,
  TaskStatus,
  UpdateTaskStatusSchema,
  UpdateTaskChecklistItemSchema
} from '@followcare/shared';
import { pool } from '../../config/db.js';
import { decrypt, maskPhone } from '../../lib/crypto.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { deptScope } from '../../middleware/deptScope.js';
import { validateBody } from '../../middleware/validate.js';
import { recordAuditLog } from '../../middleware/audit.js';
import { AppError } from '../../middleware/errorHandler.js';

export const tasksRouter = Router();

// ============================================================================
// GET /tasks/board (Kanban Board Grouped by Column)
// ============================================================================
tasksRouter.get(
  '/tasks/board',
  authenticate,
  requirePermission(Permissions.TASK_WORK),
  deptScope(),
  async (req, res, next) => {
    try {
      let queryText = `
        SELECT 
          t.id,
          t.plan_id,
          t.patient_id,
          p.hospital_reg_no,
          p.full_name_enc,
          p.primary_phone_enc,
          t.department_id,
          d.name AS department_name,
          t.type,
          t.title,
          t.status,
          t.priority_score,
          t.priority_reasons,
          t.assignee_id,
          u.full_name AS assignee_name,
          t.due_at,
          t.escalated_at,
          t.escalation_level,
          t.created_at,
          fup.urgency AS plan_urgency,
          fup.reason_category,
          fup.window_end
        FROM tasks t
        JOIN patients p ON t.patient_id = p.id
        LEFT JOIN departments d ON t.department_id = d.id
        LEFT JOIN users u ON t.assignee_id = u.id
        LEFT JOIN follow_up_plans fup ON t.plan_id = fup.id
        WHERE p.deleted_at IS NULL
      `;
      const params = [];

      if (req.departmentIds !== null) {
        if (req.departmentIds.length === 0) {
          return res.status(200).json({
            board: {
              [TaskStatus.TODO]: [],
              [TaskStatus.IN_PROGRESS]: [],
              [TaskStatus.AWAITING_RESPONSE]: [],
              [TaskStatus.ESCALATED]: [],
              [TaskStatus.COMPLETED]: []
            }
          });
        }
        queryText += ` AND t.department_id = ANY($1::uuid[])`;
        params.push(req.departmentIds);
      }

      if (req.query.assignee) {
        params.push(req.query.assignee);
        queryText += ` AND t.assignee_id = $${params.length}`;
      }

      queryText += ` ORDER BY t.priority_score DESC, t.due_at ASC`;

      const result = await pool.query(queryText, params);

      const board = {
        [TaskStatus.TODO]: [],
        [TaskStatus.IN_PROGRESS]: [],
        [TaskStatus.AWAITING_RESPONSE]: [],
        [TaskStatus.ESCALATED]: [],
        [TaskStatus.COMPLETED]: []
      };

      for (const row of result.rows) {
        const item = {
          id: row.id,
          planId: row.plan_id,
          patientId: row.patient_id,
          patientRegNo: row.hospital_reg_no,
          patientName: decrypt(row.full_name_enc),
          departmentId: row.department_id,
          departmentName: row.department_name,
          type: row.type,
          title: row.title,
          status: row.status,
          priorityScore: row.priority_score,
          priorityReasons: row.priority_reasons,
          assigneeId: row.assignee_id,
          assigneeName: row.assignee_name,
          dueAt: row.due_at,
          escalatedAt: row.escalated_at,
          escalationLevel: row.escalation_level,
          createdAt: row.created_at,
          urgency: row.plan_urgency,
          reasonCategory: row.reason_category,
          windowEnd: row.window_end
        };

        if (board[row.status]) {
          board[row.status].push(item);
        }
      }

      res.status(200).json({ board });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// GET /tasks (List Tasks with Filter)
// ============================================================================
tasksRouter.get(
  '/tasks',
  authenticate,
  requirePermission(Permissions.TASK_WORK),
  deptScope(),
  async (req, res, next) => {
    try {
      let queryText = `
        SELECT 
          t.*,
          p.hospital_reg_no,
          p.full_name_enc,
          d.name AS department_name,
          u.full_name AS assignee_name
        FROM tasks t
        JOIN patients p ON t.patient_id = p.id
        LEFT JOIN departments d ON t.department_id = d.id
        LEFT JOIN users u ON t.assignee_id = u.id
        WHERE p.deleted_at IS NULL
      `;
      const params = [];

      if (req.departmentIds !== null) {
        if (req.departmentIds.length === 0) {
          return res.status(200).json({ tasks: [] });
        }
        queryText += ` AND t.department_id = ANY($1::uuid[])`;
        params.push(req.departmentIds);
      }

      if (req.query.status) {
        params.push(req.query.status);
        queryText += ` AND t.status = $${params.length}`;
      }

      queryText += ` ORDER BY t.priority_score DESC, t.due_at ASC LIMIT 100`;

      const result = await pool.query(queryText, params);
      const tasks = result.rows.map(row => ({
        ...row,
        patientName: decrypt(row.full_name_enc),
        full_name_enc: undefined
      }));

      res.status(200).json({ tasks });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// PATCH /tasks/:id/status (Kanban Drag and Drop / Status Transition)
// ============================================================================
// ============================================================================
 // GET /tasks/:id/activity (Department-scoped comments and contact history)
 // ============================================================================
tasksRouter.get(
  '/tasks/:id/activity',
  authenticate,
  requirePermission(Permissions.TASK_WORK),
  deptScope(),
  async (req, res, next) => {
    try {
      const taskRes = await pool.query(
        'SELECT id, department_id FROM tasks WHERE id = $1',
        [req.params.id]
      );
      if (taskRes.rowCount === 0) return next(new AppError('Task not found', 404));
      if (req.departmentIds !== null && !req.departmentIds.includes(taskRes.rows[0].department_id)) {
        return next(new AppError('Forbidden: Access to task department denied', 403));
      }

      const [commentsRes, attemptsRes, transfersRes] = await Promise.all([
        pool.query(
          `SELECT c.id, c.body, c.created_at, u.full_name AS author_name
           FROM task_comments c
           LEFT JOIN users u ON c.author_id = u.id
           WHERE c.task_id = $1
           ORDER BY c.created_at DESC, c.id DESC`,
          [req.params.id]
        ),
        pool.query(
          `SELECT a.id, a.channel, a.outcome, a.notes, a.callback_at,
                  a.attempted_at, u.full_name AS staff_name
           FROM contact_attempts a
           LEFT JOIN users u ON a.staff_id = u.id
           WHERE a.task_id = $1
           ORDER BY a.attempted_at DESC, a.id DESC`,
          [req.params.id]
        ),
        pool.query(
          `SELECT tr.id, tr.reason, tr.created_at,
                  fu.full_name AS from_user_name, tu.full_name AS to_user_name
           FROM task_transfers tr
           LEFT JOIN users fu ON tr.from_user = fu.id
           LEFT JOIN users tu ON tr.to_user = tu.id
           WHERE tr.task_id = $1
           ORDER BY tr.created_at DESC, tr.id DESC`,
          [req.params.id]
        )
      ]);

      res.status(200).json({
        comments: commentsRes.rows,
        contactAttempts: attemptsRes.rows,
        transfers: transfersRes.rows
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// GET /tasks/:id/checklist (Department-scoped checklist)
// ============================================================================
tasksRouter.get(
  '/tasks/:id/checklist',
  authenticate,
  requirePermission(Permissions.TASK_WORK),
  deptScope(),
  async (req, res, next) => {
    try {
      const taskRes = await pool.query('SELECT id, department_id FROM tasks WHERE id = $1', [req.params.id]);
      if (taskRes.rowCount === 0) return next(new AppError('Task not found', 404));
      if (req.departmentIds !== null && !req.departmentIds.includes(taskRes.rows[0].department_id)) {
        return next(new AppError('Forbidden: Access to task department denied', 403));
      }
      const result = await pool.query(
        `SELECT id, task_id, label, done, done_by, done_at, created_at
         FROM task_checklist_items WHERE task_id = $1 ORDER BY created_at, id`,
        [req.params.id]
      );
      res.status(200).json({ checklist: result.rows });
    } catch (err) { next(err); }
  }
);

// ============================================================================
// PATCH /tasks/:id/checklist/:itemId (Mark checklist item done/undone)
// ============================================================================
tasksRouter.patch(
  '/tasks/:id/checklist/:itemId',
  authenticate,
  requirePermission(Permissions.TASK_WORK),
  deptScope(),
  validateBody(UpdateTaskChecklistItemSchema),
  async (req, res, next) => {
    try {
      const { id, itemId } = req.params;
      const taskRes = await pool.query(
        'SELECT id, department_id, status FROM tasks WHERE id = $1',
        [id]
      );
      if (taskRes.rowCount === 0) return next(new AppError('Task not found', 404));
      if (req.departmentIds !== null && !req.departmentIds.includes(taskRes.rows[0].department_id)) {
        return next(new AppError('Forbidden: Access to task department denied', 403));
      }
      const updated = await pool.query(
        `UPDATE task_checklist_items
         SET done = $1,
             done_by = CASE WHEN $1 THEN $2::uuid ELSE NULL END,
             done_at = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE NULL END
         WHERE id = $3 AND task_id = $4
           AND EXISTS (SELECT 1 FROM tasks WHERE id = $4 AND status <> 'completed')
         RETURNING id, task_id, label, done, done_by, done_at, created_at`,
        [req.body.done, req.user.id, itemId, id]
      );
      if (updated.rowCount === 0) {
        const itemRes = await pool.query(
          'SELECT 1 FROM task_checklist_items WHERE id = $1 AND task_id = $2',
          [itemId, id]
        );
        if (itemRes.rowCount === 0) return next(new AppError('Checklist item not found for this task', 404));
        return next(new AppError('Cannot change checklist on a completed task', 409));
      }
      res.status(200).json({ checklistItem: updated.rows[0] });
    } catch (err) { next(err); }
  }
);

// ============================================================================
// PATCH /tasks/:id/status (Kanban Drag and Drop / Status Transition)
// ============================================================================
tasksRouter.patch(
  '/tasks/:id/status',
  authenticate,
  requirePermission(Permissions.TASK_WORK),
  deptScope(),
  validateBody(UpdateTaskStatusSchema),
  async (req, res, next) => {
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      const { id } = req.params;
      const { status, comment } = req.body;
      await client.query('BEGIN');
      transactionStarted = true;

      const taskRes = await client.query(
        `SELECT id, plan_id, department_id, patient_id, status
         FROM tasks WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (taskRes.rowCount === 0) throw new AppError('Task not found', 404);
      const taskRow = taskRes.rows[0];
      if (req.departmentIds !== null && !req.departmentIds.includes(taskRow.department_id)) {
        throw new AppError('Forbidden: Access to task department denied', 403);
      }

      const allowedTransitions = {
        [TaskStatus.TODO]: [TaskStatus.IN_PROGRESS, TaskStatus.ESCALATED],
        [TaskStatus.IN_PROGRESS]: [TaskStatus.AWAITING_RESPONSE, TaskStatus.ESCALATED, TaskStatus.COMPLETED],
        [TaskStatus.AWAITING_RESPONSE]: [TaskStatus.IN_PROGRESS, TaskStatus.ESCALATED, TaskStatus.COMPLETED],
        [TaskStatus.ESCALATED]: [TaskStatus.IN_PROGRESS, TaskStatus.AWAITING_RESPONSE, TaskStatus.COMPLETED],
        [TaskStatus.COMPLETED]: []
      };
      if (taskRow.status !== status && !allowedTransitions[taskRow.status]?.includes(status)) {
        throw new AppError(`Invalid task status transition: ${taskRow.status} -> ${status}`, 409);
      }

      if (status === TaskStatus.COMPLETED && taskRow.status !== TaskStatus.COMPLETED) {
        const checklistRes = await client.query(
          `SELECT COUNT(*) FILTER (WHERE done = FALSE)::int AS incomplete
           FROM task_checklist_items WHERE task_id = $1`,
          [id]
        );
        if (checklistRes.rows[0].incomplete > 0) {
          throw new AppError('All checklist items must be completed before closing this task', 409);
        }
        if (taskRow.plan_id) {
          const outcomeRes = await client.query(
            'SELECT 1 FROM follow_up_outcomes WHERE plan_id = $1',
            [taskRow.plan_id]
          );
          if (outcomeRes.rowCount === 0) {
            throw new AppError('A final follow-up outcome is required before closing this task', 409);
          }
        }
      }

      const completedAt = status === TaskStatus.COMPLETED ? new Date() : null;
      const escalatedAt = status === TaskStatus.ESCALATED ? new Date() : null;
      const updated = await client.query(
        `UPDATE tasks SET
          status = $1::task_status,
          completed_at = CASE WHEN $2::timestamptz IS NOT NULL THEN $2::timestamptz
                              WHEN $1::task_status <> 'completed'::task_status
                              THEN NULL ELSE completed_at END,
          escalated_at = CASE WHEN $3::timestamptz IS NOT NULL
                              THEN $3::timestamptz ELSE escalated_at END,
          updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 RETURNING *`,
        [status, completedAt, escalatedAt, id]
      );
      if (comment) {
        await client.query(
          'INSERT INTO task_comments (task_id, author_id, body) VALUES ($1, $2, $3)',
          [id, req.user.id, comment]
        );
      }
      await client.query('COMMIT');
      transactionStarted = false;

      await recordAuditLog({
        req, action: 'update', entityType: 'tasks', entityId: id,
        patientId: taskRow.patient_id, departmentId: taskRow.department_id,
        metadata: { oldStatus: taskRow.status, newStatus: status }
      });
      res.status(200).json({ message: 'Task status updated', task: updated.rows[0] });
    } catch (err) {
      if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally { client.release(); }
  }
);

// ============================================================================
// POST /tasks/:id/assign (Reassign / Transfer Task)
// ============================================================================
tasksRouter.post(
  '/tasks/:id/assign',
  authenticate,
  requirePermission(Permissions.TASK_WORK),
  deptScope(),
  validateBody(AssignTaskSchema),
  async (req, res, next) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { assignee_id } = req.body;

      const taskRes = await client.query(
        `SELECT id, department_id, patient_id, assignee_id FROM tasks WHERE id = $1`,
        [id]
      );
      if (taskRes.rowCount === 0) {
        return next(new AppError('Task not found', 404));
      }

      const task = taskRes.rows[0];
      if (req.departmentIds !== null && !req.departmentIds.includes(task.department_id)) {
        return next(new AppError('Forbidden: Access to task department denied', 403));
      }

      const memberRes = await client.query(
        `SELECT 1 FROM department_members dm
         JOIN users u ON u.id = dm.user_id
         WHERE dm.user_id = $1 AND dm.department_id = $2
           AND dm.active = TRUE AND u.status = 'active'`,
        [assignee_id, task.department_id]
      );
      if (memberRes.rowCount === 0) {
        return next(new AppError('Assignee must be an active member of this task department', 400));
      }

      if (task.assignee_id === assignee_id) {
        return res.status(200).json({ message: 'Task is already assigned to this staff member', task });
      }

      await client.query('BEGIN');

      const updated = await client.query(
        `UPDATE tasks SET assignee_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
        [assignee_id, id]
      );

      // Record task transfer history
      await client.query(
        `INSERT INTO task_transfers (task_id, from_user, to_user, reason)
         VALUES ($1, $2, $3, 'Staff re-assignment')`,
        [id, task.assignee_id, assignee_id]
      );

      await client.query('COMMIT');

      await recordAuditLog({
        req,
        action: 'update',
        entityType: 'tasks',
        entityId: id,
        patientId: task.patient_id,
        departmentId: task.department_id,
        metadata: { action: 'reassigned', fromUser: task.assignee_id, toUser: assignee_id }
      });

      res.status(200).json({ message: 'Task assigned successfully', task: updated.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      next(err);
    } finally {
      client.release();
    }
  }
);

// ============================================================================
// POST /tasks/:id/comments
// ============================================================================
tasksRouter.post(
  '/tasks/:id/comments',
  authenticate,
  requirePermission(Permissions.TASK_WORK),
  deptScope(),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { body } = req.body;

      if (!body || body.trim().length === 0) {
        return next(new AppError('Comment body is required', 400));
      }

      const taskRes = await pool.query(`SELECT id, department_id FROM tasks WHERE id = $1`, [id]);
      if (taskRes.rowCount === 0) {
        return next(new AppError('Task not found', 404));
      }

      if (req.departmentIds !== null && !req.departmentIds.includes(taskRes.rows[0].department_id)) {
        return next(new AppError('Forbidden: Access to task department denied', 403));
      }

      const commentRes = await pool.query(
        `INSERT INTO task_comments (task_id, author_id, body)
         VALUES ($1, $2, $3)
         RETURNING id, task_id, author_id, body, created_at`,
        [id, req.user.id, body.trim()]
      );

      res.status(201).json({ comment: commentRes.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// POST /tasks/:id/contact-attempts (Outcome Logger)
// ============================================================================
tasksRouter.post(
  '/tasks/:id/contact-attempts',
  authenticate,
  requirePermission(Permissions.TASK_LOG_OUTCOME),
  deptScope(),
  validateBody(LogContactAttemptSchema),
  async (req, res, next) => {
    const client = await pool.connect();
    let transactionStarted = false;
    try {
      const { id } = req.params;
      const {
        channel,
        outcome,
        notes,
        callback_at,
        close_follow_up,
        final_status,
        barrier_type
      } = req.body;

      await client.query('BEGIN');
      transactionStarted = true;
      const taskRes = await client.query(
        `SELECT id, plan_id, patient_id, department_id, status
         FROM tasks WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (taskRes.rowCount === 0) throw new AppError('Task not found', 404);
      const task = taskRes.rows[0];
      if (req.departmentIds !== null && !req.departmentIds.includes(task.department_id)) {
        throw new AppError('Forbidden: Access to task department denied', 403);
      }
      if (task.status === TaskStatus.COMPLETED) {
        throw new AppError('Cannot log a contact attempt for a completed task', 409);
      }
      if (close_follow_up && (!task.plan_id || !final_status)) {
        throw new AppError('Closing a follow-up requires a task with a plan and a final_status', 400);
      }
      if (close_follow_up) {
        const checklistRes = await client.query(
          `SELECT COUNT(*) FILTER (WHERE done = FALSE)::int AS incomplete
           FROM task_checklist_items WHERE task_id = $1`,
          [id]
        );
        if (checklistRes.rows[0].incomplete > 0) {
          throw new AppError('All checklist items must be completed before closing this follow-up', 409);
        }
      }

      const attemptRes = await client.query(
        `INSERT INTO contact_attempts (
          task_id, patient_id, staff_id, channel, outcome, notes, callback_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [id, task.patient_id, req.user.id, channel, outcome, notes || null, callback_at || null]
      );

      // If user marks follow-up closed, create follow_up_outcome and complete task & plan
      if (close_follow_up && final_status && task.plan_id) {
        await client.query(
          `INSERT INTO follow_up_outcomes (
            plan_id, final_status, barrier_type, barrier_note, closed_by
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (plan_id) DO UPDATE SET
            final_status = EXCLUDED.final_status,
            barrier_type = EXCLUDED.barrier_type,
            barrier_note = EXCLUDED.barrier_note,
            closed_by = EXCLUDED.closed_by,
            closed_at = CURRENT_TIMESTAMP`,
          [task.plan_id, final_status, barrier_type || null, notes || null, req.user.id]
        );

        await client.query(
          `UPDATE follow_up_plans SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [task.plan_id]
        );

        await client.query(
          `UPDATE tasks SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [id]
        );
      }

      await client.query('COMMIT');
      transactionStarted = false;

      await recordAuditLog({
        req,
        action: 'create',
        entityType: 'contact_attempts',
        entityId: attemptRes.rows[0].id,
        patientId: task.patient_id,
        departmentId: task.department_id,
        metadata: { outcome, channel, closedFollowUp: Boolean(close_follow_up) }
      });

      res.status(201).json({
        message: 'Contact attempt recorded',
        contactAttempt: attemptRes.rows[0]
      });
    } catch (err) {
      if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
      next(err);
    } finally {
      client.release();
    }
  }
);
