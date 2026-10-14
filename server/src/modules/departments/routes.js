import { Router } from 'express';
import { pool } from '../../config/db.js';
import { authenticate } from '../../middleware/auth.js';

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
