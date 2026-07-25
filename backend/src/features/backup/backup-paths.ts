import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { BackupValidationError } from './backup.errors';

const APP_DIR_NAME = 'HomeConnect';
const BACKUP_DIR_NAME = 'HomeConnect Backups';

export function defaultBackupDirectory() {
  return path.join(os.homedir(), 'Documents', BACKUP_DIR_NAME);
}

export function backupConfigDirectory() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, APP_DIR_NAME);
}

export function backupSettingsPath() {
  return path.join(backupConfigDirectory(), 'backup-settings.json');
}

export function backupMetadataPath(backupDirectory: string) {
  return path.join(backupDirectory, '.homeconnect-backups.json');
}

export async function ensureDirectory(directory: string) {
  await fs.mkdir(directory, { recursive: true });
}

export function assertSafeBackupDirectory(input: string): string {
  if (!input || !path.isAbsolute(input)) {
    throw new BackupValidationError('Backup directory must be an absolute path');
  }

  const resolved = path.resolve(input);
  const normalized = resolved.toLowerCase();
  const cwd = path.resolve(process.cwd()).toLowerCase();
  const tmp = path.resolve(os.tmpdir()).toLowerCase();

  if (isSubPathOrSame(normalized, cwd)) {
    throw new BackupValidationError('Backup directory cannot be inside the project repository');
  }

  if (normalized.includes(`${path.sep}node_modules${path.sep}`)) {
    throw new BackupValidationError('Backup directory cannot be inside node_modules');
  }

  if (isSubPathOrSame(normalized, tmp)) {
    throw new BackupValidationError('Backup directory cannot be a temporary directory');
  }

  return resolved;
}

export function assertPathInsideDirectory(baseDirectory: string, targetPath: string): string {
  const base = path.resolve(baseDirectory);
  const target = path.resolve(targetPath);
  const relative = path.relative(base, target);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new BackupValidationError('Backup path must stay inside the configured backup directory');
  }

  return target;
}

function isSubPathOrSame(target: string, base: string): boolean {
  return target === base || target.startsWith(`${base}${path.sep}`);
}
