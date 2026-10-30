import { Router } from 'express';
import { pool } from '../../config/db.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { deptScope } from '../../middleware/deptScope.js';
import { Permissions } from '@followcare/shared';
import { AppError } from '../../middleware/errorHandler.js';

export const departmentsRouter = Router();

departmentsRouter.get('/departments', authenticate, async (req, res, next) => {
  try {
    let queryText = 'SELECT id, name, code, active FROM departments WHERE active = TRUE ORDER BY name ASC';
    const params = [];

    // If staff user is not admin, limit to their authorized departments
    if (req.user && req.user.role !== 'admin') {
      queryText = `
        SELECT d.id, d.name, d.code, d.active 
        FROM departments d
        JOIN department_members dm ON d.id = dm.department_id
        WHERE dm.user_id = $1 AND dm.active = TRUE AND d.active = TRUE
        ORDER BY d.name ASC
      `;
      params.push(req.user.id);
    }

    const result = await pool.query(queryText, params);
    res.status(200).json({ departments: result.rows });
  } catch (err) {
    next(err);
  }
});


// Active staff members available for task assignment within a department.
departmentsRouter.get(
  '/departments/:id/members',
  authenticate,
  requirePermission(Permissions.TASK_WORK),
  deptScope(),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      if (req.departmentIds !== null && !req.departmentIds.includes(id)) {
        return next(new AppError('Forbidden: Access to department denied', 403));
      }

      const result = await pool.query(
        `SELECT u.id, u.full_name, u.role
         FROM department_members dm
         JOIN users u ON u.id = dm.user_id
         WHERE dm.department_id = $1
           AND dm.active = TRUE
           AND u.status = 'active'
         ORDER BY u.full_name ASC`,
        [id]
      );

      res.status(200).json({
        members: result.rows.map(row => ({
          id: row.id,
          fullName: row.full_name,
          role: row.role
        }))
      });
    } catch (err) {
      next(err);
    }
  }
);
