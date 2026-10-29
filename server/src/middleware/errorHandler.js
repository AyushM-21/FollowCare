import { logger } from '../config/logger.js';

export class AppError extends Error {
  constructor(message, statusCode = 500, type = 'about:blank', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.type = type;
    this.details = details;
  }
}

export function errorHandler(err, req, res, next) {
  const status = err.statusCode || (err.status ? Number(err.status) : 500);
  const type = err.type || (status === 400 ? 'https://followcare.org/errors/bad-request' : 'about:blank');
  const title = err.title || (status === 404 ? 'Not Found' : status === 403 ? 'Forbidden' : status === 401 ? 'Unauthorized' : 'Internal Server Error');
  const isServerError = status >= 500;
  // Never reflect query strings or internal exception details in public responses.
  const instance = req.path || req.originalUrl?.split('?')[0] || '/';
  const requestId = req.id || res.getHeader('X-Request-Id');
  const detail = isServerError ? 'An unexpected error occurred' : (err.message || 'An unexpected error occurred');

  if (isServerError) {
    // Avoid serializing exception messages/stacks that may contain patient data or secrets.
    logger.error({ requestId, instance, status, errorName: err.name }, 'Internal server error');
  } else {
    logger.warn({ requestId, instance, status }, `Client Error: ${detail}`);
  }

  const problemDetails = {
    type,
    title,
    status,
    detail,
    instance,
    requestId
  };

  // Validation issues contain field names/messages, not submitted values.
  if (!isServerError && (err.details || err.errors)) {
    problemDetails.invalidParams = err.details || err.errors;
  }

  res.setHeader('Content-Type', 'application/problem+json');
  res.status(status).json(problemDetails);
}
