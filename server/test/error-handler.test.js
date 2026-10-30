import { describe, it, expect, vi } from 'vitest';
import { errorHandler, AppError } from '../src/middleware/errorHandler.js';

function responseDouble() {
  const res = {
    headers: {},
    statusCode: null,
    body: null,
    getHeader: vi.fn(() => undefined),
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  return res;
}

describe('central error response privacy', () => {
  it('does not expose internal exception messages or query strings for server errors', () => {
    const req = {
      path: '/api/patients',
      originalUrl: '/api/patients?phone=private-value',
      id: 'request-test-1'
    };
    const res = responseDouble();

    errorHandler(new Error('database failed for private patient value'), req, res);

    expect(res.statusCode).toBe(500);
    expect(res.body.detail).toBe('An unexpected error occurred');
    expect(res.body.instance).toBe('/api/patients');
    expect(JSON.stringify(res.body)).not.toContain('private-value');
    expect(JSON.stringify(res.body)).not.toContain('database failed');
  });

  it('preserves intentional client-facing AppError details', () => {
    const req = { path: '/api/auth/login', originalUrl: '/api/auth/login?debug=1', id: 'request-test-2' };
    const res = responseDouble();

    errorHandler(new AppError('Invalid email or password', 401), req, res);

    expect(res.statusCode).toBe(401);
    expect(res.body.detail).toBe('Invalid email or password');
    expect(res.body.instance).toBe('/api/auth/login');
  });
});
