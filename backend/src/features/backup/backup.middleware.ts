import { NextFunction, Request, Response } from 'express';
import { AppError } from '../../lib/errors';
import { backupMaintenance } from './backup-maintenance';

const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Holds off business writes while the database is being restored or repaired.
 *
 * The admin backup and maintenance routes are exempt: they are how the operator
 * drives the very operation that set this state, so blocking them would lock
 * the admin out of finishing it.
 */
export function blockWritesDuringRestore(req: Request, _res: Response, next: NextFunction) {
  if (!writeMethods.has(req.method)) return next();
  if (req.path.startsWith('/api/v1/admin/backups')) return next();
  if (req.path.startsWith('/api/v1/admin/maintenance')) return next();

  const status = backupMaintenance.getStatus();
  if (!backupMaintenance.isWriteBlocked()) return next();

  const operation = status.status === 'REPAIR_IN_PROGRESS' ? 'repair' : 'restore';
  return next(
    new AppError(`System is temporarily unavailable during ${operation}`, 503, 'MAINTENANCE_MODE', status)
  );
}
