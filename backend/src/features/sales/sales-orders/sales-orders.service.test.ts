import {
  SalesAuditAction,
  SalesChannel,
  SalesOrderFulfillmentStatus,
  SalesOrderPaymentStatus,
  SalesOrderSettlement,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository, debtService, audit, verifyAdmin, tx } = vi.hoisted(() => ({
  tx: { marker: 'transaction' },
  repository: {
    findActiveCustomer: vi.fn(), findActiveProduct: vi.fn(), nextOrderNumber: vi.fn(),
    create: vi.fn(), update: vi.fn(), findActor: vi.fn(), findById: vi.fn(),
    addItem: vi.fn(), updateItem: vi.fn(), removeItem: vi.fn(), findItemById: vi.fn(),
  },
  debtService: { createDebt: vi.fn() },
  audit: vi.fn(),
  verifyAdmin: vi.fn(),
}));

vi.mock('../../financial/infrastructure/transaction', () => ({ runFinancialTransaction: vi.fn((operation) => operation(tx)) }));
vi.mock('../../financial/debts/debts.service', () => ({ DebtsService: debtService }));
vi.mock('../audit/sales-audit', () => ({ writeSalesAudit: audit }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verifyAdmin }));
vi.mock('./sales-orders.repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sales-orders.repository')>();
  return { ...actual, SalesOrdersRepository: repository };
});

import { SalesOrdersService } from './sales-orders.service';

const user = { userId: '11111111-1111-4111-8111-111111111111', role: 'EMPLOYEE' };
const input = {
  customerId: '22222222-2222-4222-8222-222222222222',
  salesChannel: SalesChannel.SHOP_DIRECT,
  orderDate: '2026-08-03',
  fulfillmentStatus: SalesOrderFulfillmentStatus.CONFIRMED,
  paidAmount: '20.00',
  debtDueDate: '2026-08-10',
  items: [{ manualProductName: 'Fan', quantity: 1, unitPrice: '100.00' }],
};

const baseOrder = {
  id: '33333333-3333-4333-8333-333333333333', orderNumber: 'SO-2026-0001',
  customerId: input.customerId, customer: { id: input.customerId, name: 'Customer', phone: '1', address: null, isActive: true },
  salesChannel: SalesChannel.SHOP_DIRECT, orderDate: new Date('2026-08-03T00:00:00Z'), deliveryDate: null, deliveredAt: null,
  fulfillmentStatus: SalesOrderFulfillmentStatus.CONFIRMED, paymentStatus: SalesOrderPaymentStatus.PARTIALLY_PAID,
  settlement: SalesOrderSettlement.NONE, itemsSubtotal: '100.00', deliveryFee: null, totalAmount: '100.00', paidAmount: '20.00', remainingAmount: '80.00',
  deliveryAddressSnapshot: null, deliveryNotes: null, notes: null, debtId: null, debt: null, installmentPlanId: null, installmentPlan: null,
  createdById: user.userId, createdBy: { id: user.userId, fullName: 'Employee', username: 'employee' }, updatedById: null, updatedBy: null,
  createdAt: new Date(), updatedAt: new Date(), cancelledAt: null, cancelledById: null, cancelledBy: null, cancelledReason: null,
  items: [{ id: '44444444-4444-4444-8444-444444444444', salesOrderId: '33333333-3333-4333-8333-333333333333', productId: null, product: null, manualProductName: 'Fan', manualProductModel: null, productNameSnapshot: 'Fan', productModelSnapshot: null, skuSnapshot: null, quantity: 1, unitPrice: '100.00', discountAmount: null, lineTotal: '100.00', notes: null, createdAt: new Date(), updatedAt: new Date() }],
};

const addedItem = {
  ...baseOrder.items[0],
  id: '44444444-4444-4444-8444-444444444445',
  manualProductName: 'Television',
  productNameSnapshot: 'Television',
  unitPrice: '200.00',
  lineTotal: '200.00',
};

function fullyPaidOrder(overrides: Record<string, unknown> = {}) {
  return {
    ...baseOrder,
    paymentStatus: SalesOrderPaymentStatus.PAID,
    itemsSubtotal: '450.00',
    totalAmount: '450.00',
    paidAmount: '450.00',
    remainingAmount: '0.00',
    items: [{ ...baseOrder.items[0], unitPrice: '450.00', lineTotal: '450.00' }],
    ...overrides,
  };
}

function orderAfterAddingBalance(overrides: Record<string, unknown> = {}) {
  return {
    ...fullyPaidOrder(),
    items: [fullyPaidOrder().items[0], addedItem],
    ...overrides,
  };
}

describe('sales order service transaction boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findActiveCustomer.mockResolvedValue({ id: input.customerId });
    repository.nextOrderNumber.mockResolvedValue('SO-2026-0001');
    repository.create.mockResolvedValue(baseOrder);
    repository.findById.mockResolvedValue(baseOrder);
    repository.update.mockImplementation((_id, data) => Promise.resolve({ ...baseOrder, ...data, debt: data.debtId ? { id: data.debtId, status: 'UNPAID', originalAmount: '80.00', dueDate: new Date('2026-08-10T00:00:00Z') } : null }));
    repository.findActor.mockResolvedValue({ fullName: 'Employee', username: 'employee' });
    repository.addItem.mockResolvedValue(addedItem);
    repository.updateItem.mockResolvedValue(addedItem);
    repository.removeItem.mockResolvedValue(addedItem);
    repository.findItemById.mockResolvedValue(baseOrder.items[0]);
    debtService.createDebt.mockResolvedValue({ id: '55555555-5555-4555-8555-555555555555' });
    verifyAdmin.mockResolvedValue(undefined);
  });

  it('creates the debt for the remainder through the caller transaction and audits create plus debt link', async () => {
    const result = await SalesOrdersService.create(input, user, {});
    expect(result.totalAmount).toBe('100.00');
    expect(result.paidAmount).toBe('20.00');
    expect(result.remainingAmount).toBe('80.00');
    expect(debtService.createDebt).toHaveBeenCalledWith(input.customerId, expect.objectContaining({ amount: '80.00', dueDate: '2026-08-10' }), user, tx);
    expect(audit).toHaveBeenCalledTimes(2);
    expect(audit.mock.calls.map(([entry]) => entry.action)).toEqual([
      SalesAuditAction.LINK_DEBT,
      SalesAuditAction.CREATE,
    ]);
  });

  it('does not write an audit when debt creation fails, leaving the transaction to roll back the inserted order', async () => {
    debtService.createDebt.mockRejectedValueOnce(new Error('debt failed'));
    await expect(SalesOrdersService.create(input, user, {})).rejects.toThrow('debt failed');
    expect(audit).not.toHaveBeenCalled();
  });

  it('creates no financial record for a fully-paid cash sale and returns money as strings', async () => {
    const paidOrder = { ...baseOrder, paymentStatus: SalesOrderPaymentStatus.PAID, paidAmount: '100.00', remainingAmount: '0.00' };
    repository.create.mockResolvedValueOnce(paidOrder);
    const result = await SalesOrdersService.create({ ...input, paidAmount: '100.00', debtDueDate: null }, user, {});
    expect(debtService.createDebt).not.toHaveBeenCalled();
    expect(typeof result.totalAmount).toBe('string');
    expect(typeof result.itemsSubtotal).toBe('string');
    expect(typeof result.deliveryFee).toBe('string');
    expect(typeof result.paidAmount).toBe('string');
    expect(typeof result.remainingAmount).toBe('string');
    expect(typeof result.items[0].unitPrice).toBe('string');
    expect(typeof result.items[0].discountAmount).toBe('string');
    expect(typeof result.items[0].lineTotal).toBe('string');
  });

  it('allows only an admin fully-paid sale to omit the customer', async () => {
    const paidOrder = { ...baseOrder, customerId: null, customer: null, paymentStatus: SalesOrderPaymentStatus.PAID, paidAmount: '100.00', remainingAmount: '0.00' };
    repository.create.mockResolvedValueOnce(paidOrder);
    const result = await SalesOrdersService.create({ ...input, customerId: null, paidAmount: '100.00', debtDueDate: null }, { ...user, role: 'ADMIN' }, {});
    expect(result.customerId).toBeNull();
    expect(result.customer).toBeNull();
    expect(repository.findActiveCustomer).not.toHaveBeenCalled();
    expect(debtService.createDebt).not.toHaveBeenCalled();

    await expect(SalesOrdersService.create({ ...input, customerId: null, paidAmount: '100.00', debtDueDate: null }, user, {})).rejects.toThrow('Customer is required');
    await expect(SalesOrdersService.create({ ...input, customerId: null }, { ...user, role: 'ADMIN' }, {})).rejects.toThrow('Customer is required');
  });

  it('rejects a second financial conversion and cancellation with a live link', async () => {
    repository.findById.mockResolvedValueOnce({ ...baseOrder, debtId: '55555555-5555-4555-8555-555555555555' });
    await expect(SalesOrdersService.createDebt(baseOrder.id, { dueDate: '2026-08-10' }, user, {})).rejects.toMatchObject({ statusCode: 409 });
    repository.findById.mockResolvedValueOnce({ ...baseOrder, debtId: '55555555-5555-4555-8555-555555555555' });
    await expect(SalesOrdersService.cancel(baseOrder.id, { reason: 'Cancel linked order', accountPassword: 'password' }, { ...user, role: 'ADMIN' }, {})).rejects.toMatchObject({ statusCode: 409 });
  });

  it('rejects edits to cancelled orders and sensitive edits without valid admin verification', async () => {
    repository.findById.mockResolvedValueOnce({ ...baseOrder, fulfillmentStatus: SalesOrderFulfillmentStatus.CANCELLED });
    await expect(SalesOrdersService.update(baseOrder.id, { notes: 'Updated note' }, user, {})).rejects.toMatchObject({ statusCode: 409 });

    repository.findById.mockResolvedValueOnce(baseOrder);
    await expect(SalesOrdersService.update(baseOrder.id, { orderDate: '2026-08-03' }, user, {})).rejects.toMatchObject({ statusCode: 403 });

    repository.findById.mockResolvedValueOnce(baseOrder);
    verifyAdmin.mockRejectedValueOnce(Object.assign(new Error('Account password is incorrect'), { statusCode: 401 }));
    await expect(SalesOrdersService.update(baseOrder.id, { orderDate: '2026-08-03', reason: 'Correct order date', accountPassword: 'wrong' }, { ...user, role: 'ADMIN' }, {})).rejects.toMatchObject({ statusCode: 401 });
  });

  it('writes exactly one audit row when an unlinked order is cancelled', async () => {
    const adminUser = { ...user, role: 'ADMIN' };
    repository.findById.mockResolvedValueOnce(baseOrder);
    repository.update.mockResolvedValueOnce({ ...baseOrder, fulfillmentStatus: SalesOrderFulfillmentStatus.CANCELLED, cancelledReason: 'Customer changed mind' });
    await SalesOrdersService.cancel(baseOrder.id, { reason: 'Customer changed mind', accountPassword: 'password' }, adminUser, {});
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0][0]).toMatchObject({
      action: 'CANCEL',
      reason: 'Customer changed mind',
      beforeValues: { fulfillmentStatus: 'CONFIRMED' },
      afterValues: { fulfillmentStatus: 'CANCELLED' },
    });
  });

  it('addItem creates exactly one debt for a newly introduced remainder', async () => {
    repository.findById
      .mockResolvedValueOnce(fullyPaidOrder())
      .mockResolvedValueOnce(orderAfterAddingBalance());

    await SalesOrdersService.addItem(baseOrder.id, {
      manualProductName: 'Television',
      quantity: 1,
      unitPrice: '200.00',
      debtDueDate: '2026-08-10',
      reason: 'Add television line',
      accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {});

    expect(debtService.createDebt).toHaveBeenCalledTimes(1);
    expect(debtService.createDebt).toHaveBeenCalledWith(
      input.customerId,
      expect.objectContaining({ amount: '200.00', dueDate: '2026-08-10' }),
      expect.objectContaining({ role: 'ADMIN' }),
      tx
    );
  });

  it('updateItem creates exactly one debt for a newly introduced remainder', async () => {
    const existing = fullyPaidOrder();
    const changedItem = { ...existing.items[0], unitPrice: '650.00', lineTotal: '650.00' };
    repository.findById
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...existing, items: [changedItem] });
    repository.findItemById.mockResolvedValueOnce(existing.items[0]);
    repository.updateItem.mockResolvedValueOnce(changedItem);

    await SalesOrdersService.updateItem(baseOrder.id, existing.items[0].id, {
      unitPrice: '650.00',
      debtDueDate: '2026-08-10',
      reason: 'Correct item price',
      accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {});

    expect(debtService.createDebt).toHaveBeenCalledTimes(1);
    expect(debtService.createDebt).toHaveBeenCalledWith(
      input.customerId,
      expect.objectContaining({ amount: '200.00', dueDate: '2026-08-10' }),
      expect.objectContaining({ role: 'ADMIN' }),
      tx
    );
  });

  it('removeItem creates exactly one debt when the recalculated order still has a remainder', async () => {
    const keptItem = { ...baseOrder.items[0], unitPrice: '500.00', lineTotal: '500.00' };
    const removedItem = { ...addedItem, unitPrice: '200.00', lineTotal: '200.00' };
    const existing = {
      ...baseOrder,
      itemsSubtotal: '700.00',
      totalAmount: '700.00',
      paidAmount: '300.00',
      remainingAmount: '400.00',
      items: [keptItem, removedItem],
    };
    repository.findById
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...existing, items: [keptItem] });

    await SalesOrdersService.removeItem(baseOrder.id, removedItem.id, {
      debtDueDate: '2026-08-10',
      reason: 'Remove duplicate line',
      accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {});

    expect(debtService.createDebt).toHaveBeenCalledTimes(1);
    expect(debtService.createDebt).toHaveBeenCalledWith(
      input.customerId,
      expect.objectContaining({ amount: '200.00', dueDate: '2026-08-10' }),
      expect.objectContaining({ role: 'ADMIN' }),
      tx
    );
  });

  it('update with deliveryFee creates exactly one debt for the new remainder', async () => {
    const existing = fullyPaidOrder({ salesChannel: SalesChannel.SHOP_DELIVERY });
    repository.findById
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce({ ...existing, deliveryFee: '200.00' });

    await SalesOrdersService.update(baseOrder.id, {
      deliveryFee: '200.00',
      debtDueDate: '2026-08-10',
      reason: 'Add delivery charge',
      accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {});

    expect(debtService.createDebt).toHaveBeenCalledTimes(1);
    expect(debtService.createDebt).toHaveBeenCalledWith(
      input.customerId,
      expect.objectContaining({ amount: '200.00', dueDate: '2026-08-10' }),
      expect.objectContaining({ role: 'ADMIN' }),
      tx
    );
  });

  it.each([
    ['addItem', () => SalesOrdersService.addItem(baseOrder.id, {
      manualProductName: 'Television', quantity: 1, unitPrice: '200.00', reason: 'Add television line', accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {})],
    ['updateItem', () => SalesOrdersService.updateItem(baseOrder.id, baseOrder.items[0].id, {
      unitPrice: '650.00', reason: 'Correct item price', accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {})],
    ['removeItem', () => SalesOrdersService.removeItem(baseOrder.id, addedItem.id, {
      reason: 'Remove duplicate line', accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {})],
    ['update deliveryFee', () => SalesOrdersService.update(baseOrder.id, {
      deliveryFee: '200.00', reason: 'Add delivery charge', accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {})],
  ])('%s rejects a recalculated remainder without debtDueDate', async (entryPoint, mutate) => {
    const existing = entryPoint === 'removeItem'
      ? { ...fullyPaidOrder(), paidAmount: '300.00', items: [fullyPaidOrder().items[0], addedItem] }
      : fullyPaidOrder({ ...(entryPoint === 'update deliveryFee' ? { salesChannel: SalesChannel.SHOP_DELIVERY } : {}) });
    const recalculated = entryPoint === 'updateItem'
      ? { ...existing, items: [{ ...existing.items[0], unitPrice: '650.00', lineTotal: '650.00' }] }
      : entryPoint === 'removeItem'
        ? { ...existing, items: [existing.items[0]] }
        : entryPoint === 'update deliveryFee'
          ? { ...existing, deliveryFee: '200.00' }
          : { ...existing, items: [existing.items[0], addedItem] };
    repository.findById.mockResolvedValueOnce(existing).mockResolvedValueOnce(recalculated);
    repository.findItemById.mockResolvedValueOnce(existing.items[0]);

    await expect(mutate()).rejects.toThrow('Debt due date is required');
    expect(debtService.createDebt).not.toHaveBeenCalled();
  });

  it('rejects an item edit that would leave a customerless order owing money', async () => {
    const existing = fullyPaidOrder({ customerId: null, customer: null });
    repository.findById
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(orderAfterAddingBalance({ customerId: null, customer: null }));

    await expect(SalesOrdersService.addItem(baseOrder.id, {
      manualProductName: 'Television',
      quantity: 1,
      unitPrice: '200.00',
      debtDueDate: '2026-08-10',
      reason: 'Add television line',
      accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {})).rejects.toThrow('Customer is required');
    expect(debtService.createDebt).not.toHaveBeenCalled();
  });
});
