import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { BackupCommandError, BackupInvalidError, BackupNotFoundError, BackupValidationError } from './backup.errors';
import { BackupCommandRunner } from './backup-command-runner';
import { backupMaintenance } from './backup-maintenance';
import { BackupMetadataStore } from './backup-metadata.store';
import { BackupOperationLock } from './backup-operation-lock';
import {
  assertPathInsideDirectory,
  assertSafeBackupDirectory,
  ensureDirectory,
} from './backup-paths';
import { BackupSettingsStore } from './backup-settings.store';
import { verifyAdminPasswordForCorrection } from '../financial/authorization/account-password';
import { PostgresToolDiscovery } from './postgres-tools';
import { parsePostgresConnectionString } from './postgres-url';
import {
  BackupListQuery,
  BackupListResult,
  BackupRecord,
  BackupSettings,
  BackupType,
  PublicBackupRecord,
  RestoreValidationResult,
} from './backup.types';

const APPLICATION_VERSION = process.env.npm_package_version || '1.0.0';
const MIN_BACKUP_SIZE_BYTES = 1;
const AUTO_BACKUP_CATCHUP_HOURS = 24;

export class BackupService {
  static async getStatus() {
    const settings = await BackupSettingsStore.load();
    const records = await BackupMetadataStore.load(settings.backupDirectory);
    const lastSuccessfulBackup =
      records
        .filter((record) => record.status === 'COMPLETED')
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;

    return {
      system: backupMaintenance.getStatus(),
      runningOperation: BackupOperationLock.current(),
      settings,
      lastSuccessfulBackup: lastSuccessfulBackup ? this.toPublicRecord(lastSuccessfulBackup) : null,
      nextScheduledBackup: this.nextScheduledBackup(settings),
    };
  }

  static async getSettings() {
    const settings = await BackupSettingsStore.load();
    return {
      ...settings,
      discoveredTools: PostgresToolDiscovery.discover(settings),
    };
  }

  static async updateSettings(input: Partial<BackupSettings>) {
    const current = await BackupSettingsStore.load();
    const backupDirectory = input.backupDirectory
      ? assertSafeBackupDirectory(input.backupDirectory)
      : current.backupDirectory;
    const next = await BackupSettingsStore.save({
      ...current,
      ...input,
      backupDirectory,
    });
    await ensureDirectory(next.backupDirectory);
    return this.getSettings();
  }

  static async listBackups(query: BackupListQuery): Promise<BackupListResult> {
    const settings = await BackupSettingsStore.load();
    const records = await BackupMetadataStore.load(settings.backupDirectory);
    const filtered = records
      .filter((record) => !query.type || record.type === query.type)
      .filter((record) => !query.status || record.status === query.status)
      .sort((left, right) =>
        query.sortOrder === 'ASC'
          ? left.createdAt.localeCompare(right.createdAt)
          : right.createdAt.localeCompare(left.createdAt)
      );
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    const items = filtered
      .slice((query.page - 1) * query.limit, query.page * query.limit)
      .map((record) => this.toPublicRecord(record));

    return {
      items,
      pagination: { page: query.page, limit: query.limit, total, totalPages },
    };
  }

  static async createManualBackup(createdBy: string | null) {
    const record = await BackupOperationLock.runExclusive('BACKUP', () =>
      this.createBackupInternal('MANUAL', createdBy)
    );
    return this.toPublicRecord(record);
  }

  static async importExternalBackup(sourcePath: string, createdBy: string | null) {
    const settings = await BackupSettingsStore.load();
    await ensureDirectory(settings.backupDirectory);
    const sourceAbsolutePath = path.resolve(sourcePath);

    if (!path.isAbsolute(sourcePath)) {
      throw new BackupValidationError('Backup file path must be absolute');
    }

    if (!sourceAbsolutePath.toLowerCase().endsWith('.backup')) {
      throw new BackupInvalidError('Backup file must use .backup extension');
    }

    const sourceStats = await fs.stat(sourceAbsolutePath);
    if (!sourceStats.isFile() || sourceStats.size < MIN_BACKUP_SIZE_BYTES) {
      throw new BackupInvalidError('Backup file is empty or invalid');
    }

    const destinationPath = await this.nextImportedBackupPath(settings.backupDirectory, sourceAbsolutePath);
    const copiedFile = path.resolve(sourceAbsolutePath) !== path.resolve(destinationPath);
    if (copiedFile) {
      await fs.copyFile(sourceAbsolutePath, destinationPath);
    }

    const connection = parsePostgresConnectionString();
    const record = BackupMetadataStore.createRecord({
      filename: path.basename(destinationPath),
      absolutePath: destinationPath,
      type: 'MANUAL',
      databaseName: connection.database,
      applicationVersion: APPLICATION_VERSION,
      postgresVersion: null,
      createdBy,
    });

    try {
      const verified = await this.verifyBackupFile(settings, { ...record, absolutePath: destinationPath });
      const completedRecord: BackupRecord = {
        ...record,
        status: 'COMPLETED',
        sizeBytes: verified.sizeBytes,
        checksum: verified.checksum,
        verified: verified.verified,
        durationMs: null,
      };
      await BackupMetadataStore.upsert(settings.backupDirectory, completedRecord);
      logger.info('backup_imported', { backupId: completedRecord.id, filename: completedRecord.filename, actor: createdBy });
      return this.toPublicRecord(completedRecord);
    } catch (error) {
      if (copiedFile) {
        await BackupCommandRunner.removeIncompleteFile(destinationPath);
      }
      throw error;
    }
  }

  static async createAutomaticBackup() {
    const record = await BackupOperationLock.runExclusive('BACKUP', () =>
      this.createBackupInternal('AUTO', null)
    );
    const settings = await BackupSettingsStore.load();
    await BackupSettingsStore.save({ ...settings, lastAutomaticBackupAt: record.createdAt });
    await this.applyAutomaticRetention();
    return this.toPublicRecord(record);
  }

  static async validateRestore(backupId: string): Promise<RestoreValidationResult> {
    const settings = await BackupSettingsStore.load();
    const record = await this.findBackupRecord(settings.backupDirectory, backupId);
    const validation = await this.verifyBackupFile(settings, record);
    const checksumMatches = record.checksum ? validation.checksum === record.checksum : true;
    const compatible = record.applicationVersion === APPLICATION_VERSION;

    return {
      backup: this.toPublicRecord({ ...record, checksum: validation.checksum, verified: validation.verified }),
      checksumMatches,
      archiveReadable: validation.verified,
      compatible,
      warnings: [
        ...(checksumMatches ? [] : ['Backup checksum does not match stored metadata']),
        ...(compatible ? [] : ['Backup was created by a different application version']),
      ],
    };
  }

  static async restoreBackup(
    backupId: string,
    confirmation: 'RESTORE',
    accountPassword: string,
    createdBy: string | null
  ) {
    if (confirmation !== 'RESTORE') {
      throw new BackupValidationError('Restore confirmation must be RESTORE');
    }
    if (!createdBy) {
      throw new BackupValidationError('Restore requires an authenticated administrator');
    }

    await verifyAdminPasswordForCorrection(createdBy, accountPassword, {
      action: 'DATABASE_RESTORE',
      recordType: 'BACKUP',
      recordId: backupId,
    });

    return BackupOperationLock.runExclusive('RESTORE', async () => {
      backupMaintenance.enter('RESTORE_IN_PROGRESS', 'Database restore is running');
      const settings = await BackupSettingsStore.load();
      const record = await this.findBackupRecord(settings.backupDirectory, backupId);

      try {
        const validation = await this.validateRestore(backupId);
        if (!validation.archiveReadable || !validation.checksumMatches || !validation.compatible) {
          throw new BackupInvalidError('Backup is not safe to restore', validation);
        }

        logger.warn('pre_restore_backup_started', { backupId, actor: createdBy });
        const safetyBackup = await this.createBackupInternal('PRE_RESTORE', createdBy, false);
        logger.warn('restore_started', { backupId, safetyBackupId: safetyBackup.id, actor: createdBy });

        const tools = this.requireTools(settings);
        const connection = parsePostgresConnectionString();
        await prisma.$disconnect();
        const result = await BackupCommandRunner.runCommand(
          tools.pgRestorePath,
          BackupCommandRunner.pgRestoreArgs(connection, record.absolutePath),
          connection
        );

        if (result.exitCode !== 0) {
          throw new BackupCommandError('pg_restore failed', this.safeCommandDetails(result.stderr));
        }

        await this.verifyRestoredDatabase();
        await BackupMetadataStore.updateStatus(settings.backupDirectory, record.id, 'RESTORED', {
          restoredAt: new Date().toISOString(),
        });
        backupMaintenance.exit();
        logger.warn('restore_completed', { backupId, safetyBackupId: safetyBackup.id, actor: createdBy });

        return {
          restoredBackup: this.toPublicRecord({ ...record, status: 'RESTORED', restoredAt: new Date().toISOString() }),
          preRestoreBackup: this.toPublicRecord(safetyBackup),
          restartRequired: true,
        };
      } catch (error) {
        backupMaintenance.exit();
        logger.error('restore_failed', {
          backupId,
          actor: createdBy,
          error: error instanceof Error ? error.message : 'Unknown restore failure',
        });
        throw error;
      }
    });
  }

  static shouldRunStartupCatchup(settings: BackupSettings, now = new Date()) {
    if (!settings.automaticBackupsEnabled) return false;
    if (!settings.lastAutomaticBackupAt) return true;

    const lastBackupTime = new Date(settings.lastAutomaticBackupAt).getTime();
    return now.getTime() - lastBackupTime > AUTO_BACKUP_CATCHUP_HOURS * 60 * 60 * 1000;
  }

  static async applyAutomaticRetention() {
    const settings = await BackupSettingsStore.load();
    const records = await BackupMetadataStore.load(settings.backupDirectory);
    const completedAutoBackups = records
      .filter((record) => record.type === 'AUTO' && record.status === 'COMPLETED')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const keep = Math.max(1, settings.automaticRetentionCount);
    const deletable = completedAutoBackups.slice(keep);

    for (const record of deletable) {
      try {
        assertPathInsideDirectory(settings.backupDirectory, record.absolutePath);
        await fs.unlink(record.absolutePath);
        await BackupMetadataStore.updateStatus(settings.backupDirectory, record.id, 'DELETED', {
          errorMessage: null,
        });
        logger.info('backup_retention_deleted', { backupId: record.id, filename: record.filename });
      } catch (error) {
        logger.warn('backup_retention_delete_failed', {
          backupId: record.id,
          error: error instanceof Error ? error.message : 'Unknown delete failure',
        });
      }
    }
  }

  private static async createBackupInternal(
    type: BackupType,
    createdBy: string | null,
    updateMaintenance = true
  ) {
      const settings = await BackupSettingsStore.load();
      await ensureDirectory(settings.backupDirectory);
      const tools = this.requireTools(settings);
      const connection = parsePostgresConnectionString();
      const filename = this.generateBackupFilename(type, new Date());
      const absolutePath = assertPathInsideDirectory(settings.backupDirectory, path.join(settings.backupDirectory, filename));
      const record = BackupMetadataStore.createRecord({
        filename,
        absolutePath,
        type,
        databaseName: connection.database,
        applicationVersion: APPLICATION_VERSION,
        postgresVersion: null,
        createdBy,
      });

      await BackupMetadataStore.upsert(settings.backupDirectory, record);
      if (updateMaintenance) backupMaintenance.enter('BACKUP_IN_PROGRESS', 'Database backup is running');
      logger.info('backup_started', { backupId: record.id, type, actor: createdBy });
      const startedAt = Date.now();

      try {
        const result = await BackupCommandRunner.runCommand(
          tools.pgDumpPath,
          BackupCommandRunner.pgDumpArgs(connection, absolutePath),
          connection
        );
        if (result.exitCode !== 0) {
          throw new BackupCommandError('pg_dump failed', this.safeCommandDetails(result.stderr));
        }

        const verified = await this.verifyBackupFile(settings, { ...record, absolutePath });
        const completedRecord: BackupRecord = {
          ...record,
          status: 'COMPLETED',
          sizeBytes: verified.sizeBytes,
          checksum: verified.checksum,
          verified: verified.verified,
          durationMs: Date.now() - startedAt,
        };
        await BackupMetadataStore.upsert(settings.backupDirectory, completedRecord);
        if (updateMaintenance) backupMaintenance.exit();
        logger.info('backup_completed', {
          backupId: record.id,
          type,
          sizeBytes: completedRecord.sizeBytes,
          durationMs: completedRecord.durationMs,
        });
        return completedRecord;
      } catch (error) {
        await BackupCommandRunner.removeIncompleteFile(absolutePath);
        const failedRecord: BackupRecord = {
          ...record,
          status: 'FAILED',
          durationMs: Date.now() - startedAt,
          errorMessage: error instanceof Error ? error.message : 'Unknown backup failure',
        };
        await BackupMetadataStore.upsert(settings.backupDirectory, failedRecord);
        if (updateMaintenance) backupMaintenance.exit();
        logger.error('backup_failed', {
          backupId: record.id,
          type,
          error: failedRecord.errorMessage,
        });
        throw error;
      }
  }

  static generateBackupFilename(type: BackupType, inputDate: Date) {
    const timestamp = formatLocalTimestamp(inputDate);
    const typeLabel = type.toLowerCase().replace('_', '-');
    return `homeconnect-${timestamp}-${typeLabel}.backup`;
  }

  private static async nextImportedBackupPath(backupDirectory: string, sourcePath: string) {
    const parsed = path.parse(sourcePath);
    const safeBaseName = parsed.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'imported-backup';
    const candidateBaseName = safeBaseName.endsWith('-imported') ? safeBaseName : `${safeBaseName}-imported`;

    for (let index = 0; index < 1000; index += 1) {
      const suffix = index === 0 ? '' : `-${index}`;
      const candidate = assertPathInsideDirectory(
        backupDirectory,
        path.join(backupDirectory, `${candidateBaseName}${suffix}.backup`)
      );

      try {
        await fs.access(candidate);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') return candidate;
        throw error;
      }
    }

    throw new BackupValidationError('Could not create a unique imported backup filename');
  }

  private static async verifyBackupFile(settings: BackupSettings, record: BackupRecord) {
    const tools = this.requireTools(settings);
    const absolutePath = assertPathInsideDirectory(settings.backupDirectory, record.absolutePath);
    if (!absolutePath.endsWith('.backup')) {
      throw new BackupInvalidError('Backup file must use .backup extension');
    }

    const stats = await fs.stat(absolutePath);
    if (stats.size < MIN_BACKUP_SIZE_BYTES) {
      throw new BackupInvalidError('Backup file is empty');
    }

    const checksum = await sha256File(absolutePath);
    const connection = parsePostgresConnectionString();
    const result = await BackupCommandRunner.runCommand(
      tools.pgRestorePath,
      BackupCommandRunner.pgRestoreListArgs(absolutePath),
      connection
    );
    if (result.exitCode !== 0) {
      throw new BackupInvalidError('pg_restore could not read backup archive', this.safeCommandDetails(result.stderr));
    }

    return {
      sizeBytes: stats.size,
      checksum,
      verified: true,
    };
  }

  private static async findBackupRecord(backupDirectory: string, backupId: string) {
    const records = await BackupMetadataStore.load(backupDirectory);
    const record = records.find((backup) => backup.id === backupId && backup.status !== 'DELETED');
    if (!record) throw new BackupNotFoundError();
    return {
      ...record,
      absolutePath: assertPathInsideDirectory(backupDirectory, record.absolutePath),
    };
  }

  private static requireTools(settings: BackupSettings) {
    const tools = PostgresToolDiscovery.discover(settings);
    if (!tools.pgDumpPath || !tools.pgRestorePath) {
      throw new BackupValidationError('PostgreSQL backup tools were not found', tools);
    }
    return {
      pgDumpPath: tools.pgDumpPath,
      pgRestorePath: tools.pgRestorePath,
      psqlPath: tools.psqlPath,
    };
  }

  private static async verifyRestoredDatabase() {
    await prisma.$connect();
    await prisma.user.count();
    await prisma.customer.count();
    await prisma.debt.count();
    await prisma.installmentPlan.count();
    await prisma.payment.count();
  }

  private static toPublicRecord(record: BackupRecord): PublicBackupRecord {
    const publicRecord = { ...record };
    delete (publicRecord as Partial<BackupRecord>).absolutePath;
    return publicRecord;
  }

  private static safeCommandDetails(stderr: string) {
    return { stderr: stderr.slice(0, 2000) };
  }

  private static nextScheduledBackup(settings: BackupSettings) {
    if (!settings.automaticBackupsEnabled) return null;
    const [hour, minute] = settings.automaticBackupTime.split(':').map(Number);
    const next = new Date();
    next.setHours(hour, minute, 0, 0);
    if (next <= new Date()) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
}

async function sha256File(filePath: string) {
  const buffer = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function formatLocalTimestamp(inputDate: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.BUSINESS_TIMEZONE || 'Asia/Beirut',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .formatToParts(inputDate)
    .reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}
