import {
  Currency,
  DeliveryTaxTreatment,
  Prisma,
  SalesAuditAction,
  SalesChannel,
  SalesOrderFulfillmentStatus,
  SalesOrderPaymentStatus,
  SalesOrderSettlement,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository, debtService, audit, verifyAdmin, taxRepository, counterPayment, paymentRepository, tx } = vi.hoisted(() => ({
  tx: { marker: 'transaction' },
  counterPayment: vi.fn(),
  paymentRepository: { findByIdempotencyKey: vi.fn() },
  repository: {
    findByIdempotencyKey: vi.fn(), findActiveCustomer: vi.fn(), findActiveProduct: vi.fn(), nextOrderNumber: vi.fn(),
    create: vi.fn(), update: vi.fn(), findActor: vi.fn(), findById: vi.fn(),
    addItem: vi.fn(), updateItem: vi.fn(), removeItem: vi.fn(), findItemById: vi.fn(),
    hasActiveStockFulfillmentForItem: vi.fn(), hasActiveStockFulfillmentForOrder: vi.fn(),
  },
  debtService: { createDebt: vi.fn() },
  audit: vi.fn(),
  verifyAdmin: vi.fn(),
  taxRepository: { requireEffectiveProfile: vi.fn(), requireEffectiveZeroRatedProfile: vi.fn() },
}));

vi.mock('../../financial/infrastructure/transaction', () => ({ runFinancialTransaction: vi.fn((operation) => operation(tx)) }));
vi.mock('../../financial/payments/counter-payment', () => ({ recordCounterPayment: counterPayment }));
vi.mock('../../financial/payments/payments.repository', () => ({ PaymentsRepository: paymentRepository }));
vi.mock('../../financial/debts/debts.service', () => ({ DebtsService: debtService }));
vi.mock('../audit/sales-audit', () => ({ writeSalesAudit: audit }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verifyAdmin }));
vi.mock('../../tax/tax.repository', () => ({ TaxRepository: taxRepository }));
vi.mock('./sales-orders.repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./sales-orders.repository')>();
  return { ...actual, SalesOrdersRepository: repository };
});

import { SalesOrdersService, serializeSalesOrder } from './sales-orders.service';
import { createIdempotencyFingerprint } from '../../financial/infrastructure/idempotency';

const user = { userId: '11111111-1111-4111-8111-111111111111', role: 'EMPLOYEE' };
const input = {
  idempotencyKey: 'counter-unit-create', exchangeRate: '1.000000',
  customerId: '22222222-2222-4222-8222-222222222222',
  salesChannel: SalesChannel.SHOP_DIRECT,
  orderDate: '2026-08-03',
  fulfillmentStatus: SalesOrderFulfillmentStatus.CONFIRMED,
  deliveryTaxTreatment: DeliveryTaxTreatment.STANDARD,
  paidAmount: '20.00',
  debtDueDate: '2026-08-10',
  items: [{ manualProductName: 'Fan', quantity: 1, unitPrice: '100.00' }],
};

const baseOrder = {
  id: '33333333-3333-4333-8333-333333333333', orderNumber: 'SO-2026-0001',
  customerId: input.customerId, customer: { id: input.customerId, name: 'Customer', phone: '1', address: null, isActive: true },
  salesChannel: SalesChannel.SHOP_DIRECT, orderDate: new Date('2026-08-03T00:00:00Z'), deliveryDate: null, deliveredAt: null,
  fulfillmentStatus: SalesOrderFulfillmentStatus.CONFIRMED, paymentStatus: SalesOrderPaymentStatus.PARTIALLY_PAID,
  settlement: SalesOrderSettlement.NONE, itemsSubtotal: '100.00', deliveryFee: null,
  deliveryTaxTreatment: DeliveryTaxTreatment.EXEMPT, deliveryTaxRateSnapshot: new Prisma.Decimal(0), deliveryTaxCodeSnapshot: null,
  deliveryFeeExVat: null, deliveryVatAmount: new Prisma.Decimal(0), deliveryFeeIncVat: null,
  totalAmount: '100.00', paidAmount: '20.00', remainingAmount: '80.00',
  currency: Currency.USD, exchangeRate: new Prisma.Decimal(1), baseSubtotal: '100.00', baseDeliveryFee: null,
  baseTotalAmount: '100.00', basePaidAmount: '20.00', baseRemainingAmount: '80.00',
  deliveryAddressSnapshot: null, deliveryNotes: null, notes: null, debtId: null, debt: null, installmentPlanId: null, installmentPlan: null,
  createdById: user.userId, createdBy: { id: user.userId, fullName: 'Employee', username: 'employee' }, updatedById: null, updatedBy: null,
  createdAt: new Date(), updatedAt: new Date(), cancelledAt: null, cancelledById: null, cancelledBy: null, cancelledReason: null,
  items: [{ id: '44444444-4444-4444-8444-444444444444', salesOrderId: '33333333-3333-4333-8333-333333333333', productId: null, product: null, manualProductName: 'Fan', manualProductModel: null, productNameSnapshot: 'Fan', productModelSnapshot: null, skuSnapshot: null, quantity: 1, unitPrice: '100.00', discountAmount: null, lineTotal: '100.00', notes: null, baseUnitPrice: '100.00', baseDiscountAmount: null, baseLineTotal: '100.00', createdAt: new Date(), updatedAt: new Date() }],
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

function withTaxableDelivery(order: Record<string, unknown>, fee = '200.00') {
  return {
    ...order,
    deliveryFee: fee,
    deliveryTaxTreatment: DeliveryTaxTreatment.STANDARD,
    deliveryTaxRateSnapshot: new Prisma.Decimal('11.000'),
    deliveryTaxCodeSnapshot: 'LB_STANDARD',
    deliveryFeeExVat: new Prisma.Decimal('180.18'),
    deliveryVatAmount: new Prisma.Decimal('19.82'),
    deliveryFeeIncVat: new Prisma.Decimal(fee),
  };
}

describe('sales order service transaction boundary', () => {
  it('replays a committed additional receipt after a concurrent unique-key race', async () => {
    const command = { paidAmount: '100.00', idempotencyKey: 'counter-race-change', reason: 'Cash received', accountPassword: 'password' };
    const admin = { ...user, role: 'ADMIN' };
    const fingerprint = createIdempotencyFingerprint({ orderId: baseOrder.id, input: { ...command, accountPassword: undefined }, userId: admin.userId });
    paymentRepository.findByIdempotencyKey.mockResolvedValueOnce(null).mockResolvedValueOnce({ idempotencyFingerprint: fingerprint });
    repository.update.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Unique receipt key', { code: 'P2002', clientVersion: 'test' }));
    await expect(SalesOrdersService.changePayment(baseOrder.id, command, admin, {})).resolves.toMatchObject({ id: baseOrder.id });
    expect(counterPayment).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findByIdempotencyKey.mockResolvedValue(null);
    paymentRepository.findByIdempotencyKey.mockResolvedValue(null);
    counterPayment.mockResolvedValue({ id: 'counter-payment-id' });
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
    repository.hasActiveStockFulfillmentForItem.mockResolvedValue(null);
    repository.hasActiveStockFulfillmentForOrder.mockResolvedValue(null);
    debtService.createDebt.mockResolvedValue({ id: '55555555-5555-4555-8555-555555555555' });
    verifyAdmin.mockResolvedValue(undefined);
    taxRepository.requireEffectiveProfile.mockResolvedValue({ code: 'LB_ZERO', taxRate: { ratePercent: '0.000' } });
    taxRepository.requireEffectiveZeroRatedProfile.mockResolvedValue({ code: 'LB_ZERO', taxRate: { ratePercent: new Prisma.Decimal(0) } });
  });

  it('serializes authoritative inventory state and active fulfillment id for the frontend', () => {
    const serialized = serializeSalesOrder({
      ...baseOrder,
      items: [{
        ...baseOrder.items[0],
        productId: '99999999-9999-4999-8999-999999999999',
        product: {
          id: '99999999-9999-4999-8999-999999999999', name: 'Fan', model: null, sku: 'FAN-1', barcode: null,
          isActive: true, trackStock: true, stockQuantity: 8, lowStockThreshold: null, costPrice: null,
          stockMovements: [{ createdAt: new Date('2026-08-03T08:00:00.000Z') }],
        },
        quantity: 2,
        stockFulfillments: [{
          id: '88888888-8888-4888-8888-888888888888', quantity: 2, status: 'ACTIVE',
          stockMovementId: '77777777-7777-4777-8777-777777777777', reversalStockMovementId: null,
          reversedAt: null, reversedById: null, reversalReason: null, createdById: user.userId, createdAt: new Date(),
        }],
      }],
    } as never);
    expect(serialized.items[0].inventory).toEqual({
      state: 'ALREADY_DEDUCTED',
      activeFulfillmentId: '88888888-8888-4888-8888-888888888888',
    });
    expect(serialized.items[0].product).not.toHaveProperty('stockMovements');
  });

  it('creates the debt for the remainder through the caller transaction and audits create plus debt link', async () => {
    const result = await SalesOrdersService.create(input, user, {});
    expect(result.totalAmount).toBe('100.00');
    expect(result.paidAmount).toBe('20.00');
    expect(result.remainingAmount).toBe('80.00');
    expect(debtService.createDebt).toHaveBeenCalledWith(input.customerId, expect.objectContaining({ amount: '80.00', dueDate: '2026-08-10' }), user, tx, '1.000000');
    expect(audit).toHaveBeenCalledTimes(2);
    expect(audit.mock.calls.map(([entry]) => entry.action)).toEqual([
      SalesAuditAction.LINK_DEBT,
      SalesAuditAction.CREATE,
    ]);
  });

  it('snapshots the effective default VAT profile and totals the customer-facing amount inclusively', async () => {
    taxRepository.requireEffectiveProfile.mockResolvedValue({ code: 'LB_STANDARD', taxRate: { ratePercent: '11.000' } });
    await SalesOrdersService.create({
      ...input,
      fulfillmentStatus: SalesOrderFulfillmentStatus.DRAFT,
      paidAmount: '0.00',
      items: [{ manualProductName: 'Fan', quantity: 1, unitPrice: '150.00' }],
    }, user, {});

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
      itemsSubtotal: '135.14', totalAmount: '150.00', remainingAmount: '150.00',
      items: { create: [expect.objectContaining({
        lineTotal: expect.objectContaining({}), taxRateSnapshot: expect.objectContaining({}),
        taxCodeSnapshot: 'LB_STANDARD', unitPriceExVat: expect.objectContaining({}),
        vatAmount: expect.objectContaining({}), lineTotalIncVat: expect.objectContaining({}),
      })] },
    }), tx);
    const line = repository.create.mock.calls.at(-1)![0].items.create[0];
    expect(line.lineTotal.toFixed(2)).toBe('135.14');
    expect(line.vatAmount.toFixed(2)).toBe('14.86');
    expect(line.lineTotalIncVat.toFixed(2)).toBe('150.00');
  });

  it('INV-21 makes document VAT the exact sum of rounded line VAT instead of independently rounding the subtotal', async () => {
    taxRepository.requireEffectiveProfile.mockResolvedValue({ code: 'LB_STANDARD', taxRate: { ratePercent: '11.000' } });
    await SalesOrdersService.create({
      ...input,
      fulfillmentStatus: SalesOrderFulfillmentStatus.DRAFT,
      paidAmount: '0.00',
      items: [
        { manualProductName: 'Small line A', quantity: 1, unitPrice: '0.05', priceIncludesVat: false },
        { manualProductName: 'Small line B', quantity: 1, unitPrice: '0.05', priceIncludesVat: false },
      ],
    }, user, {});

    const created = repository.create.mock.calls.at(-1)![0];
    const lines = created.items.create;
    expect(lines.map((line: { vatAmount: { toFixed: (places: number) => string } }) => line.vatAmount.toFixed(2))).toEqual(['0.01', '0.01']);
    expect(created.itemsSubtotal).toBe('0.10');
    expect(created.totalAmount).toBe('0.12');
    // Independently rounding 0.10 × 11% would be 0.01; the stored line sum is 0.02.
    expect(lines[0].vatAmount.plus(lines[1].vatAmount).toFixed(2)).toBe('0.02');
  });

  it('taxes a VAT-inclusive delivery fee at the effective standard rate by default and snapshots every component', async () => {
    taxRepository.requireEffectiveProfile.mockResolvedValue({ code: 'LB_STANDARD', taxRate: { ratePercent: new Prisma.Decimal('11.000') } });
    await SalesOrdersService.create({
      ...input,
      salesChannel: SalesChannel.SHOP_DELIVERY,
      fulfillmentStatus: SalesOrderFulfillmentStatus.DRAFT,
      deliveryFee: '10.00',
      paidAmount: '0.00',
    }, user, {});

    const created = repository.create.mock.calls.at(-1)![0];
    expect(created).toMatchObject({
      deliveryTaxTreatment: DeliveryTaxTreatment.STANDARD,
      deliveryTaxCodeSnapshot: 'LB_STANDARD',
      itemsSubtotal: '90.09',
      totalAmount: '110.00',
      remainingAmount: '110.00',
    });
    expect(created.deliveryTaxRateSnapshot.toFixed(3)).toBe('11.000');
    expect(created.deliveryFeeExVat.toFixed(2)).toBe('9.01');
    expect(created.deliveryVatAmount.toFixed(2)).toBe('0.99');
    expect(created.deliveryFeeIncVat.toFixed(2)).toBe('10.00');
  });

  it('supports explicit zero-rated and exempt delivery without changing the quoted fee', async () => {
    taxRepository.requireEffectiveProfile.mockResolvedValue({ code: 'LB_STANDARD', taxRate: { ratePercent: new Prisma.Decimal('11.000') } });

    await SalesOrdersService.create({
      ...input,
      salesChannel: SalesChannel.SHOP_DELIVERY,
      fulfillmentStatus: SalesOrderFulfillmentStatus.DRAFT,
      deliveryFee: '10.00',
      deliveryTaxTreatment: DeliveryTaxTreatment.ZERO_RATED,
      paidAmount: '0.00',
    }, user, {});
    let created = repository.create.mock.calls.at(-1)![0];
    expect(created.deliveryTaxCodeSnapshot).toBe('LB_ZERO');
    expect(created.deliveryVatAmount.toFixed(2)).toBe('0.00');
    expect(created.deliveryFeeIncVat.toFixed(2)).toBe('10.00');

    await SalesOrdersService.create({
      ...input,
      salesChannel: SalesChannel.SHOP_DELIVERY,
      fulfillmentStatus: SalesOrderFulfillmentStatus.DRAFT,
      deliveryFee: '10.00',
      deliveryTaxTreatment: DeliveryTaxTreatment.EXEMPT,
      paidAmount: '0.00',
    }, user, {});
    created = repository.create.mock.calls.at(-1)![0];
    expect(created.deliveryTaxCodeSnapshot).toBe('EXEMPT');
    expect(created.deliveryTaxRateSnapshot.toFixed(3)).toBe('0.000');
    expect(created.deliveryVatAmount.toFixed(2)).toBe('0.00');
    expect(created.deliveryFeeIncVat.toFixed(2)).toBe('10.00');
  });

  it('uses the stored delivery VAT snapshot when a historical order payment changes', async () => {
    const historical = withTaxableDelivery({
      ...baseOrder,
      totalAmount: '300.00',
      paidAmount: '20.00',
      remainingAmount: '280.00',
    });
    repository.findById.mockResolvedValueOnce(historical);
    // A later configuration change must be irrelevant to this transaction.
    taxRepository.requireEffectiveProfile.mockResolvedValue({
      code: 'LB_STANDARD_NEW',
      taxRate: { ratePercent: new Prisma.Decimal('20.000') },
    });

    await SalesOrdersService.changePayment(baseOrder.id, {
      paidAmount: '300.00', idempotencyKey: 'counter-unit-change',
      reason: 'Settle historical invoice',
      accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {});

    expect(taxRepository.requireEffectiveProfile).not.toHaveBeenCalled();
    expect(taxRepository.requireEffectiveZeroRatedProfile).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith(baseOrder.id, expect.objectContaining({
      paidAmount: '300.00',
      remainingAmount: '0.00',
    }), tx);
  });

  it('does not write an audit when debt creation fails, leaving the transaction to roll back the inserted order', async () => {
    debtService.createDebt.mockRejectedValueOnce(new Error('debt failed'));
    await expect(SalesOrdersService.create(input, user, {})).rejects.toThrow('debt failed');
    expect(audit).not.toHaveBeenCalled();
  });

  it('creates a recognized Payment but no debt for a fully-paid cash sale and returns money as strings', async () => {
    const paidOrder = { ...baseOrder, paymentStatus: SalesOrderPaymentStatus.PAID, paidAmount: '100.00', remainingAmount: '0.00' };
    repository.create.mockResolvedValueOnce(paidOrder);
    const result = await SalesOrdersService.create({ ...input, paidAmount: '100.00', debtDueDate: null }, user, {});
    expect(debtService.createDebt).not.toHaveBeenCalled();
    expect(counterPayment).toHaveBeenCalledTimes(1);
    expect(counterPayment).toHaveBeenCalledWith(tx, expect.objectContaining({ amount: '100.00', customerId: input.customerId, idempotencyKey: 'counter-create:counter-unit-create' }));
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

  it('blocks editing and removing a line while its stock fulfillment is active', async () => {
    const editable = fullyPaidOrder({
      items: [fullyPaidOrder().items[0], addedItem],
    });
    repository.findById.mockResolvedValue(editable);
    repository.findItemById.mockResolvedValue(editable.items[0]);
    repository.hasActiveStockFulfillmentForItem.mockResolvedValue({ id: 'active-fulfillment' });

    await expect(SalesOrdersService.updateItem(editable.id, editable.items[0].id, {
      quantity: 2, reason: 'Correct line quantity', accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {})).rejects.toMatchObject({ statusCode: 409 });
    await expect(SalesOrdersService.removeItem(editable.id, editable.items[0].id, {
      reason: 'Remove incorrect line', accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {})).rejects.toMatchObject({ statusCode: 409 });
    expect(repository.updateItem).not.toHaveBeenCalled();
    expect(repository.removeItem).not.toHaveBeenCalled();
  });

  it('keeps the financial guard before the deducted-line guard', async () => {
    repository.findById.mockResolvedValue({ ...baseOrder, debtId: 'linked-debt' });
    repository.hasActiveStockFulfillmentForItem.mockResolvedValue({ id: 'active-fulfillment' });
    await expect(SalesOrdersService.updateItem(baseOrder.id, baseOrder.items[0].id, {
      quantity: 2,
    }, user, {})).rejects.toThrow('Unlink the financial record');
    expect(repository.findItemById).not.toHaveBeenCalled();
  });

  it('blocks cancellation and return while any stock fulfillment is active', async () => {
    repository.hasActiveStockFulfillmentForOrder.mockResolvedValue({ id: 'active-fulfillment' });
    await expect(SalesOrdersService.cancel(baseOrder.id, {
      reason: 'Customer changed mind', accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {})).rejects.toThrow('Restore it before cancelling or returning');

    repository.findById.mockResolvedValue({ ...baseOrder, fulfillmentStatus: SalesOrderFulfillmentStatus.DELIVERED });
    await expect(SalesOrdersService.returnOrder(baseOrder.id, {
      reason: 'Customer returned order', accountPassword: 'password',
    }, { ...user, role: 'ADMIN' }, {})).rejects.toThrow('Restore it before cancelling or returning');
    expect(verifyAdmin).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
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
      tx,
      '1.000000'
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
      tx,
      '1.000000'
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
      tx,
      '1.000000'
    );
  });

  it('update with deliveryFee creates exactly one debt for the new remainder', async () => {
    const existing = fullyPaidOrder({ salesChannel: SalesChannel.SHOP_DELIVERY });
    taxRepository.requireEffectiveProfile.mockResolvedValue({ code: 'LB_STANDARD', taxRate: { ratePercent: new Prisma.Decimal('11.000') } });
    repository.findById
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(withTaxableDelivery(existing));

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
      tx,
      '1.000000'
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
          ? withTaxableDelivery(existing)
          : { ...existing, items: [existing.items[0], addedItem] };
    repository.findById.mockResolvedValueOnce(existing).mockResolvedValueOnce(recalculated);
    repository.findItemById.mockResolvedValueOnce(existing.items[0]);
    if (entryPoint === 'update deliveryFee') {
      taxRepository.requireEffectiveProfile.mockResolvedValue({ code: 'LB_STANDARD', taxRate: { ratePercent: new Prisma.Decimal('11.000') } });
    }

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
