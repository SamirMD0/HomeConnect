import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';

const { backupServiceMock } = vi.hoisted(() => ({
  backupServiceMock: {
    getStatus: vi.fn(),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    listBackups: vi.fn(),
    createManualBackup: vi.fn(),
    validateRestore: vi.fn(),
    restoreBackup: vi.fn(),
  },
}));

vi.mock('./backup.service', () => ({
  BackupService: backupServiceMock,
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]),
  },
  transactionModel: {},
  activityLogModel: {},
}));

const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const adminToken = jwt.sign(
  { userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' },
  jwtSecret
);
const employeeToken = jwt.sign(
  { userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' },
  jwtSecret
);

const backupRecord = {
  id: '33333333-3333-4333-8333-333333333333',
  filename: 'homeconnect-2026-07-25-143012-manual.backup',
  sizeBytes: 123,
  createdAt: '2026-07-25T11:30:12.000Z',
  type: 'MANUAL',
  status: 'COMPLETED',
  databaseName: 'homeconnect',
  applicationVersion: '1.0.0',
  postgresVersion: null,
  checksum: 'abc123',
  verified: true,
  createdBy: '11111111-1111-4111-8111-111111111111',
  durationMs: 250,
  errorMessage: null,
};

describe('backup admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backupServiceMock.getStatus.mockResolvedValue({ system: { status: 'NORMAL', message: null } });
    backupServiceMock.getSettings.mockResolvedValue({ backupDirectory: 'C:/Backups' });
    backupServiceMock.updateSettings.mockResolvedValue({ backupDirectory: 'C:/Backups' });
    backupServiceMock.listBackups.mockResolvedValue({
      items: [backupRecord],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });
    backupServiceMock.createManualBackup.mockResolvedValue(backupRecord);
    backupServiceMock.validateRestore.mockResolvedValue({
      backup: backupRecord,
      checksumMatches: true,
      archiveReadable: true,
      compatible: true,
      warnings: [],
    });
    backupServiceMock.restoreBackup.mockResolvedValue({
      restoredBackup: backupRecord,
      preRestoreBackup: { ...backupRecord, type: 'PRE_RESTORE' },
      restartRequired: true,
    });
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/admin/backups');

    expect(response.status).toBe(401);
    expect(backupServiceMock.listBackups).not.toHaveBeenCalled();
  });

  it('rejects non-admin users', async () => {
    const response = await request(app)
      .get('/api/v1/admin/backups')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(response.status).toBe(403);
    expect(backupServiceMock.listBackups).not.toHaveBeenCalled();
  });

  it('allows admins to list backups', async () => {
    const response = await request(app)
      .get('/api/v1/admin/backups?type=MANUAL&page=1&limit=25')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.data.items[0].filename).toBe(backupRecord.filename);
    expect(backupServiceMock.listBackups).toHaveBeenCalledWith({
      type: 'MANUAL',
      status: undefined,
      page: 1,
      limit: 25,
      sortOrder: 'DESC',
    });
  });

  it('allows admins to create a manual backup', async () => {
    const response = await request(app)
      .post('/api/v1/admin/backups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'MANUAL' });

    expect(response.status).toBe(201);
    expect(backupServiceMock.createManualBackup).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111'
    );
    expect(response.body.data).not.toHaveProperty('absolutePath');
  });

  it('requires typed RESTORE confirmation', async () => {
    const response = await request(app)
      .post(`/api/v1/admin/backups/${backupRecord.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirmation: 'restore' });

    expect(response.status).toBe(400);
    expect(backupServiceMock.restoreBackup).not.toHaveBeenCalled();
  });

  it('validates and restores selected backups for admins', async () => {
    const validateResponse = await request(app)
      .post(`/api/v1/admin/backups/${backupRecord.id}/validate-restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    const restoreResponse = await request(app)
      .post(`/api/v1/admin/backups/${backupRecord.id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ confirmation: 'RESTORE' });

    expect(validateResponse.status).toBe(200);
    expect(restoreResponse.status).toBe(200);
    expect(backupServiceMock.validateRestore).toHaveBeenCalledWith(backupRecord.id);
    expect(backupServiceMock.restoreBackup).toHaveBeenCalledWith(
      backupRecord.id,
      'RESTORE',
      '11111111-1111-4111-8111-111111111111'
    );
  });
});
