/**
 * API Fetch Client for FollowCare
 * Follows ARCHITECTURE.md: Cookie-based sessions with credentials: 'include'
 * Parses RFC 7807 problem details on error.
 */

export class ApiError extends Error {
  constructor(message, status, problemDetails = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.problemDetails = problemDetails;
  }
}

async function request(url, options = {}) {
  const defaultHeaders = {
    'Accept': 'application/json'
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    defaultHeaders['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, {
    ...options,
    credentials: 'include', // Ensures session cookie (fc.sid) is always sent
    headers: {
      ...defaultHeaders,
      ...options.headers
    }
  });

  if (!response.ok) {
    let errorDetail = 'An error occurred during request';
    let problemDetails = null;

    try {
      const data = await response.json();
      problemDetails = data;
      errorDetail = data.detail || data.message || `HTTP ${response.status} ${response.statusText}`;
    } catch (e) {
      errorDetail = `HTTP ${response.status} ${response.statusText}`;
    }

    throw new ApiError(errorDetail, response.status, problemDetails);
  }

  // If 204 No Content
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  get: (url, options) => request(url, { ...options, method: 'GET' }),
  post: (url, body, options) => request(url, { ...options, method: 'POST', body }),
  patch: (url, body, options) => request(url, { ...options, method: 'PATCH', body }),
  put: (url, body, options) => request(url, { ...options, method: 'PUT', body }),
  delete: (url, options) => request(url, { ...options, method: 'DELETE' })
};
