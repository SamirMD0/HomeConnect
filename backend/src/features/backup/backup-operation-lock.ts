import { BackupConflictError } from './backup.errors';

export class BackupOperationLock {
  private static activeOperation: 'BACKUP' | 'RESTORE' | null = null;

  static async runExclusive<T>(operation: 'BACKUP' | 'RESTORE', callback: () => Promise<T>): Promise<T> {
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
