import { logger } from '../../lib/logger';
import { BackupService } from './backup.service';
import { BackupSettingsStore } from './backup-settings.store';

const MINUTE_MS = 60 * 1000;

export class BackupScheduler {
  private static timer: ReturnType<typeof setTimeout> | null = null;
  private static startupCatchupChecked = false;

  static start() {
    if (process.env.NODE_ENV === 'test') return;

    void this.runStartupCatchup();
    void this.scheduleNext();
  }

  static stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.startupCatchupChecked = false;
  }

  static async runStartupCatchup() {
    if (this.startupCatchupChecked) return;
    this.startupCatchupChecked = true;

    try {
      const settings = await BackupSettingsStore.load();
      if (!BackupService.shouldRunStartupCatchup(settings)) return;

      setTimeout(() => {
        void BackupService.createAutomaticBackup().catch((error) => {
          logger.error('backup_startup_catchup_failed', {
            error: error instanceof Error ? error.message : 'Unknown backup catch-up failure',
          });
        });
      }, MINUTE_MS);
    } catch (error) {
      logger.error('backup_startup_catchup_check_failed', {
        error: error instanceof Error ? error.message : 'Unknown scheduler failure',
      });
    }
  }

  static async scheduleNext() {
    const settings = await BackupSettingsStore.load();
    if (!settings.automaticBackupsEnabled) return;

    const nextRunAt = nextRunDate(settings.automaticBackupTime);
    const delayMs = Math.max(MINUTE_MS, nextRunAt.getTime() - Date.now());
    this.timer = setTimeout(() => {
      void BackupService.createAutomaticBackup()
        .catch((error) => {
          logger.error('backup_scheduled_failed', {
            error: error instanceof Error ? error.message : 'Unknown scheduled backup failure',
          });
        })
        .finally(() => {
          void this.scheduleNext();
        });
    }, delayMs);
  }
}

function nextRunDate(time: string) {
  const [hour, minute] = time.split(':').map(Number);
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next;
}
