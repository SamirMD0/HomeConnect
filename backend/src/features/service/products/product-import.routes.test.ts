import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';

const { importService } = vi.hoisted(() => ({ importService: {
  createDraft: vi.fn(), getDraft: vi.fn(), updateDraft: vi.fn(), commit: vi.fn(),
} }));
vi.mock('./product-import.service', () => ({ ProductImportService: importService }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

const importId = '11111111-1111-4111-8111-111111111111';
const secret = process.env.JWT_SECRET!;
const admin = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '33333333-3333-4333-8333-333333333333', role: 'EMPLOYEE' }, secret);
const preview = { id: importId, status: 'DRAFT', rows: [], families: [], counts: { total: 0, ready: 0, conflicts: 0, invalid: 0, quantity: 0 } };

describe('product CSV import routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    importService.createDraft.mockResolvedValue(preview);
    importService.getDraft.mockResolvedValue(preview);
    importService.updateDraft.mockResolvedValue(preview);
    importService.commit.mockResolvedValue({ importId, summary: { created: 1, merged: 0, excluded: 0, openingCounts: 1, reconciled: 0 }, items: [] });
  });

  it('creates a durable preview for an administrator', async () => {
    const body = { fileName: 'TCLINV.csv', csvText: 'report,row', sourceSystem: 'legacy-inventory', brand: 'TCL' };
    const response = await request(app).post('/api/v1/products/imports').set('Authorization', `Bearer ${admin}`).send(body);
    expect(response.status).toBe(201);
    expect(importService.createDraft).toHaveBeenCalledWith(body, expect.objectContaining({ role: 'ADMIN' }));
  });

  it('keeps preview and commit routes admin-only', async () => {
    const create = await request(app).post('/api/v1/products/imports').set('Authorization', `Bearer ${employee}`).send({ fileName: 'a.csv', csvText: 'row', sourceSystem: 'legacy', brand: 'TCL' });
    const commit = await request(app).post(`/api/v1/products/imports/${importId}/commit`).set('Authorization', `Bearer ${employee}`).send({ decisions: [] });
    expect(create.status).toBe(403);
    expect(commit.status).toBe(403);
    expect(importService.createDraft).not.toHaveBeenCalled();
    expect(importService.commit).not.toHaveBeenCalled();
  });

  it('validates conflict decisions before committing', async () => {
    const invalid = await request(app).post(`/api/v1/products/imports/${importId}/commit`).set('Authorization', `Bearer ${admin}`).send({ decisions: [{ rowNumber: 1, action: 'MERGE' }] });
    expect(invalid.status).toBe(400);
    expect(importService.commit).not.toHaveBeenCalled();

    const valid = await request(app).post(`/api/v1/products/imports/${importId}/commit`).set('Authorization', `Bearer ${admin}`).send({ decisions: [{ rowNumber: 1, action: 'EXCLUDE' }] });
    expect(valid.status).toBe(200);
    expect(importService.commit).toHaveBeenCalled();
  });
});
