export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function notFound(message = 'Resource not found'): HttpError {
  return new HttpError(404, 'NOT_FOUND', message);
}

export function unauthorized(message = 'Authentication required'): HttpError {
  return new HttpError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Forbidden'): HttpError {
  return new HttpError(403, 'FORBIDDEN', message);
}

export function conflict(message = 'Conflict'): HttpError {
  return new HttpError(409, 'CONFLICT', message);
}
