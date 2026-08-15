import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { BackupRecord } from '../types/backup.types';
import { BACKUP_PREVIEW_LIMIT, BackupList, visibleBackups } from './BackupRestorePanel';

const backup = (index: number): BackupRecord => ({
  id: `backup-${index}`,
  filename: `homeconnect-backup-${index}.backup`,
  sizeBytes: 1024 * index,
  createdAt: `2026-08-${String(15 - index).padStart(2, '0')}T10:00:00.000Z`,
  type: 'AUTO',
  status: 'COMPLETED',
  databaseName: 'homeconnect',
  applicationVersion: '1.9.3',
  postgresVersion: '15',
  checksum: `checksum-${index}`,
  verified: true,
  createdBy: null,
  durationMs: 1000,
  errorMessage: null,
});

describe('BackupList', () => {
  const backups = Array.from({ length: 8 }, (_, index) => backup(index + 1));

  it('shows only the five newest rows initially with a bilingual show-more control', () => {
    const html = renderToStaticMarkup(<BackupList backups={backups} onRestore={() => undefined} />);
    expect(BACKUP_PREVIEW_LIMIT).toBe(5);
    for (const item of backups.slice(0, 5)) expect(html).toContain(item.filename);
    for (const item of backups.slice(5)) expect(html).not.toContain(item.filename);
    expect(html).toContain('Show more (3) / عرض المزيد');
  });

  it('returns every backup after expansion without changing their order', () => {
    expect(visibleBackups(backups, true)).toEqual(backups);
    expect(visibleBackups(backups, false)).toEqual(backups.slice(0, 5));
  });

  it('does not show the control when five or fewer backups exist', () => {
    const html = renderToStaticMarkup(<BackupList backups={backups.slice(0, 5)} onRestore={() => undefined} />);
    expect(html).not.toContain('Show more');
  });
});
