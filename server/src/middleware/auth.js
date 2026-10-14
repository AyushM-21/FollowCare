import { ROLE_PERMISSIONS } from '@followcare/shared';
import { pool } from '../config/db.js';
import { AppError } from './errorHandler.js';

export async function authenticate(req, res, next) {
  try {
    // 1. Staff Session
    if (req.session && req.session.userId) {
      const userRes = await pool.query(
        `SELECT id, email, full_name, role, status FROM users WHERE id = $1`,
        [req.session.userId]
      );

      if (userRes.rowCount === 0) {
        req.session.destroy(() => {});
        return next(new AppError('User account not found', 401, 'https://followcare.org/errors/unauthorized'));
      }

      const user = userRes.rows[0];

      if (user.status !== 'active') {
        req.session.destroy(() => {});
        return next(new AppError(`Account is ${user.status}`, 403, 'https://followcare.org/errors/forbidden'));
      }

      // Load department memberships
      const deptRes = await pool.query(
        `SELECT d.id, d.name, d.code, dm.role_in_dept 
         FROM department_members dm
         JOIN departments d ON dm.department_id = d.id
         WHERE dm.user_id = $1 AND dm.active = TRUE AND d.active = TRUE`,
        [user.id]
      );

      const departments = deptRes.rows;
      const departmentIds = departments.map(d => d.id);

      // Load user permission overrides if any
      const overrideRes = await pool.query(
        `SELECT permission_id, granted FROM user_permission_overrides WHERE user_id = $1`,
        [user.id]
      );
      
      const rolePerms = new Set(ROLE_PERMISSIONS[user.role] || []);
      for (const row of overrideRes.rows) {
        if (row.granted) {
          rolePerms.add(row.permission_id);
        } else {
          rolePerms.delete(row.permission_id);
        }
      }

      req.user = {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        status: user.status,
        permissions: Array.from(rolePerms),
        departments,
        departmentIds
      };

      return next();
    }

    // 2. Patient Session
    if (req.session && req.session.patientId) {
      const ptRes = await pool.query(
        `SELECT id, hospital_reg_no, status, assigned_department_id FROM patients WHERE id = $1 AND deleted_at IS NULL`,
        [req.session.patientId]
      );

      if (ptRes.rowCount === 0) {
        req.session.destroy(() => {});
        return next(new AppError('Patient profile not found', 401, 'https://followcare.org/errors/unauthorized'));
      }

      const patient = ptRes.rows[0];
      req.patient = {
        id: patient.id,
        hospitalRegNo: patient.hospital_reg_no,
        status: patient.status,
        departmentId: patient.assigned_department_id,
        role: 'patient'
      };

      return next();
    }

    return next(new AppError('Authentication required. Please log in.', 401, 'https://followcare.org/errors/unauthorized'));
  } catch (err) {
    next(err);
  }
}

export function optionalAuth(req, res, next) {
  if (req.session && (req.session.userId || req.session.patientId)) {
    return authenticate(req, res, next);
  }
  next();
}
