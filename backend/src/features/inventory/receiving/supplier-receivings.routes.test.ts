import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { service } = vi.hoisted(() => ({ service: { create: vi.fn(), list: vi.fn(), get: vi.fn(), duplicateCheck: vi.fn(), updateMetadata: vi.fn(), void: vi.fn() } }));
vi.mock('./supplier-receivings.service', () => ({ SupplierReceivingsService: service }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $queryRaw: vi.fn().mockResolvedValue([{ result: 1 }]) }, transactionModel: {}, activityLogModel: {} }));

import { app } from '../../../app';

const secret = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const admin = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, secret);
const employee = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'EMPLOYEE' }, secret);
const viewer = jwt.sign({ userId: '33333333-3333-4333-8333-333333333333', role: 'VIEWER' }, secret);
const receivingId = '44444444-4444-4444-8444-444444444444';
const supplierId = '55555555-5555-4555-8555-555555555555';
const productId = '02880843-6f16-93fb-2ecc-091af51a07b4';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('supplier receiving routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.create.mockResolvedValue({ id: receivingId });
    service.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 });
    service.get.mockResolvedValue({ id: receivingId });
    service.duplicateCheck.mockResolvedValue({ duplicate: false, match: null });
    service.updateMetadata.mockResolvedValue({ id: receivingId });
    service.void.mockResolvedValue({ id: receivingId, status: 'VOIDED' });
  });

  it.each([admin, employee])('allows ADMIN and EMPLOYEE to create without password', async (token) => {
    const body = { receivedOn: '2026-08-14', items: [{ productId, quantity: 2 }] };
    const response = await request(app).post('/api/v1/inventory/receivings').set(auth(token)).send(body);
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(body, expect.objectContaining({ userId: expect.any(String) }));
  });

  it('requires authentication and an allowed role', async () => {
    expect((await request(app).get('/api/v1/inventory/receivings')).status).toBe(401);
    expect((await request(app).get('/api/v1/inventory/receivings').set(auth(viewer))).status).toBe(403);
  });

  it('registers duplicate-check before the id route and requires supplier plus reference', async () => {
    const url = `/api/v1/inventory/receivings/duplicate-check?supplierId=${supplierId}&referenceNumber=INV-1`;
    expect((await request(app).get(url).set(auth(employee))).status).toBe(200);
    expect(service.duplicateCheck).toHaveBeenCalledWith({ supplierId, referenceNumber: 'INV-1' }, expect.any(Object));
    expect((await request(app).get('/api/v1/inventory/receivings/duplicate-check').set(auth(employee))).status).toBe(400);
    expect(service.get).not.toHaveBeenCalled();
  });

  it('lists and retrieves immutable receiving documents and accepts legacy UUIDs', async () => {
    expect((await request(app).get('/api/v1/inventory/receivings?page=1').set(auth(employee))).status).toBe(200);
    expect((await request(app).get(`/api/v1/inventory/receivings/${productId}`).set(auth(employee))).status).toBe(200);
    expect(service.get).toHaveBeenCalledWith(productId, expect.any(Object));
  });

  it('exposes no delete route and no whole-document update route', async () => {
    expect((await request(app).patch(`/api/v1/inventory/receivings/${receivingId}`).set(auth(admin)).send({})).status).toBe(404);
    expect((await request(app).delete(`/api/v1/inventory/receivings/${receivingId}`).set(auth(admin))).status).toBe(404);
    expect((await request(app).delete(`/api/v1/inventory/receivings/${receivingId}/void`).set(auth(admin))).status).toBe(404);
  });

  it('lets an admin correct reference and note, with a reason, and nothing else', async () => {
    const body = { referenceNumber: 'INV-9', note: 'Corrected supplier slip', reason: 'Wrong invoice number typed at the counter' };
    const response = await request(app).patch(`/api/v1/inventory/receivings/${receivingId}/metadata`).set(auth(admin)).send(body);
    expect(response.status).toBe(200);
    expect(service.updateMetadata).toHaveBeenCalledWith(receivingId, body, expect.objectContaining({ userId: expect.any(String) }), expect.any(Object));

    // A quantity, product, or date is not a metadata correction.
    for (const extra of [{ quantity: 3 }, { items: [] }, { receivedOn: '2026-08-01' }, { supplierId }]) {
      const rejected = await request(app).patch(`/api/v1/inventory/receivings/${receivingId}/metadata`).set(auth(admin)).send({ ...body, ...extra });
      expect(rejected.status).toBe(400);
    }
  });

  it('rejects a metadata correction with a missing or too-short reason', async () => {
    for (const reason of [undefined, '', 'oops']) {
      const response = await request(app).patch(`/api/v1/inventory/receivings/${receivingId}/metadata`).set(auth(admin)).send({ referenceNumber: 'INV-9', reason });
      expect(response.status).toBe(400);
    }
    expect(service.updateMetadata).not.toHaveBeenCalled();
  });

  it('lets an admin void with a reason and a password', async () => {
    const body = { reason: 'Delivery returned to the supplier', accountPassword: 'secret' };
    const response = await request(app).post(`/api/v1/inventory/receivings/${receivingId}/void`).set(auth(admin)).send(body);
    expect(response.status).toBe(200);
    expect(service.void).toHaveBeenCalledWith(receivingId, body, expect.objectContaining({ userId: expect.any(String) }), expect.any(Object));
  });

  it('rejects a void with a missing reason or password', async () => {
    for (const body of [{ accountPassword: 'secret' }, { reason: 'Delivery returned to the supplier' }, { reason: 'bad', accountPassword: 'secret' }]) {
      expect((await request(app).post(`/api/v1/inventory/receivings/${receivingId}/void`).set(auth(admin)).send(body)).status).toBe(400);
    }
    expect(service.void).not.toHaveBeenCalled();
  });

  /** Employees receive stock. They never take it back off the shelf by voiding a document. */
  it('refuses both correction routes to employees', async () => {
    expect((await request(app).patch(`/api/v1/inventory/receivings/${receivingId}/metadata`).set(auth(employee)).send({ reason: 'Wrong invoice number' })).status).toBe(403);
    expect((await request(app).post(`/api/v1/inventory/receivings/${receivingId}/void`).set(auth(employee)).send({ reason: 'Returned to supplier', accountPassword: 'secret' })).status).toBe(403);
    expect(service.updateMetadata).not.toHaveBeenCalled();
    expect(service.void).not.toHaveBeenCalled();
  });
});
