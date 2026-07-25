import fs from 'fs/promises';
import path from 'path';
import { BackupSettings } from './backup.types';
import {
  assertSafeBackupDirectory,
  backupSettingsPath,
  defaultBackupDirectory,
  ensureDirectory,
} from './backup-paths';

const DEFAULT_RETENTION = 30;

export class BackupSettingsStore {
  static async load(): Promise<BackupSettings> {
    const settingsPath = backupSettingsPath();

    try {
      const raw = await fs.readFile(settingsPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<BackupSettings>;
      return this.normalize(parsed);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && code !== 'ENOENT') throw error;
      return this.normalize({});
    }
  }

  static async save(settings: BackupSettings): Promise<BackupSettings> {
    const normalized = this.normalize(settings);
    await ensureDirectory(path.dirname(backupSettingsPath()));
    await fs.writeFile(backupSettingsPath(), JSON.stringify(normalized, null, 2), 'utf8');
    return normalized;
  }

  static normalize(input: Partial<BackupSettings>): BackupSettings {
    const backupDirectory = assertSafeBackupDirectory(input.backupDirectory || defaultBackupDirectory());
    const retention = Number(input.automaticRetentionCount ?? DEFAULT_RETENTION);

    return {
      backupDirectory,
      automaticBackupsEnabled: input.automaticBackupsEnabled ?? true,
      automaticBackupTime: validateTime(input.automaticBackupTime || '02:00'),
      automaticRetentionCount: [7, 14, 30, 60, 90].includes(retention) ? retention : DEFAULT_RETENTION,
      pgDumpPath: input.pgDumpPath || null,
      pgRestorePath: input.pgRestorePath || null,
      psqlPath: input.psqlPath || null,
      lastAutomaticBackupAt: input.lastAutomaticBackupAt || null,
    };
  }
}

function validateTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return '02:00';
  const [hourPart, minutePart] = value.split(':');
  const hour = Number(hourPart);
  const minute = Number(minutePart);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return '02:00';
  return value;
}
