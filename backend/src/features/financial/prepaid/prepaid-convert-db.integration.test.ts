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

  it('turns the unpaid remainder into one debt on the chosen date', async () => {
    const id = await createPrepaid();
    const converted = await api('post', `/prepaid-purchases/${id}/convert`).send({ mode: 'DEBT', dueDate: '2030-01-15' });
    expect(converted.status, JSON.stringify(converted.body)).toBe(200);
    const debt = await db.debt.findUniqueOrThrow({ where: { id: converted.body.data.remainderDebtId } });
    expect(debt.kind).toBe('STANDARD');
    expect(debt.originalAmount.toFixed(2)).toBe('250.00');
    expect((await statement()).closingBalance).toBe('250.00');
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
