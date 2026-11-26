import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../../app';
import { prisma } from '../../../lib/prisma';
import { isIsolatedTestDatabase } from '../../../test/database';
import { todayInBusinessTimezone } from '../index';

const enabled =
  process.env.RUN_FINANCIAL_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
const db = new PrismaClient();
const password = 'convert-only-synthetic-password';
let branch: string, owner: string, employee: string, customerId: string, adminToken: string, employeeToken: string;

const api = (method: 'get' | 'post', path: string, token = adminToken) =>
  request(app)[method]('/api/v1' + path).set('Authorization', 'Bearer ' + token).set('X-Branch-Scope', branch);

/** A $400 item with $150 already paid, through the real create endpoint. */
async function createPrepaid(): Promise<string> {
  const created = await api('post', `/customers/${customerId}/prepaid-purchases`).send({
    itemName: 'Air conditioner',
    fullAmount: '400.00',
    paymentAmount: '150.00',
  });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  const row = await db.prepaidPurchase.findFirstOrThrow({
    where: { debt: { customerId }, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  return row.id;
}

const statement = async () => {
  const today = todayInBusinessTimezone();
  const response = await api('get', `/customers/${customerId}/statement?from=2020-01-01&to=${today}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.data;
};

const installment = { mode: 'INSTALLMENT', startDate: '2030-01-15', installmentCount: 5, frequency: 'MONTHLY' };

(enabled ? describe : describe.skip)('prepaid conversion and statements', () => {
  beforeEach(async () => {
    owner = randomUUID();
    employee = randomUUID();
    branch = randomUUID();
    const hash = await bcrypt.hash(password, 4);
    await db.user.createMany({
      data: [
        { id: owner, username: 'convert-' + owner, fullName: 'Convert admin', password: hash, role: 'ADMIN' },
        { id: employee, username: 'convert-' + employee, fullName: 'Convert employee', password: hash, role: 'EMPLOYEE' },
      ],
    });
    adminToken = jwt.sign({ userId: owner, role: 'ADMIN' }, process.env.JWT_SECRET!);
    employeeToken = jwt.sign({ userId: employee, role: 'EMPLOYEE' }, process.env.JWT_SECRET!);
    await db.branch.create({ data: { id: branch, code: 'CNV-' + branch, name: 'Convert ' + branch, createdById: owner } });
    await db.userBranchAccess.create({ data: { userId: employee, branchId: branch, grantedById: owner } });
    const customer = await db.customer.create({ data: { name: 'Convert customer', phone: '70111222', branchId: branch, createdBy: owner } });
    customerId = customer.id;
  });

  afterEach(async () => {
    await db.financialCorrectionAudit.deleteMany({ where: { customerId } });
    await db.activityLog.deleteMany({ where: { userId: owner } });
    await db.adminVerificationLog.deleteMany({ where: { userId: owner } });
    await db.paymentAllocation.deleteMany({ where: { payment: { customerId } } });
    await db.payment.deleteMany({ where: { customerId } });
    await db.prepaidPurchase.deleteMany({ where: { debt: { customerId } } });
    await db.installment.deleteMany({ where: { installmentPlan: { customerId } } });
    await db.installmentPlan.deleteMany({ where: { customerId } });
    await db.debt.deleteMany({ where: { customerId } });
    await db.customer.delete({ where: { id: customerId } });
    await db.supplierAudit.deleteMany({ where: { changedById: owner } });
    await db.supplierTransaction.deleteMany({ where: { branchId: branch } });
    await db.supplier.deleteMany({ where: { branchId: branch } });
    await db.userBranchAccess.deleteMany({ where: { branchId: branch } });
    await db.branch.delete({ where: { id: branch } });
    await db.user.deleteMany({ where: { id: { in: [owner, employee] } } });
  });

  afterAll(async () => {
    await db.$disconnect();
    await prisma.$disconnect();
  });

  it('turns only the unpaid remainder into a schedule, and the statement agrees', async () => {
    const id = await createPrepaid();
    expect((await statement()).closingBalance).toBe('0.00');

    const converted = await api('post', `/prepaid-purchases/${id}/convert`).send(installment);
    expect(converted.status, JSON.stringify(converted.body)).toBe(200);
    expect(converted.body.data).toMatchObject({ status: 'DELIVERED', amountPaid: '150.00', adminDebt: '0.00' });

    const plan = await db.installmentPlan.findUniqueOrThrow({
      where: { id: converted.body.data.remainderInstallmentPlanId },
      include: { installments: true },
    });
    expect(plan.totalAmount.toFixed(2)).toBe('250.00');
    expect(plan.branchId).toBe(branch);
    expect(plan.installments).toHaveLength(5);
    expect(plan.installments.reduce((sum, row) => sum + Number(row.amountDue), 0)).toBe(250);

    const after = await statement();
    expect(after.closingBalance).toBe('250.00');
    expect(after.entries.filter((entry: { type: string }) => entry.type === 'INSTALLMENT')).toHaveLength(5);
  });

  it('makes one full-price invoice carrying the deposit receipts, balance unchanged', async () => {
    const id = await createPrepaid();
    const converted = await api('post', `/prepaid-purchases/${id}/convert`).send({ mode: 'DEBT', dueDate: '2030-01-15' });
    expect(converted.status, JSON.stringify(converted.body)).toBe(200);
    const invoiceId = converted.body.data.remainderDebtId;
    const invoice = await db.debt.findUniqueOrThrow({ where: { id: invoiceId }, include: { paymentAllocations: true } });
    expect(invoice.kind).toBe('STANDARD');
    expect(invoice.description).toBe('Air conditioner');
    expect(invoice.originalAmount.toFixed(2)).toBe('400.00');
    expect(invoice.status).toBe('PARTIALLY_PAID');
    expect(invoice.paymentAllocations.map((row) => row.amount.toFixed(2))).toEqual(['150.00']);

    // The deposit still reads as paid 150 of 400, now delivered.
    expect(converted.body.data).toMatchObject({ status: 'DELIVERED', fullAmount: '400.00', amountPaid: '150.00', adminDebt: '0.00' });
    expect(converted.body.data.payments).toEqual([expect.objectContaining({ amount: '150.00', isVoided: false })]);

    const after = await statement();
    expect(after.closingBalance).toBe('250.00');
    const types = after.entries.map((entry: { type: string }) => entry.type);
    expect(types.filter((type: string) => type === 'DEBT')).toHaveLength(1);
    expect(types.filter((type: string) => type === 'PAYMENT')).toHaveLength(1);
  });

  it('shows the invoice with its receipts in the profile, editable without a reason', async () => {
    const id = await createPrepaid();
    const converted = await api('post', `/prepaid-purchases/${id}/convert`).send({ mode: 'DEBT', dueDate: '2030-01-15' });
    expect(converted.status, JSON.stringify(converted.body)).toBe(200);
    const invoiceId = converted.body.data.remainderDebtId;
    const profile = await api('get', `/customers/${customerId}/financial-summary?debtLimit=5`);
    expect(profile.status, JSON.stringify(profile.body)).toBe(200);
    // Only the invoice: the handed-over deposit is not listed a second time.
    expect(profile.body.data.debts).toEqual([
      expect.objectContaining({ id: invoiceId, kind: 'STANDARD', originalAmount: '400.00', totalPaid: '150.00', remainingBalance: '250.00' }),
    ]);

    const edited = await api('post', `/debts/${invoiceId}/corrections`).send({
      originalAmount: '375.00', description: 'Air conditioner', dueDate: '2030-02-15', notes: null, sourceScreen: 'CUSTOMER_PROFILE',
    });
    expect(edited.status, JSON.stringify(edited.body)).toBe(200);
    const detail = await api('get', `/debts/${invoiceId}`);
    expect(detail.body.data).toMatchObject({ originalAmount: '375.00', totalPaid: '150.00', remainingBalance: '225.00' });
    expect(detail.body.data.payments).toHaveLength(1);

    const paymentId = detail.body.data.payments[0].paymentId ?? detail.body.data.payments[0].id;
    const receiptEdit = await api('post', `/payments/${paymentId}/corrections`).send({
      paymentDate: '2026-11-01', paymentMethod: 'CASH', reference: 'RV-815', notes: null, sourceScreen: 'CUSTOMER_PROFILE',
    });
    expect(receiptEdit.status, JSON.stringify(receiptEdit.body)).toBe(200);
    expect((await db.payment.findUniqueOrThrow({ where: { id: paymentId } })).reference).toBe('RV-815');

    const duplicate = await api('post', `/prepaid-purchases/${id}/convert`).send({ mode: 'DEBT', dueDate: '2030-01-15' });
    expect(duplicate.status).toBe(409);
    expect(await db.debt.count({ where: { customerId, kind: 'STANDARD' } })).toBe(1);
    expect((await statement()).closingBalance).toBe('225.00');
  });

  it('undoing an invoice conversion moves the receipts back onto the deposit', async () => {
    const id = await createPrepaid();
    const converted = await api('post', `/prepaid-purchases/${id}/convert`).send({ mode: 'DEBT', dueDate: '2030-01-15' });
    const invoiceId = converted.body.data.remainderDebtId;

    const reverted = await api('post', `/prepaid-purchases/${id}/revert-delivery`).send({ reason: 'Converted by mistake', accountPassword: password });
    expect(reverted.status, JSON.stringify(reverted.body)).toBe(200);
    expect(reverted.body.data).toMatchObject({ status: 'PENDING', remainderDebtId: null, amountPaid: '150.00', adminDebt: '-150.00' });
    const prepaid = await db.prepaidPurchase.findUniqueOrThrow({ where: { id }, include: { debt: { include: { paymentAllocations: true } } } });
    expect(prepaid.receiptsMovedAt).toBeNull();
    expect(prepaid.debt.paymentAllocations).toHaveLength(1);
    expect((await db.debt.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe('CANCELLED');
    expect((await statement()).closingBalance).toBe('0.00');
  });

  it('refuses to undo once the invoice has a payment made after handover', async () => {
    const id = await createPrepaid();
    const converted = await api('post', `/prepaid-purchases/${id}/convert`).send({ mode: 'DEBT', dueDate: '2030-01-15' });
    const invoiceId = converted.body.data.remainderDebtId;
    const paid = await api('post', `/debts/${invoiceId}/payments`).send({ amount: '50.00', paymentDate: todayInBusinessTimezone(), paymentMethod: 'CASH' });
    expect(paid.status, JSON.stringify(paid.body)).toBeLessThan(300);

    const reverted = await api('post', `/prepaid-purchases/${id}/revert-delivery`).send({ reason: 'Converted by mistake', accountPassword: password });
    expect(reverted.status).toBe(409);
    // The later payment is not counted as part of the deposit.
    expect((await api('get', `/prepaid-purchases/${id}`)).body.data).toMatchObject({ status: 'DELIVERED', amountPaid: '150.00' });
    expect((await statement()).closingBalance).toBe('200.00');
  });

  it('is admin only, and an employee attempt changes nothing', async () => {
    const id = await createPrepaid();
    const refused = await api('post', `/prepaid-purchases/${id}/convert`, employeeToken).send(installment);
    expect(refused.status).toBe(403);
    expect((await db.prepaidPurchase.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
    expect(await db.installmentPlan.count({ where: { customerId } })).toBe(0);
  });

  it('undoes an unpaid conversion and lets it be converted again', async () => {
    const id = await createPrepaid();
    const converted = await api('post', `/prepaid-purchases/${id}/convert`).send(installment);
    const planId = converted.body.data.remainderInstallmentPlanId;

    const reverted = await api('post', `/prepaid-purchases/${id}/revert-delivery`).send({ reason: 'Converted by mistake', accountPassword: password });
    expect(reverted.status, JSON.stringify(reverted.body)).toBe(200);
    expect(reverted.body.data).toMatchObject({ status: 'PENDING', remainderInstallmentPlanId: null, adminDebt: '-150.00' });
    expect((await db.installmentPlan.findUniqueOrThrow({ where: { id: planId } })).status).toBe('CANCELLED');
    expect((await statement()).closingBalance).toBe('0.00');

    const again = await api('post', `/prepaid-purchases/${id}/convert`).send({ mode: 'DEBT', dueDate: '2030-01-15' });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect((await statement()).closingBalance).toBe('250.00');
    expect(again.body.data).toMatchObject({ amountPaid: '150.00' });
  });

  it('refuses to undo once the plan has a payment, leaving everything in place', async () => {
    const id = await createPrepaid();
    const converted = await api('post', `/prepaid-purchases/${id}/convert`).send(installment);
    const planId = converted.body.data.remainderInstallmentPlanId;
    const paid = await api('post', `/installment-plans/${planId}/payments`).send({ amount: '50.00', paymentDate: todayInBusinessTimezone(), paymentMethod: 'CASH' });
    expect(paid.status, JSON.stringify(paid.body)).toBeLessThan(300);

    const reverted = await api('post', `/prepaid-purchases/${id}/revert-delivery`).send({ reason: 'Converted by mistake', accountPassword: password });
    expect(reverted.status).toBe(409);
    expect((await db.prepaidPurchase.findUniqueOrThrow({ where: { id } })).status).toBe('DELIVERED');
    expect((await db.installmentPlan.findUniqueOrThrow({ where: { id: planId } })).status).not.toBe('CANCELLED');
    expect((await statement()).closingBalance).toBe('200.00');
  });

  it('refuses to convert a fully paid item', async () => {
    const created = await api('post', `/customers/${customerId}/prepaid-purchases`).send({ itemName: 'Fridge', fullAmount: '100.00', paymentAmount: '100.00' });
    expect(created.status).toBe(201);
    const row = await db.prepaidPurchase.findFirstOrThrow({ where: { debt: { customerId } } });
    const refused = await api('post', `/prepaid-purchases/${row.id}/convert`).send(installment);
    expect(refused.status).toBe(400);
  });

  it('supplier statement closes on the same balance as the supplier summary', async () => {
    const supplier = await db.supplier.create({ data: { name: 'Al Noor', phone: '01222333', branchId: branch, createdById: owner } });
    const base = { supplierId: supplier.id, branchId: branch, createdById: owner, description: 'Entry' };
    await db.supplierTransaction.createMany({
      data: [
        { ...base, type: 'SUPPLIER_DEBT', direction: 'INCREASE_OWED', amount: 500, baseAmount: 500, transactionDate: new Date('2026-01-10') },
        { ...base, type: 'SUPPLIER_PAYMENT', direction: 'DECREASE_OWED', amount: 200, baseAmount: 200, transactionDate: new Date('2026-03-10') },
        { ...base, type: 'SUPPLIER_DEBT', direction: 'INCREASE_OWED', amount: 75, baseAmount: 75, transactionDate: new Date('2026-03-20') },
        { ...base, type: 'SUPPLIER_DEBT', direction: 'INCREASE_OWED', amount: 999, baseAmount: 999, transactionDate: new Date('2026-03-21'), status: 'REMOVED', removedReason: 'Entered twice' },
      ],
    });

    const response = await api('get', `/suppliers/${supplier.id}/statement?from=2026-03-01&to=2026-03-31`);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data).toMatchObject({ openingBalance: '500.00', closingBalance: '375.00' });
    expect(response.body.data.entries).toHaveLength(3);

    const summary = await api('get', `/suppliers/${supplier.id}/summary`);
    expect(summary.body.data.balance).toBe('375.00');

    const reversedRange = await api('get', `/suppliers/${supplier.id}/statement?from=2026-04-01&to=2026-03-01`);
    expect(reversedRange.status).toBe(400);
  });
});
