import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';
import { buildLanApp } from '../../scanner/lan-listener';
import { routeBranchId } from '../../../test/branch-scope-fixture';

const { receiving, receipt } = vi.hoisted(() => ({
  receiving: { findUnique: vi.fn() },
  receipt: { create: vi.fn(), findMany: vi.fn() },
}));
vi.mock('../../../lib/prisma', async () => ({
  prisma: {
    // Branch tables for the branch-scope middleware, then this suite's own models.
    ...(await import('../../../test/branch-scope-fixture.js')).singleBranchRouteModels(),
    supplierReceiving: receiving, supplierReceivingReceipt: receipt,
  },
  transactionModel: {}, activityLogModel: {},
}));

const receivingId = '33333333-3333-4333-8333-333333333333';
const userId = '22222222-2222-4222-8222-222222222222';
const token = jwt.sign({ userId, role: 'EMPLOYEE' }, process.env.JWT_SECRET!);
const url = `/api/v1/supplier-purchases/${receivingId}/receipts`;
// The LAN gateway forwards over HTTP to the desktop API on 127.0.0.1:PORT,
// so run the real main app on a free port behind it.
let lanApp: Express;
let desktop: http.Server;
beforeAll(async () => {
  desktop = http.createServer(app);
  await new Promise<void>((resolve) => desktop.listen(0, '127.0.0.1', resolve));
  process.env.PORT = String((desktop.address() as { port: number }).port);
  lanApp = buildLanApp();
});
afterAll(async () => {
  await new Promise<void>((resolve) => desktop.close(() => resolve()));
});
let tempDir: string;

beforeEach(async () => {
  vi.clearAllMocks();
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homeconnect-receipts-test-'));
  process.env.RECEIPTS_DIR = tempDir;
  // Receivings belong to a branch; the fixture user can access this one.
  receiving.findUnique.mockResolvedValue({ id: receivingId, branchId: routeBranchId });
  receipt.create.mockImplementation(async ({ data }) => ({ ...data, capturedAt: new Date('2026-10-03T00:00:00Z') }));
  receipt.findMany.mockResolvedValue([]);
});

afterEach(async () => {
  delete process.env.RECEIPTS_DIR;
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('supplier receipt upload', () => {
  it('requires authentication for uploads and listing', async () => {
    expect((await request(app).post(url).set('Content-Type', 'image/png').send(Buffer.from('image'))).status).toBe(401);
    expect((await request(app).get(url)).status).toBe(401);
    expect(receipt.create).not.toHaveBeenCalled();
  });

  it('stores an allowed receipt for an existing receiving', async () => {
    const response = await request(app).post(url).set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/png').send(Buffer.from('image'));
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ supplierReceivingId: receivingId, capturedById: userId, mime: 'image/png', bytes: 5 });
    expect((await fs.readFile(path.join(tempDir, response.body.data.filename))).toString()).toBe('image');
  });

  it('accepts a raw receipt larger than the scanner JSON limit through the LAN allowlist', async () => {
    const response = await request(lanApp).post(url).set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/png').send(Buffer.alloc(6_000, 1));
    expect(response.status).toBe(201);
    expect(response.body.data.bytes).toBe(6_000);
    expect((await fs.stat(path.join(tempDir, response.body.data.filename))).size).toBe(6_000);
  });

  it('rejects an unsupported file type and an empty image', async () => {
    const unsupported = await request(app).post(url).set('Authorization', `Bearer ${token}`).set('Content-Type', 'text/plain').send('image');
    expect(unsupported.status).toBe(400);
    expect(unsupported.body.error.code).toBe('INVALID_MIME');
    const empty = await request(app).post(url).set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/png').send(Buffer.alloc(0));
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('EMPTY_BODY');
    expect(receipt.create).not.toHaveBeenCalled();
  });

  it('returns 413 when the image exceeds 5 MB', async () => {
    const response = await request(app).post(url).set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/png').send(Buffer.alloc(5 * 1024 * 1024 + 1, 1));
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('TOO_LARGE');
    expect(receipt.create).not.toHaveBeenCalled();
  });

  it('returns 404 without writing a file when the receiving does not exist', async () => {
    receiving.findUnique.mockResolvedValue(null);
    const response = await request(app).post(url).set('Authorization', `Bearer ${token}`).set('Content-Type', 'image/jpeg').send(Buffer.from('image'));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await fs.readdir(tempDir)).toEqual([]);
  });
});
