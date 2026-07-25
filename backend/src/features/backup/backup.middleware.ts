import { NextFunction, Request, Response } from 'express';
import { AppError } from '../../lib/errors';
import { backupMaintenance } from './backup-maintenance';

const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function blockWritesDuringRestore(req: Request, _res: Response, next: NextFunction) {
  if (!writeMethods.has(req.method)) return next();
  if (req.path.startsWith('/api/v1/admin/backups')) return next();

  const status = backupMaintenance.getStatus();
  if (!backupMaintenance.isWriteBlocked()) return next();

  return next(
    new AppError('System is temporarily unavailable during restore', 503, 'MAINTENANCE_MODE', status)
  );
}
