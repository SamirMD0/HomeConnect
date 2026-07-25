import { AppError, NotFoundError, ValidationError } from '../../lib/errors';

export class BackupConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'BACKUP_CONFLICT');
  }
}

export class BackupCommandError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'BACKUP_COMMAND_FAILED', details);
  }
}

export class BackupInvalidError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, 'BACKUP_INVALID', details);
  }
}

export class BackupNotFoundError extends NotFoundError {
  constructor() {
    super('Backup not found');
  }
}

export class BackupValidationError extends ValidationError {
  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}
