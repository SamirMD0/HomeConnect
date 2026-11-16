import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { app } from '../../../app';
import { prisma } from '../../../lib/prisma';
import { branchFixture } from '../../../test/branch-fixture';
import { isIsolatedTestDatabase } from '../../../test/database';
import { readChanges } from '../sync-feed.service';
import { applyAction, type ClaimedAction } from './worker-actions';

const enabled = process.env.RUN_SYNC_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
(enabled ? describe : describe.skip)('sync worker applies through real PC HTTP on a test database', () => {
  const userId = randomUUID(), supplierId = randomUUID(), customerId = randomUUID();
  const actionIds = [randomUUID(), randomUUID()];
  let branchId: string, debtId: string, server: Server;
  const originalPort = process.env.PORT;
  const report = { request: vi.fn().mockResolvedValue({}) };
  const action = (type: string, payload: unknown, id = actionIds[0]): ClaimedAction => ({ id, type, payload, userId, branchId, attempts: 1, hasBlob: false });
  beforeAll(async () => {
    branchId = await branchFixture(prisma);
    await prisma.user.create({ data: { id: userId, username: `worker-${userId}`, fullName: 'Worker fixture', role: 'ADMIN', password: 'unused' } });
    await prisma.supplier.create({ data: { id: supplierId, branchId, name: 'Worker supplier', phone: '123456789', createdById: userId } });
    await prisma.customer.create({ data: { id: customerId, branchId, name: 'Worker customer', phone: '123456789', createdBy: userId } });
    const debt = await prisma.debt.create({ data: { branchId, customerId, description: 'Worker debt', originalAmount: '100.00', baseOriginalAmount: '100.00', dueDate: new Date('2026-11-01'), createdById: userId } });
    debtId = debt.id;
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    process.env.PORT = String((server.address() as { port: number }).port);
  }, 30000);
  afterAll(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (originalPort === undefined) delete process.env.PORT; else process.env.PORT = originalPort;
    await prisma.syncAppliedAction.deleteMany({ where: { actionId: { in: actionIds } } });
    await prisma.supplierAudit.deleteMany({ where: { supplierId } });
    await prisma.supplierTransaction.deleteMany({ where: { supplierId } });
    await prisma.supplier.deleteMany({ where: { id: supplierId } });
    await prisma.paymentAllocation.deleteMany({ where: { payment: { createdById: userId } } });
    await prisma.payment.deleteMany({ where: { createdById: userId } });
    await prisma.debt.deleteMany({ where: { customerId } });
    await prisma.customer.deleteMany({ where: { id: customerId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.syncChange.deleteMany({ where: { entityId: { in: [supplierId, customerId, userId] } } });
    await prisma.$disconnect();
  }, 30000);
  it('applies supplier payment twice once, including a crash before the journal commit', async () => {
    const payment = action('supplier_payment.create', { supplierId, type: 'SUPPLIER_PAYMENT', amount: '20.00', currency: 'USD',
      paymentMethod: 'CASH_USD', transactionDate: '2026-11-01', description: 'Supplier payment' });
    await applyAction(payment, report, Date.now() + 20000);
    expect(report.request).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ status: 'applied' }));
    await applyAction(payment, report, Date.now() + 20000);
    expect(await prisma.supplierTransaction.count({ where: { supplierId } })).toBe(1);
    await prisma.syncAppliedAction.delete({ where: { actionId: payment.id } });
    await applyAction(payment, report, Date.now() + 20000);
    expect(report.request).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ status: 'applied' }));
    expect(await prisma.supplierTransaction.count({ where: { supplierId } })).toBe(1);
  }, 30000);
  it('pushes the same customer balance as the financial-summary endpoint after payment', async () => {
    const before = (await prisma.syncChange.aggregate({ _max: { seq: true } }))._max.seq ?? 0n;
    await applyAction(action('customer_payment.create', { targetType: 'DEBT', targetId: debtId, amount: '30.00', paymentDate: '2026-11-01', paymentMethod: 'CASH' }, actionIds[1]), report, Date.now() + 20000);
    expect(report.request).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ status: 'applied' }));
    const token = jwt.sign({ userId, role: 'ADMIN' }, process.env.JWT_SECRET!);
    const summary = await request(app).get(`/api/v1/customers/${customerId}/financial-summary`).set('Authorization', 'Bearer ' + token).set('X-Branch-Scope', branchId);
    expect(summary.status).toBe(200);
    const feed = await readChanges(before, 500, { mode: 'all', branchIds: [branchId] });
    const customer = feed.records.find(record => record.entity === 'customer' && record.id === customerId);
    expect(customer).toMatchObject({ op: 'upsert', branchId, data: { financial: { outstanding: '70.00' } } });
    expect((customer as { data: { financial: { outstanding: string } } }).data.financial.outstanding).toBe(summary.body.data.summary.totalOutstanding);
  }, 30000);
});
