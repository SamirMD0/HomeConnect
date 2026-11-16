import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger';

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
      logger.info(`[${req.method}] ${req.header('X-Sync-Action') ? req.path : req.originalUrl} - ${res.statusCode} - ${duration}ms`);
  });
  next();
};
