import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { logBackendError } from '../features/diagnostics/error-logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof AppError) {
    logger.warn(`[${err.code}] ${err.message}`, { details: err.details, path: req.path });
    
    logBackendError({
      method: req.method,
      path: req.path,
      query: req.query,
      status: err.statusCode,
      errorCode: err.code,
      message: err.message,
      stack: err.stack,
    });

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }

  logger.error(`[UNHANDLED_ERROR] ${err.message}`, { stack: err.stack, path: req.path });
  
  logBackendError({
    method: req.method,
    path: req.path,
    query: req.query,
    status: 500,
    errorCode: 'INTERNAL_ERROR',
    message: err.message,
    stack: err.stack,
  });

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
    meta: { timestamp: new Date().toISOString() },
  });
};
