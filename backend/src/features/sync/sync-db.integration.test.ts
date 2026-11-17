import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { branchFixture } from '../../test/branch-fixture';
import { insertMigrationRow } from '../../test/branch-migration-fixture';
import { isIsolatedTestDatabase } from '../../test/database';
import { readChanges } from './sync-feed.service';
import { pushFigures,type FigureDependencies } from './worker/worker-figures';
import type { SyncWorkerState } from '@prisma/client';

const enabled = process.env.RUN_SYNC_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
const marker = randomUUID();
const userId = randomUUID();
const customerId = randomUUID();
const productIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const categoryIds: string[] = [];
const orderIds: string[] = [];
let branchId: string;
let token: string;
const scope = { mode: 'single' as const, branchIds: [] as string[] };
const cursor = async () => (await prisma.syncChange.aggregate({ _max: { seq: true } }))._max.seq ?? 0n;
const productData = (id: string) => ({ id, sku: `SYNC-${id}`, name: `Sync ${id}`, model: 'Sync test', createdById: userId });

(enabled ? describe : describe.skip)('sync triggers and PC financial feed on an isolated database', () => {
  it('publishes the exact PC route data for dashboard, receivables and two reports',async()=>{
    const responses=new Map<string,any>(),published:any[]=[];
    const date='2026-11-17';
    const tasks=[{entity:'dashboard',branchId,period:'today'},{entity:'receivables_summary',branchId},{entity:'report',branchId,period:'today',reportId:'sales-summary'},{entity:'report',branchId,period:'thisMonth',reportId:'customers-paid'}];
    const state={lastPushedSeq:'1',openingStart:new Date('1970-01-01T00:00Z'),openingEnd:new Date('1970-01-01T00:00Z'),figureSnapshots:{hashes:{},run:{date,seq:'1',startedAt:new Date().toISOString(),index:0,tasks}}} as unknown as SyncWorkerState;
    const deps={now:()=>new Date(),date:()=>date,scope:async()=>scope,save:async()=>state,admin:async()=>({id:userId,role:'ADMIN'}),read:async(path:string)=>{
      const response=await request(app).get('/api/v1'+path).set('Authorization','Bearer '+token).set('X-Branch-Scope',branchId);
      expect(response.status).toBe(200);responses.set(path,response.body.data);return response.body.data;
    }};
    await pushFigures(state,{request:async(_path:string,body:any)=>{published.push(...body.records);}},Date.now()+60000,deps as unknown as FigureDependencies,true);
    expect(published).toHaveLength(4);
    expect(published[0].data.response).toEqual(responses.get('/dashboard/overview?range=today&includeArchived=false'));
    const totals=responses.get('/receivables?onlyWithBalance=true&sortBy=outstanding&sortOrder=desc&page=1&limit=1');
    expect(published[1].data.response).toEqual({summary:totals.summary,tierCounts:totals.tierCounts});
    expect(published[2].data.response).toEqual(responses.get('/reports/sales/summary?period=today'));
    expect(published[3].data.response).toEqual(responses.get('/reports/customers/paid?period=thisMonth'));
  },60000);
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
    await prisma.stockMovement.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.salesOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    for (const id of [...categoryIds].reverse()) await prisma.category.deleteMany({ where: { id } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.syncChange.deleteMany({ where: { entityId: { in: [userId, customerId, ...productIds, ...categoryIds, ...orderIds] } } });
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
    const financialSummary = await request(app).get(`/api/v1/customers/${customerId}/financial-summary`)
      .query({ includeCancelled: 'false', includePayments: 'false', debtLimit: 100, planLimit: 100 })
      .set('Authorization', `Bearer ${token}`).set('X-Branch-Scope', branchId);
    expect(financialSummary.status).toBe(200);
    expect(feed.records.find(row => row.entity === 'customer' && row.id === customerId)).toMatchObject({
      op: 'upsert', data: { financial: customer.financial, financialSummary: financialSummary.body.data },
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
    expect((await readChanges(after, 500, scope)).records).toContainEqual({ entity: 'product', id: productIds[0], branchId: null, minRole:null, op: 'delete' });
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
    const inventory = await request(app).get(`/api/v1/products/${productIds[0]}/inventory`)
      .set('Authorization', 'Bearer ' + jwt.sign({ userId, role: 'EMPLOYEE' }, process.env.JWT_SECRET!));
    expect(inventory.status).toBe(200);
    const feed = await readChanges(after, 500, scope);
    const record = feed.records.find(row => row.id === productIds[0]);
    expect(JSON.parse(JSON.stringify(record))).toEqual({
      entity: 'product', id: productIds[0], branchId: null, minRole:null, op: 'upsert', data: { ...product, exactMatch: false, inventory: inventory.body.data },
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

  it('records exactly one product change for a sale movement despite three historical orders', async () => {
    const productId = randomUUID();
    productIds.push(productId);
    await prisma.product.create({ data: productData(productId) });
    for (let index = 0; index < 3; index++) {
      const id = randomUUID();
      orderIds.push(id);
      await insertMigrationRow(prisma, 'sales_orders', { id, branchId, createdById: userId, orderDate: new Date('2020-01-01') });
      await insertMigrationRow(prisma, 'sales_order_items', {
        salesOrderId: id, productId, unitPriceExVat: '10.00', vatAmount: '0.00',
        lineTotalIncVat: '10.00', taxRateSnapshot: '0.000',
      });
    }
    const after = await cursor();
    await prisma.stockMovement.create({ data: {
      productId, movementType: 'SALE_FULFILLMENT', quantityChange: -1, quantityBefore: 10, quantityAfter: 9,
      reason: 'Sync fanout regression', referenceType: 'sales_order', referenceId: orderIds[0], createdById: userId,
    } });
    expect(await prisma.syncChange.findMany({ where: { seq: { gt: after } } })).toEqual([
      expect.objectContaining({ entity: 'product', entityId: productId, op: 'upsert' }),
    ]);
    const beforeRename = await cursor();
    await prisma.product.update({ where: { id: productId }, data: { name: 'Renamed product', sku: `RENAMED-${productId}` } });
    expect(await prisma.syncChange.findMany({ where: { seq: { gt: beforeRename } } })).toEqual([
      expect.objectContaining({ entity: 'product', entityId: productId }),
    ]);
    const feed = await readChanges(after - 1n, 500, scope);
    const order = feed.records.find(record => record.entity === 'sales_order');
    expect(order).toBeDefined();
    expect(order).not.toHaveProperty('data.items.0.product.stockQuantity');
    expect(order).not.toHaveProperty('data.items.0.product.costPrice');
    expect(order).not.toHaveProperty('data.items.0.inventory');
  }, 30000);

  it('inserts empty categories without product fanout and limits path changes to the subtree', async () => {
    const root = randomUUID(), child = randomUUID(), grandchild = randomUUID(), sibling = randomUUID();
    categoryIds.push(root, child, grandchild, sibling);
    await prisma.category.create({ data: { id: root, name: `Root ${marker}` } });
    const beforeInsert = await cursor();
    await prisma.category.create({ data: { id: child, name: 'Child', parentId: root } });
    expect((await prisma.syncChange.findMany({ where: { seq: { gt: beforeInsert } } })).map(row => [row.entity, row.entityId])).toEqual(
      expect.arrayContaining([['category', child], ['category', root]])
    );
    expect(await prisma.syncChange.count({ where: { seq: { gt: beforeInsert }, entity: 'product' } })).toBe(0);
    await prisma.category.create({ data: { id: grandchild, name: 'Grandchild', parentId: child } });
    await prisma.category.create({ data: { id: sibling, name: 'Sibling', parentId: root } });
    const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    productIds.push(...ids);
    await prisma.product.createMany({ data: [root, child, grandchild, sibling].map((categoryId, index) => ({
      ...productData(ids[index]), categoryId,
    })) });
    const beforeRename = await cursor();
    await prisma.category.update({ where: { id: child }, data: { name: 'Renamed child' } });
    const rows = await prisma.syncChange.findMany({ where: { seq: { gt: beforeRename } } });
    expect(rows.map(row => [row.entity, row.entityId])).toEqual(expect.arrayContaining([
      ['category', child], ['category', grandchild], ['product', ids[1]], ['product', ids[2]],
    ]));
    expect(rows).toHaveLength(4);
    const beforeMetadata = await cursor();
    await prisma.category.update({ where: { id: child }, data: { isActive: false } });
    expect(await prisma.syncChange.findMany({ where: { seq: { gt: beforeMetadata } } })).toEqual([
      expect.objectContaining({ entity: 'category', entityId: child }),
    ]);
    const beforeMove = await cursor();
    await prisma.category.update({ where: { id: grandchild }, data: { parentId: sibling } });
    const moved = await prisma.syncChange.findMany({ where: { seq: { gt: beforeMove } } });
    expect(moved.map(row => [row.entity, row.entityId])).toEqual(expect.arrayContaining([
      ['category', grandchild], ['category', child], ['category', sibling], ['product', ids[2]],
    ]));
    expect(moved).toHaveLength(4);
    await prisma.product.update({ where: { id: ids[2] }, data: { categoryId: null } });
    const beforeDelete = await cursor();
    await prisma.category.delete({ where: { id: grandchild } });
    expect(await prisma.syncChange.findMany({ where: { seq: { gt: beforeDelete } } })).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity: 'category', entityId: grandchild, op: 'delete' }),
      expect.objectContaining({ entity: 'category', entityId: sibling, op: 'upsert' }),
    ]));
    expect(await prisma.syncChange.count({ where: { seq: { gt: beforeDelete }, entity: 'product' } })).toBe(0);
  }, 30000);

  it('returns busy after the two-second lock timeout and releases its queued exclusive request', async () => {
    let release!: () => void;
    let acquired!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const ready = new Promise<void>(resolve => { acquired = resolve; });
    const writer = prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(74103, 1)`;
      acquired();
      await hold;
    }, { timeout: 10000 });
    await ready;
    try {
      const after = await cursor();
      expect(await readChanges(after, 500, scope)).toEqual({ records: [], nextSeq: after.toString(), hasMore: false, busy: true });
      const locks = await prisma.$queryRaw<Array<{ waiting: boolean }>>`
        SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory'
          AND classid = 74103 AND objid = 1 AND mode = 'ExclusiveLock' AND NOT granted) AS waiting`;
      expect(locks[0].waiting).toBe(false);
    } finally {
      release();
      await writer;
    }
  }, 15000);

  it('targets only direct and implicit pricing/tax consumers on relevant changes', async () => {
    const rollback = new Error('Rollback pricing fixtures');
    await expect(prisma.$transaction(async tx => {
      const preset = await insertMigrationRow(tx, 'pricing_presets', { createdById: userId });
      const otherPreset = await insertMigrationRow(tx, 'pricing_presets', { createdById: userId });
      const defaultPreset = await insertMigrationRow(tx, 'pricing_presets', { createdById: userId, isDefault: true });
      const rate = await insertMigrationRow(tx, 'tax_rates', { createdById: userId });
      const otherRate = await insertMigrationRow(tx, 'tax_rates', { createdById: userId });
      const profile = await insertMigrationRow(tx, 'tax_profiles', { taxRateId: rate, isDefault: true });
      const otherProfile = await insertMigrationRow(tx, 'tax_profiles', { taxRateId: otherRate });
      const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
      await tx.product.createMany({ data: [
        { ...productData(ids[0]), costPrice: '10.00', pricingPresetId: preset, taxProfileId: profile },
        { ...productData(ids[1]), costPrice: '10.00', pricingPresetId: otherPreset, taxProfileId: otherProfile },
        { ...productData(ids[2]), costPrice: '10.00' },
        { ...productData(ids[3]), price: '15.00', taxProfileId: otherProfile },
      ] });
      const position = async () => (await tx.syncChange.aggregate({ _max: { seq: true } }))._max.seq ?? 0n;
      const targets = async (after: bigint) => (await tx.syncChange.findMany({
        where: { seq: { gt: after }, entity: 'product', entityId: { in: ids } },
      })).map(row => row.entityId).sort();

      let after = await position();
      await tx.pricingPreset.update({ where: { id: preset }, data: { profitPercent: '20.00' } });
      expect(await targets(after)).toEqual([ids[0]]);
      after = await position();
      await tx.pricingPreset.update({ where: { id: defaultPreset }, data: { roundingMode: 'NEAREST_1' } });
      expect(await targets(after)).toEqual([ids[2]]);
      after = await position();
      await tx.pricingPreset.update({ where: { id: preset }, data: { updatedAt: new Date(), notes: 'Metadata only' } });
      expect(await targets(after)).toEqual([]);

      after = await position();
      await tx.taxProfile.update({ where: { id: profile }, data: { code: `RENAMED-${profile}` } });
      expect(await targets(after)).toEqual([ids[0], ids[2]].sort());
      after = await position();
      await tx.taxProfile.update({ where: { id: profile }, data: { updatedAt: new Date(), name: 'Metadata only' } });
      expect(await targets(after)).toEqual([]);
      after = await position();
      await tx.taxRate.update({ where: { id: rate }, data: { ratePercent: '12.000' } });
      expect(await targets(after)).toEqual([ids[0], ids[2]].sort());
      after = await position();
      await tx.taxRate.update({ where: { id: rate }, data: { name: 'Metadata only' } });
      expect(await targets(after)).toEqual([]);
      throw rollback;
    }, { timeout: 30000 })).rejects.toBe(rollback);
  }, 35000);

  it('invalidates only the owning branch orders on name/code changes', async () => {
    const rollback = new Error('Rollback branch fixtures');
    await expect(prisma.$transaction(async tx => {
      const otherBranch = await insertMigrationRow(tx, 'branches', { createdById: userId });
      const otherOrder = await insertMigrationRow(tx, 'sales_orders', { branchId: otherBranch, createdById: userId });
      let after = (await tx.syncChange.aggregate({ _max: { seq: true } }))._max.seq ?? 0n;
      await tx.branch.update({ where: { id: branchId }, data: { updatedAt: new Date() } });
      expect(await tx.syncChange.findMany({ where: { seq: { gt: after } } })).toEqual([
        expect.objectContaining({ entity: 'branch', entityId: branchId }),
      ]);
      after = (await tx.syncChange.aggregate({ _max: { seq: true } }))._max.seq ?? 0n;
      await tx.branch.update({ where: { id: branchId }, data: { name: `Renamed branch ${marker}` } });
      const rows = await tx.syncChange.findMany({ where: { seq: { gt: after } } });
      expect(rows.filter(row => row.entity === 'sales_order' && orderIds.includes(row.entityId)).map(row => row.entityId).sort()).toEqual([...orderIds].sort());
      expect(rows.filter(row => row.entity === 'sales_order').every(row => row.branchId === branchId)).toBe(true);
      expect(rows.some(row => row.entityId === otherOrder)).toBe(false);
      throw rollback;
    }, { timeout: 30000 })).rejects.toBe(rollback);
  }, 35000);

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
