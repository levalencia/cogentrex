import type { NextFunction, Request, Response } from 'express';
import type { AppLogger } from './logger.js';
import { createRequestId } from './logger.js';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      logger?: AppLogger;
    }
  }
}

export function requestLogger(rootLogger: AppLogger) {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = req.header('x-request-id') ?? createRequestId();
    const start = performance.now();
    req.requestId = requestId;
    req.logger = rootLogger.child({ requestId });
    res.setHeader('x-request-id', requestId);

    req.logger.info({ method: req.method, path: req.path }, 'request_started');
    res.on('finish', () => {
      req.logger?.info({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Math.round(performance.now() - start),
      }, 'request_finished');
    });
    next();
  };
}
