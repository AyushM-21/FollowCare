import { AppError } from './errorHandler.js';

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'https://followcare.org/errors/unauthorized'));
    }

    if (!req.user.permissions || !req.user.permissions.includes(permission)) {
      return next(new AppError(
        `Forbidden: Role '${req.user.role}' lacks permission '${permission}'`,
        403,
        'https://followcare.org/errors/forbidden'
      ));
    }

    next();
  };
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401, 'https://followcare.org/errors/unauthorized'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError(
        `Forbidden: Role '${req.user.role}' is not authorized for this resource`,
        403,
        'https://followcare.org/errors/forbidden'
      ));
    }

    next();
  };
}
