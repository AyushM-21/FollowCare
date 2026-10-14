import { Router } from 'express';
import { pool } from '../../config/db.js';
import { decrypt } from '../../lib/crypto.js';
import { authenticate } from '../../middleware/auth.js';
import { deptScope } from '../../middleware/deptScope.js';

export const dashboardRouter = Router();

// ============================================================================
// GET /dashboard/metrics (Command Center KPI Tiles per Section 9.4)
// ============================================================================
dashboardRouter.get(
  '/dashboard/metrics',
  authenticate,
  deptScope(),
  async (req, res, next) => {
    try {
      let filterClause = '';
      const params = [];

      if (req.departmentIds !== null) {
        if (req.departmentIds.length === 0) {
          return res.status(200).json({
            metrics: {
              activePlans: { count: 0, filter: 'all' },
              dueToday: { count: 0, filter: 'due_today' },
              dueSoon: { count: 0, filter: 'due_soon' },
              overdue: { count: 0, filter: 'overdue' },
              confirmed: { count: 0, filter: 'confirmed' },
              returned: { count: 0, filter: 'returned' },
              unreachable: { count: 0, filter: 'unreachable' },
              awaitingAction: { count: 0, filter: 'awaiting_action' },
              unacknowledged: { count: 0, filter: 'unacknowledged' }
            }
          });
        }
        filterClause = 'WHERE department_id = ANY($1::uuid[])';
        params.push(req.departmentIds);
      }

      const queryText = `
        SELECT
          COUNT(*) FILTER (WHERE plan_status = 'active') AS active_count,
          COUNT(*) FILTER (WHERE computed_status = 'due_today') AS due_today_count,
          COUNT(*) FILTER (WHERE computed_status = 'due_soon') AS due_soon_count,
          COUNT(*) FILTER (WHERE computed_status = 'overdue') AS overdue_count,
          COUNT(*) FILTER (WHERE computed_status = 'confirmed') AS confirmed_count,
          COUNT(*) FILTER (WHERE computed_status = 'returned') AS returned_count,
          COUNT(*) FILTER (WHERE computed_status = 'unreachable') AS unreachable_count,
          COUNT(*) FILTER (WHERE computed_status = 'awaiting_action') AS awaiting_action_count,
          COUNT(*) FILTER (WHERE ack_status = 'pending') AS unacknowledged_count
        FROM v_follow_up_status
        ${filterClause}
      `;

      const result = await pool.query(queryText, params);
      const row = result.rows[0];

      res.status(200).json({
        metrics: {
          activePlans: { count: parseInt(row.active_count || '0', 10), filter: 'active' },
          dueToday: { count: parseInt(row.due_today_count || '0', 10), filter: 'due_today' },
          dueSoon: { count: parseInt(row.due_soon_count || '0', 10), filter: 'due_soon' },
          overdue: { count: parseInt(row.overdue_count || '0', 10), filter: 'overdue' },
          confirmed: { count: parseInt(row.confirmed_count || '0', 10), filter: 'confirmed' },
          returned: { count: parseInt(row.returned_count || '0', 10), filter: 'returned' },
          unreachable: { count: parseInt(row.unreachable_count || '0', 10), filter: 'unreachable' },
          awaitingAction: { count: parseInt(row.awaiting_action_count || '0', 10), filter: 'awaiting_action' },
          unacknowledged: { count: parseInt(row.unacknowledged_count || '0', 10), filter: 'unacknowledged' }
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// GET /dashboard/workload (Staff Workload Breakdown)
// ============================================================================
dashboardRouter.get(
  '/dashboard/workload',
  authenticate,
  deptScope(),
  async (req, res, next) => {
    try {
      let deptFilter = '';
      const params = [];

      if (req.departmentIds !== null) {
        if (req.departmentIds.length === 0) {
          return res.status(200).json({ workload: [] });
        }
        deptFilter = 'AND t.department_id = ANY($1::uuid[])';
        params.push(req.departmentIds);
      }

      const queryText = `
        SELECT 
          COALESCE(u.full_name, 'Unassigned') AS staff_name,
          COALESCE(u.id::text, 'unassigned') AS staff_id,
          u.role AS staff_role,
          COUNT(*) FILTER (WHERE t.status != 'completed') AS active_tasks,
          COUNT(*) FILTER (WHERE t.status = 'completed') AS completed_tasks,
          COUNT(*) FILTER (WHERE t.status = 'escalated') AS escalated_tasks
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id = u.id
        WHERE 1=1 ${deptFilter}
        GROUP BY u.id, u.full_name, u.role
        ORDER BY active_tasks DESC
      `;

      const result = await pool.query(queryText, params);
      res.status(200).json({ workload: result.rows });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// GET /dashboard/overdue (Overdue Follow-up Priority List)
// ============================================================================
dashboardRouter.get(
  '/dashboard/overdue',
  authenticate,
  deptScope(),
  async (req, res, next) => {
    try {
      let deptFilter = '';
      const params = [];

      if (req.departmentIds !== null) {
        if (req.departmentIds.length === 0) {
          return res.status(200).json({ overdue: [] });
        }
        deptFilter = 'AND v.department_id = ANY($1::uuid[])';
        params.push(req.departmentIds);
      }

      const queryText = `
        SELECT 
          v.plan_id,
          v.patient_id,
          p.hospital_reg_no,
          p.full_name_enc,
          d.name AS department_name,
          v.urgency,
          v.window_end,
          ABS(v.days_remaining) AS days_overdue,
          v.priority_score,
          u.full_name AS owner_name
        FROM v_follow_up_status v
        JOIN patients p ON v.patient_id = p.id
        LEFT JOIN departments d ON v.department_id = d.id
        LEFT JOIN users u ON v.owner_task_assignee = u.id
        WHERE v.computed_status = 'overdue' ${deptFilter}
        ORDER BY v.priority_score DESC, v.days_remaining ASC
        LIMIT 50
      `;

      const result = await pool.query(queryText, params);
      const overdue = result.rows.map(row => ({
        ...row,
        patientName: decrypt(row.full_name_enc),
        full_name_enc: undefined
      }));

      res.status(200).json({ overdue });
    } catch (err) {
      next(err);
    }
  }
);
