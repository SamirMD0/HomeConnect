import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { BackupRecord, BackupStatus, BackupType } from './backup.types';
import { backupMetadataPath, ensureDirectory } from './backup-paths';

interface BackupMetadataFile {
  records: BackupRecord[];
}

export class BackupMetadataStore {
  static async load(backupDirectory: string): Promise<BackupRecord[]> {
    try {
      const raw = await fs.readFile(backupMetadataPath(backupDirectory), 'utf8');
      const parsed = JSON.parse(raw) as BackupMetadataFile;
      return Array.isArray(parsed.records) ? parsed.records : [];
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code && code !== 'ENOENT') throw error;
      return [];
    }
  }

  static async save(backupDirectory: string, records: BackupRecord[]) {
    await ensureDirectory(backupDirectory);
    await fs.writeFile(
      backupMetadataPath(backupDirectory),
      JSON.stringify({ records }, null, 2),
      'utf8'
    );
  }

  static createRecord(input: {
    filename: string;
    absolutePath: string;
    type: BackupType;
    databaseName: string;
    applicationVersion: string;
    postgresVersion: string | null;
    createdBy: string | null;
  }): BackupRecord {
    return {
      id: randomUUID(),
      filename: input.filename,
      absolutePath: input.absolutePath,
      sizeBytes: 0,
      createdAt: new Date().toISOString(),
      type: input.type,
      status: 'IN_PROGRESS',
      databaseName: input.databaseName,
      applicationVersion: input.applicationVersion,
      postgresVersion: input.postgresVersion,
      checksum: null,
      verified: false,
      createdBy: input.createdBy,
      durationMs: null,
      errorMessage: null,
      restoredAt: null,
    };
  }

  static async upsert(backupDirectory: string, record: BackupRecord) {
    const records = await this.load(backupDirectory);
    const nextRecords = records.some((existing) => existing.id === record.id)
      ? records.map((existing) => (existing.id === record.id ? record : existing))
      : [record, ...records];
    await this.save(backupDirectory, nextRecords);
  }

  static async updateStatus(
    backupDirectory: string,
    id: string,
    status: BackupStatus,
    patch: Partial<BackupRecord> = {}
  ) {
    const records = await this.load(backupDirectory);
    const nextRecords = records.map((record) =>
      record.id === id ? { ...record, ...patch, status } : record
    );
    await this.save(backupDirectory, nextRecords);
  }
}
