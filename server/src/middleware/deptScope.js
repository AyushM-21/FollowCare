import { AppError } from './errorHandler.js';

export function deptScope(options = {}) {
  const { requireSpecific = false } = options;

  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'https://followcare.org/errors/unauthorized'));
    }

    const requestedDept = req.query.department || req.params.departmentId || req.body?.department_id;

    // Admin has access to all departments
    if (req.user.role === 'admin') {
      if (requestedDept) {
        req.departmentIds = [requestedDept];
        req.activeDepartmentId = requestedDept;
      } else {
        req.departmentIds = null; // null indicates unrestricted/all departments
        req.activeDepartmentId = null;
      }

      if (requireSpecific && !req.activeDepartmentId) {
        return next(new AppError('A specific department must be selected', 400));
      }
      return next();
    }

    // For all other roles, restrict strictly to department memberships
    const userDepts = req.user.departmentIds || [];

    if (requestedDept) {
      if (!userDepts.includes(requestedDept)) {
        return next(new AppError('Forbidden: Access to requested department is not permitted', 403, 'https://followcare.org/errors/forbidden'));
      }
      req.departmentIds = [requestedDept];
      req.activeDepartmentId = requestedDept;
    } else {
      req.departmentIds = userDepts;
      req.activeDepartmentId = userDepts.length === 1 ? userDepts[0] : null;
    }

    if (requireSpecific && !req.activeDepartmentId) {
      return next(new AppError('A specific department must be selected', 400));
    }

    next();
  };
}
