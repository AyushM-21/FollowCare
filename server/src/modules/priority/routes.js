import { Router } from 'express';
import { pool } from '../../config/db.js';
import { decrypt } from '../../lib/crypto.js';
import { authenticate } from '../../middleware/auth.js';
import { deptScope } from '../../middleware/deptScope.js';
import { requirePermission } from '../../middleware/rbac.js';
import { Permissions } from '@followcare/shared';

export const priorityRouter = Router();

// ============================================================================
// GET /priority-queue (Transparent Priority Scored Tasks)
// ============================================================================
priorityRouter.get(
  '/priority-queue',
  authenticate,
  deptScope(),
  async (req, res, next) => {
    try {
      let deptFilter = '';
      const params = [];

      if (req.departmentIds !== null) {
        if (req.departmentIds.length === 0) {
          return res.status(200).json({ queue: [] });
        }
        deptFilter = 'AND t.department_id = ANY($1::uuid[])';
        params.push(req.departmentIds);
      }

      const queryText = `
        SELECT 
          t.id AS task_id,
          t.title,
          t.type,
          t.status,
          t.priority_score,
          t.priority_reasons,
          t.due_at,
          t.patient_id,
          p.hospital_reg_no,
          p.full_name_enc,
          d.name AS department_name,
          fup.window_end,
          fup.urgency,
          u.full_name AS assignee_name
        FROM tasks t
        JOIN patients p ON t.patient_id = p.id
        LEFT JOIN departments d ON t.department_id = d.id
        LEFT JOIN follow_up_plans fup ON t.plan_id = fup.id
        LEFT JOIN users u ON t.assignee_id = u.id
        WHERE t.status != 'completed' AND p.deleted_at IS NULL ${deptFilter}
        ORDER BY t.priority_score DESC, fup.window_end ASC
        LIMIT 100
      `;

      const result = await pool.query(queryText, params);
      const queue = result.rows.map(row => ({
        ...row,
        patientName: decrypt(row.full_name_enc),
        full_name_enc: undefined
      }));

      res.status(200).json({ queue });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// GET /priority/rules (Transparent Prioritization Rules)
// ============================================================================
priorityRouter.get(
  '/priority/rules',
  authenticate,
  requirePermission(Permissions.MANAGE_SETTINGS),
  async (req, res, next) => {
    try {
      const result = await pool.query(`SELECT key, weight, active, description FROM priority_rules ORDER BY weight DESC`);
      res.status(200).json({ rules: result.rows });
    } catch (err) {
      next(err);
    }
  }
);
