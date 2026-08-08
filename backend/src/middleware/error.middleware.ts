import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { logBackendError } from '../features/diagnostics/error-logger';
import { redactSensitiveData } from '../lib/redaction';

/**
 * Client-side conditions that are normal traffic rather than application faults.
 * Recording them in the diagnostics log buries the failures that need attention.
 *
 * 401: the app polls /auth/me and /auth/refresh on every cold start. Failed
 * logins are deliberately still recorded — repeated credential failures against
 * a real account are worth seeing.
 *
 * 429: rate limiting is a working control, not a malfunction. It matters here
 * because the scanner's limiters are reachable from the shop Wi-Fi, so a device
 * hammering a limited route could otherwise write a stack trace per attempt and
 * flood the log it is meant to be visible in.
 */
export const isRoutineClientFailure = (statusCode: number, path: string): boolean => {
  if (statusCode === 429) return true;
  return statusCode === 401 && !path.includes('/auth/login');
};

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (err instanceof AppError) {
    const safeDetails = redactSensitiveData(err.details);
    logger.warn(`[${err.code}] ${err.message}`, { details: safeDetails, path: req.path });

    if (!isRoutineClientFailure(err.statusCode, req.path)) {
      logBackendError({
        method: req.method,
        path: req.path,
        query: req.query,
        status: err.statusCode,
        errorCode: err.code,
        message: err.message,
        stack: err.stack,
      });
    }

    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: safeDetails,
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
