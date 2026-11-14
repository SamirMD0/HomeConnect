import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { branchFixture } from '../../test/branch-fixture';
import { isIsolatedTestDatabase } from '../../test/database';
import { readChanges } from './sync-feed.service';

const enabled = process.env.RUN_SYNC_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
const marker = randomUUID();
const userId = randomUUID();
const customerId = randomUUID();
const productIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
let branchId: string;
let token: string;
const scope = { mode: 'single' as const, branchIds: [] as string[] };
const cursor = async () => (await prisma.syncChange.aggregate({ _max: { seq: true } }))._max.seq ?? 0n;
const productData = (id: string) => ({ id, sku: `SYNC-${id}`, name: `Sync ${id}`, model: 'Sync test', createdById: userId });

(enabled ? describe : describe.skip)('sync triggers and PC financial feed on an isolated database', () => {
  beforeAll(async () => {
    branchId = await branchFixture(prisma);
    scope.branchIds = [branchId];
    await prisma.user.create({ data: {
      id: userId, username: `sync_${marker}`, fullName: 'Sync test admin', password: 'never-export-this-secret', role: 'ADMIN',
    } });
    token = jwt.sign({ userId, role: 'ADMIN' }, process.env.JWT_SECRET!, { expiresIn: '5m' });
    await prisma.customer.create({ data: { id: customerId, branchId, name: `Sync ${marker}`, phone: marker, createdBy: userId } });
  }, 30000);

  afterAll(async () => {
    await prisma.paymentAllocation.deleteMany({ where: { payment: { createdById: userId } } });
    await prisma.payment.deleteMany({ where: { createdById: userId } });
    await prisma.debt.deleteMany({ where: { createdById: userId } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.syncChange.deleteMany({ where: { entityId: { in: [userId, customerId, ...productIds] } } });
    await prisma.$disconnect();
  }, 30000);

  async function expectCustomerChange(after: bigint) {
    const rows = await prisma.syncChange.findMany({ where: { seq: { gt: after }, entityId: customerId } });
    expect(rows).toEqual([expect.objectContaining({ entity: 'customer', entityId: customerId, branchId, op: 'upsert' })]);
  }

  async function expectEndpointBalance(after: bigint, outstanding: string) {
    const response = await request(app).get('/api/v1/customers').query({ include: 'financial', search: marker })
      .set('Authorization', `Bearer ${token}`).set('X-Branch-Scope', branchId);
    expect(response.status).toBe(200);
    const customer = response.body.data.find((row: { id: string }) => row.id === customerId);
    expect(customer.financial.outstanding).toBe(outstanding);
    const feed = await readChanges(after, 500, scope);
    expect(feed.records.find(row => row.entity === 'customer' && row.id === customerId)).toMatchObject({
      op: 'upsert', data: { financial: customer.financial },
    });
    const inspection = await request(app).get('/api/v1/sync/changes').query({ after: after.toString(), limit: 500 })
      .set('Authorization', `Bearer ${token}`).set('X-Branch-Scope', branchId);
    expect(inspection.status).toBe(200);
    expect(inspection.body.data).toEqual(JSON.parse(JSON.stringify(feed)));
  }

  it('records product insert/update/delete and returns a tombstone', async () => {
    const after = await cursor();
    await prisma.product.create({ data: productData(productIds[0]) });
    await prisma.product.update({ where: { id: productIds[0] }, data: { name: 'Updated sync product' } });
    await prisma.product.delete({ where: { id: productIds[0] } });
    const rows = await prisma.syncChange.findMany({ where: { seq: { gt: after }, entityId: productIds[0] }, orderBy: { seq: 'asc' } });
    expect(rows.map(row => [row.entity, row.op, row.branchId])).toEqual([
      ['product', 'upsert', null], ['product', 'upsert', null], ['product', 'delete', null],
    ]);
    expect(rows[1].seq).toBe(rows[0].seq + 1n);
    expect(rows[2].seq).toBe(rows[1].seq + 1n);
    expect((await readChanges(after, 500, scope)).records).toContainEqual({ entity: 'product', id: productIds[0], op: 'delete' });
  }, 30000);

  it('returns the current catalog list shape and image metadata without loading image bytes', async () => {
    const after = await cursor();
    await prisma.product.create({ data: { ...productData(productIds[0]), price: '19.99' } });
    await prisma.productImage.create({ data: {
      productId: productIds[0], data: Buffer.from('private image bytes'), mimeType: 'image/png', byteSize: 19,
    } });
    const response = await request(app).get('/api/v1/products').query({ search: `SYNC-${productIds[0]}` })
      .set('Authorization', 'Bearer ' + jwt.sign({ userId, role: 'EMPLOYEE' }, process.env.JWT_SECRET!));
    expect(response.status).toBe(200);
    const product = response.body.data.find((row: { id: string }) => row.id === productIds[0]);
    const feed = await readChanges(after, 500, scope);
    const record = feed.records.find(row => row.id === productIds[0]);
    expect(JSON.parse(JSON.stringify(record))).toEqual({
      entity: 'product', id: productIds[0], op: 'upsert', data: { ...product, exactMatch: false },
    });
    expect(JSON.stringify(record)).not.toContain('private image bytes');
    expect(record).not.toHaveProperty('data.image.data');
    await prisma.product.delete({ where: { id: productIds[0] } });
  }, 30000);

  it('captures debt, payment and allocation mutations and matches the customers financial endpoint', async () => {
    let after = await cursor();
    const debt = await prisma.debt.create({ data: {
      branchId, customerId, description: 'Sync debt', originalAmount: '100.00', baseOriginalAmount: '100.00',
      dueDate: new Date('2099-01-01'), createdById: userId,
    } });
    await expectCustomerChange(after);
    await expectEndpointBalance(after, '100.00');
    after = await cursor();
    await prisma.debt.update({ where: { id: debt.id }, data: { originalAmount: '120.00', baseOriginalAmount: '120.00' } });
    await expectCustomerChange(after);
    after = await cursor();
    const payment = await prisma.payment.create({ data: {
      branchId, customerId, totalAmount: '40.00', baseAmount: '40.00', paymentDate: new Date(), createdById: userId,
    } });
    await expectCustomerChange(after);
    after = await cursor();
    const allocation = await prisma.paymentAllocation.create({ data: { paymentId: payment.id, debtId: debt.id, amount: '40.00', paymentAmount: '40.00' } });
    await expectCustomerChange(after);
    await expectEndpointBalance(after, '80.00');
    after = await cursor();
    await prisma.payment.update({ where: { id: payment.id }, data: { totalAmount: '50.00', baseAmount: '50.00' } });
    await expectCustomerChange(after);
    after = await cursor();
    await prisma.paymentAllocation.update({ where: { id: allocation.id }, data: { amount: '50.00', paymentAmount: '50.00' } });
    await expectCustomerChange(after);
    await expectEndpointBalance(after, '70.00');
    after = await cursor();
    await prisma.paymentAllocation.delete({ where: { id: allocation.id } });
    await expectCustomerChange(after);
    after = await cursor();
    await prisma.payment.delete({ where: { id: payment.id } });
    await expectCustomerChange(after);
    after = await cursor();
    await prisma.debt.delete({ where: { id: debt.id } });
    await expectCustomerChange(after);
    await expectEndpointBalance(after, '0.00');
  }, 30000);

  it('waits for earlier uncommitted sequences while writers run concurrently and resumes across a rollback gap', async () => {
    const after = await cursor();
    let release!: () => void;
    let inserted!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { inserted = resolve; });
    const first = prisma.$transaction(async tx => {
      await tx.product.create({ data: productData(productIds[1]) });
      inserted();
      await hold;
    }, { timeout: 15000 });
    await ready;
    await prisma.product.create({ data: productData(productIds[2]) });
    const pending = readChanges(after, 1, scope);
    try {
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        const locks = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
          SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory'
            AND classid = 74103 AND objid = 1 AND mode = 'ExclusiveLock' AND NOT granted) AS waiting`;
        waiting = locks[0].waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      const committed = await prisma.syncChange.findMany({ where: { seq: { gt: after } } });
      expect(committed.map(row => row.entityId)).toEqual([productIds[2]]);
    } finally {
      release();
      await first;
    }
    const rows = await prisma.syncChange.findMany({ where: { seq: { gt: after } }, orderBy: { seq: 'asc' } });
    expect(rows.map(row => row.entityId)).toEqual([productIds[1], productIds[2]]);
    const page = await pending;
    expect(page.hasMore).toBe(true);
    expect((await readChanges(BigInt(page.nextSeq), 1, scope)).records[0].id).toBe(productIds[2]);

    const beforeRollback = await cursor();
    await expect(prisma.$transaction(async tx => {
      await tx.product.create({ data: productData(productIds[3]) });
      throw new Error('Intentional rollback');
    })).rejects.toThrow('Intentional rollback');
    await prisma.product.update({ where: { id: productIds[2] }, data: { name: 'After rollback' } });
    const resumed = await readChanges(beforeRollback, 500, scope);
    expect(resumed.records.map(row => row.id)).toEqual([productIds[2]]);
    expect(BigInt(resumed.nextSeq)).toBeGreaterThan(beforeRollback + 1n);
  }, 20000);
});
