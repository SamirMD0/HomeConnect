import type { SupplierReceivingReceipt } from '@prisma/client';
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

const { receiving, receipt, blob, supplier } = vi.hoisted(() => ({
  receiving: { findUnique: vi.fn() },
  receipt: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  blob: { findUnique: vi.fn() },
  supplier: { findUnique: vi.fn() },
}));
vi.mock('../../../lib/prisma', async () => ({
  prisma: {
    // Branch tables for the branch-scope middleware, then this suite's own models.
    ...(await import('../../../test/branch-scope-fixture.js')).singleBranchRouteModels(),
    supplierReceiving: receiving,
    supplierReceivingReceipt: receipt,
    supplierReceiptBlob: blob,
    supplier,
  },
  transactionModel: {},
  activityLogModel: {},
}));

const receivingId = '33333333-3333-4333-8333-333333333333';
const supplierId = '44444444-4444-4444-8444-444444444444';
const billId = '55555555-5555-4555-8555-555555555555';
const inbox = `/api/v1/suppliers/${supplierId}/bills`;
const billUrl = `/api/v1/supplier-bills/${billId}`;
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
const rows = new Map<string, SupplierReceivingReceipt>();
const adminToken = jwt.sign({ userId, role: 'ADMIN' }, process.env.JWT_SECRET!);

beforeEach(async () => {
  vi.clearAllMocks();
  rows.clear();
  delete process.env.HOSTED_MODE;
  delete process.env.RECEIPT_STORAGE;
  supplier.findUnique.mockResolvedValue({ id: supplierId, branchId: routeBranchId });
  blob.findUnique.mockResolvedValue(null);
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'homeconnect-receipts-test-'));
  process.env.RECEIPTS_DIR = tempDir;
  // Receivings belong to a branch; the fixture user can access this one.
  receiving.findUnique.mockResolvedValue({ id: receivingId, supplierId, branchId: routeBranchId });
  receipt.create.mockImplementation(async ({ data }) => {
    const row = { ...data, capturedAt: new Date('2026-10-03T00:00:00Z') };
    rows.set(row.id, row);
    return row;
  });
  receipt.findUnique.mockImplementation(async ({ where }) => rows.get(where.id) ?? null);
  receipt.update.mockImplementation(async ({ where, data }) => {
    const row = { ...rows.get(where.id), ...data };
    rows.set(where.id, row);
    return row;
  });
  receipt.delete.mockImplementation(async ({ where }) => {
    const row = rows.get(where.id);
    rows.delete(where.id);
    return row;
  });
  receipt.findMany.mockResolvedValue([]);
});

afterEach(async () => {
  delete process.env.RECEIPTS_DIR;
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe('supplier receipt upload', () => {
  it('requires authentication for uploads and listing', async () => {
    expect(
      (await request(app).post(url).set('Content-Type', 'image/png').send(Buffer.from('image')))
        .status
    ).toBe(401);
    expect((await request(app).get(url)).status).toBe(401);
    expect(receipt.create).not.toHaveBeenCalled();
  });

  it('stores an allowed receipt for an existing receiving', async () => {
    const response = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'image/png')
      .send(Buffer.from('image'));
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      supplierReceivingId: receivingId,
      capturedById: userId,
      mime: 'image/png',
      bytes: 5,
    });
    expect((await fs.readFile(path.join(tempDir, response.body.data.filename))).toString()).toBe(
      'image'
    );
  });

  it('accepts a raw receipt larger than the scanner JSON limit through the LAN allowlist', async () => {
    const response = await request(lanApp)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'image/png')
      .send(Buffer.alloc(6_000, 1));
    expect(response.status).toBe(201);
    expect(response.body.data.bytes).toBe(6_000);
    expect((await fs.stat(path.join(tempDir, response.body.data.filename))).size).toBe(6_000);
  });

  it('rejects an unsupported file type and an empty image', async () => {
    const unsupported = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'text/plain')
      .send('image');
    expect(unsupported.status).toBe(400);
    expect(unsupported.body.error.code).toBe('INVALID_MIME');
    const empty = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'image/png')
      .send(Buffer.alloc(0));
    expect(empty.status).toBe(400);
    expect(empty.body.error.code).toBe('EMPTY_BODY');
    expect(receipt.create).not.toHaveBeenCalled();
  });

  it('returns 413 when the image exceeds 8 MB', async () => {
    const response = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'image/png')
      .send(Buffer.alloc(8 * 1024 * 1024 + 1, 1));
    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('TOO_LARGE');
    expect(receipt.create).not.toHaveBeenCalled();
  });

  it('returns 404 without writing a file when the receiving does not exist', async () => {
    receiving.findUnique.mockResolvedValue(null);
    const response = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('image'));
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(await fs.readdir(tempDir)).toEqual([]);
  });
});

async function seedBill(branchId = routeBranchId) {
  const row = {
    id: billId,
    supplierId,
    branchId,
    supplierReceivingId: null,
    note: null,
    filename: `${billId}.jpg`,
    mime: 'image/jpeg',
    bytes: 5,
    capturedAt: new Date(),
    capturedById: userId,
  };
  rows.set(billId, row);
  await fs.writeFile(path.join(tempDir, row.filename), 'photo');
  return row;
}
describe('supplier bills inbox', () => {
  it('requires authentication on every new route', async () => {
    expect(
      (await request(app).post(inbox).set('Content-Type', 'image/jpeg').send('image')).status
    ).toBe(401);
    expect((await request(app).get(inbox)).status).toBe(401);
    expect((await request(app).patch(billUrl).send({ supplierReceivingId: null })).status).toBe(
      401
    );
    expect((await request(app).get(`${billUrl}/image`)).status).toBe(401);
    expect((await request(app).delete(billUrl)).status).toBe(401);
  });
  it('saves an unlinked bill and optional note through the LAN gateway', async () => {
    const response = await request(lanApp)
      .post(`${inbox}?note=Page%20one`)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('photo'));
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      supplierId,
      branchId: routeBranchId,
      supplierReceivingId: null,
      note: 'Page one',
    });
    expect(await fs.readFile(path.join(tempDir, response.body.data.filename), 'utf8')).toBe(
      'photo'
    );
  });
  it('deduplicates an upload retried after an interrupted response', async () => {
    const send = () =>
      request(lanApp)
        .post(inbox)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Receipt-Id', billId)
        .set('Content-Type', 'image/jpeg')
        .send(Buffer.from('photo'));
    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(201);
    expect(receipt.create).toHaveBeenCalledTimes(1);
    expect(rows.size).toBe(1);
    expect(await fs.readdir(tempDir)).toEqual([`${billId}.jpg`]);
  });
  it('rejects wrong MIME, empty body, oversized image and invalid note', async () => {
    for (const [mime, data, status, code] of [
      ['text/plain', Buffer.from('photo'), 400, 'INVALID_MIME'],
      ['image/jpeg', Buffer.alloc(0), 400, 'EMPTY_BODY'],
      ['image/jpeg', Buffer.alloc(8 * 1024 * 1024 + 1), 413, 'TOO_LARGE'],
    ] as const) {
      const response = await request(app)
        .post(inbox)
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', mime)
        .send(data);
      expect(response.status).toBe(status);
      expect(response.body.error.code).toBe(code);
    }
    expect(
      (
        await request(app)
          .post(`${inbox}?note=${'a'.repeat(2001)}`)
          .set('Authorization', `Bearer ${token}`)
          .set('Content-Type', 'image/jpeg')
          .send(Buffer.from('p'))
      ).status
    ).toBe(400);
    expect(receipt.create).not.toHaveBeenCalled();
  });
  it('accepts images between the former 5 MB cap and 8 MB', async () => {
    const response = await request(app)
      .post(inbox)
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.alloc(6 * 1024 * 1024));
    expect(response.status).toBe(201);
  });
  it.each(['false', 'true', 'all'])(
    'lists the requested linked=%s metadata without image bytes',
    async (linked) => {
      const row = await seedBill();
      receipt.findMany.mockResolvedValue([row]);
      const response = await request(app)
        .get(`${inbox}?linked=${linked}`)
        .set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.body.data[0].id).toBe(billId);
      expect(receipt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            supplierId,
            branchId: { in: [routeBranchId] },
            ...(linked === 'all'
              ? {}
              : { supplierReceivingId: linked === 'true' ? { not: null } : null }),
          }),
        })
      );
      expect(response.body.data[0]).not.toHaveProperty('data');
    }
  );
  it('rejects invalid filters', async () => {
    expect(
      (await request(app).get(`${inbox}?linked=maybe`).set('Authorization', `Bearer ${token}`))
        .status
    ).toBe(400);
  });
  it('links and unlinks a bill, preserving its note unless supplied', async () => {
    await seedBill();
    const linked = await request(app)
      .patch(billUrl)
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierReceivingId: receivingId, note: 'Checked' });
    expect(linked.status).toBe(200);
    expect(linked.body.data.supplierReceivingId).toBe(receivingId);
    const unlinked = await request(app)
      .patch(billUrl)
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierReceivingId: null });
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.data).toMatchObject({ supplierReceivingId: null, note: 'Checked' });
  });
  it('rejects a link to another supplier or branch', async () => {
    await seedBill();
    for (const receivingRow of [
      { id: receivingId, branchId: routeBranchId, supplierId: userId },
      { id: receivingId, branchId: userId, supplierId },
    ]) {
      receiving.findUnique.mockResolvedValue(receivingRow);
      const response = await request(app)
        .patch(billUrl)
        .set('Authorization', `Bearer ${token}`)
        .send({ supplierReceivingId: receivingId });
      expect(response.status).toBe(400);
    }
    expect(receipt.update).not.toHaveBeenCalled();
  });
  it('streams image bytes with a private cache and correct MIME', async () => {
    await seedBill();
    const response = await request(app)
      .get(`${billUrl}/image`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['cache-control']).toBe('private, max-age=86400');
    expect(response.body.toString()).toBe('photo');
  });
  it('loads persisted database bytes instead of requiring a disk file', async () => {
    await seedBill();
    await fs.unlink(path.join(tempDir, `${billId}.jpg`));
    blob.findUnique.mockResolvedValue({ receiptId: billId, data: Buffer.from('db-photo') });
    const response = await request(app)
      .get(`${billUrl}/image`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.toString()).toBe('db-photo');
  });
  it('rejects branch scope on each route, including image and delete', async () => {
    await seedBill(userId);
    for (const method of ['get', 'post'] as const) {
      const agent = request(app);
      const response = await agent[method](inbox)
        .set('Authorization', `Bearer ${token}`)
        .set('X-Branch-Scope', userId);
      expect(response.status).toBe(403);
    }
    expect(
      (await request(app).get(`${billUrl}/image`).set('Authorization', `Bearer ${token}`)).status
    ).toBe(404);
    expect(
      (
        await request(app)
          .patch(billUrl)
          .set('Authorization', `Bearer ${token}`)
          .send({ supplierReceivingId: null })
      ).status
    ).toBe(404);
    expect(
      (await request(app).delete(billUrl).set('Authorization', `Bearer ${adminToken}`)).status
    ).toBe(404);
    expect(receipt.delete).not.toHaveBeenCalled();
  });
  it('allows admin deletion, removes the disk file, and refuses employee deletion', async () => {
    await seedBill();
    expect(
      (await request(app).delete(billUrl).set('Authorization', `Bearer ${token}`)).status
    ).toBe(403);
    expect(
      (await request(app).delete(billUrl).set('Authorization', `Bearer ${adminToken}`)).status
    ).toBe(200);
    expect(rows.has(billId)).toBe(false);
    expect(await fs.readdir(tempDir)).toEqual([]);
  });
  it('returns 404 for absent bills and blocks unsafe disk filenames', async () => {
    expect(
      (await request(app).get(`${billUrl}/image`).set('Authorization', `Bearer ${token}`)).status
    ).toBe(404);
    await seedBill();
    rows.get(billId)!.filename = '../outside.jpg';
    expect(
      (await request(app).get(`${billUrl}/image`).set('Authorization', `Bearer ${token}`)).status
    ).toBe(500);
  });
  it('keeps purchase receipt listing available for receiving ids', async () => {
    receipt.findMany.mockResolvedValue([await seedBill()]);
    const response = await request(lanApp).get(url).set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(receipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ supplierReceivingId: receivingId }),
      })
    );
  });
});
