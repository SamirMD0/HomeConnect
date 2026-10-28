import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
vi.mock('../../lib/prisma', async () => ({ prisma: { ...(await import('../../test/branch-scope-fixture.js')).singleBranchRouteModels(), $queryRaw: vi.fn() }, transactionModel: {}, activityLogModel: {} }));
vi.mock('../sales/sales-orders/sales-orders.service', () => ({ SalesOrdersService: { get: vi.fn().mockResolvedValue({ id: 'record', totalAmount: '90.00' }) } }));
vi.mock('../sales/returns/sales-returns.service', () => ({ SalesReturnsService: { get: vi.fn().mockResolvedValue({ id: 'record', totalIncVat: '10.00' }) } }));
vi.mock('../financial/payments/payments.service', () => ({ PaymentsService: { getReceipt: vi.fn().mockResolvedValue({ id: 'record', totalAmount: '20.00' }) } }));
vi.mock('../financial/customer-statement/customer-statement.service', () => ({ CustomerStatementService: { get: vi.fn().mockResolvedValue({ customer: { id: 'record' }, closingBalance: '70.00' }) } }));
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token = jwt.sign({ userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' }, process.env.JWT_SECRET!);
const branch = { name: 'Record branch', address: 'Beirut', phone: '01' };
const paths = [
  '/api/v1/sales-orders/' + id,
  '/api/v1/payments/' + id + '/receipt',
  '/api/v1/sales-returns/' + id,
  '/api/v1/customers/' + id + '/statement?from=2026-01-01&to=2026-12-31',
];
beforeEach(() => { vi.clearAllMocks(); vi.mocked(prisma.branch.count).mockResolvedValue(2); vi.mocked(prisma.branch.findUniqueOrThrow).mockResolvedValue(branch as never); });
describe('document-only branch response metadata', () => {
  it.each(paths)('adds record branch contact fields and multi-branch visibility to %s', async (path) => {
    const response = await request(app).get(path).set('Authorization', 'Bearer ' + token);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ branch, showBranchLine: true });
    expect(prisma.branch.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id }, select: { name: true, address: true, phone: true } });
    expect(prisma.branch.count).toHaveBeenCalledWith({ where: { isActive: true } });
  });
  it.each(paths)('hides the branch line for one active branch on %s', async (path) => {
    vi.mocked(prisma.branch.count).mockResolvedValue(1);
    const response = await request(app).get(path).set('Authorization', 'Bearer ' + token);
    expect(response.status).toBe(200);
    expect(response.body.data.showBranchLine).toBe(false);
  });
  it('keeps out-of-scope records at 404 before document metadata is read', async () => {
    vi.mocked(prisma.payment.findUnique).mockResolvedValueOnce({ branchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' } as never);
    expect((await request(app).get(paths[1]!).set('Authorization', 'Bearer ' + token)).status).toBe(404);
    expect(prisma.branch.count).not.toHaveBeenCalled();
  });
});
