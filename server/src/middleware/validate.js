import { AppError } from './errorHandler.js';

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message
      }));
      const err = new AppError('Validation failed', 400, 'https://followcare.org/errors/validation', issues);
      return next(err);
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const issues = result.error.issues.map(i => ({
        field: i.path.join('.'),
        message: i.message
      }));
      const err = new AppError('Query parameter validation failed', 400, 'https://followcare.org/errors/validation', issues);
      return next(err);
    }
    req.query = result.data;
    next();
  };
}
