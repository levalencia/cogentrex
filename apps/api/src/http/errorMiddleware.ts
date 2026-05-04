import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { HttpError } from './errors.js';
import type { AppLogger } from '../observability/logger.js';
import { redactForLog } from '../observability/logger.js';

export function errorMiddleware(rootLogger: AppLogger): ErrorRequestHandler {
  return (error, req, res, _next) => {
  if (error instanceof ZodError) {
    req.logger?.warn({ details: error.flatten() }, 'request_validation_failed');
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request body',
        details: error.flatten(),
      },
    });
    return;
  }

  if (error instanceof HttpError) {
    const log = error.status >= 500 ? (req.logger ?? rootLogger).error.bind(req.logger ?? rootLogger) : (req.logger ?? rootLogger).warn.bind(req.logger ?? rootLogger);
    log({ status: error.status, code: error.code, details: redactForLog(error.details) }, 'request_failed');
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    });
    return;
  }

  (req.logger ?? rootLogger).error({ error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : redactForLog(error) }, 'request_unhandled_error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected server error',
    },
  });
};
}
