import { SystemStatus } from './backup.types';

class BackupMaintenanceState {
  private status: SystemStatus = 'NORMAL';
  private message: string | null = null;

  getStatus() {
    return {
      status: this.status,
      message: this.message,
    };
  }

  enter(status: Exclude<SystemStatus, 'NORMAL'>, message: string) {
    this.status = status;
    this.message = message;
  }

  exit() {
    this.status = 'NORMAL';
    this.message = null;
  }

  isWriteBlocked() {
    return this.status === 'RESTORE_IN_PROGRESS' || this.status === 'RESTART_REQUIRED';
  }
}

export const backupMaintenance = new BackupMaintenanceState();
