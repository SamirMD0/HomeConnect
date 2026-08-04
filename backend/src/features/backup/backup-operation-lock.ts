import { BackupConflictError } from './backup.errors';

/**
 * Backup, restore and repair all move the database underneath the running app,
 * so a single lock covers all three — they must never overlap.
 */
export type BackupOperation = 'BACKUP' | 'RESTORE' | 'REPAIR';

export class BackupOperationLock {
  private static activeOperation: BackupOperation | null = null;

  static async runExclusive<T>(operation: BackupOperation, callback: () => Promise<T>): Promise<T> {
    if (this.activeOperation) {
      throw new BackupConflictError(`${this.activeOperation.toLowerCase()} operation already running`);
    }

    this.activeOperation = operation;
    try {
      return await callback();
    } finally {
      this.activeOperation = null;
    }
  }

  static current() {
    return this.activeOperation;
  }
}
