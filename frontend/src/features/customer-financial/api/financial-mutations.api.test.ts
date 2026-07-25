import { beforeEach, describe, expect, it, vi } from 'vitest';
import { financialMutationsApi } from './financial-mutations.api';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    post: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  api: apiMock,
}));

describe('financialMutationsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 'created-id' } } });
  });

  it('creates a debt without duplicated customer fields', async () => {
    await financialMutationsApi.createDebt('customer-1', {
      amount: '600.00',
      description: 'Refrigerator',
      dueDate: '2026-08-10',
      notes: null,
    });

    expect(apiMock.post).toHaveBeenCalledWith('/customers/customer-1/debts', {
      amount: '600.00',
      description: 'Refrigerator',
      dueDate: '2026-08-10',
      notes: null,
    });
    expect(apiMock.post.mock.calls[0][1]).not.toHaveProperty('customerName');
    expect(apiMock.post.mock.calls[0][1]).not.toHaveProperty('phone');
  });

  it('records debt payments with a client idempotency key', async () => {
    await financialMutationsApi.recordDebtPayment('debt-1', {
      amount: '200.00',
      paymentDate: '2026-07-24',
      paymentMethod: 'CASH',
      reference: 'receipt-1',
      notes: null,
      idempotencyKey: 'key-1',
    });

    expect(apiMock.post).toHaveBeenCalledWith('/debts/debt-1/payments', {
      amount: '200.00',
      paymentDate: '2026-07-24',
      paymentMethod: 'CASH',
      reference: 'receipt-1',
      notes: null,
      idempotencyKey: 'key-1',
    });
  });

  it('cancels debt with a reason only', async () => {
    await financialMutationsApi.cancelDebt('debt-1', { reason: 'Returned' });

    expect(apiMock.post).toHaveBeenCalledWith('/debts/debt-1/cancel', { reason: 'Returned' });
  });

  it('creates an installment plan without generated schedule or customer fields', async () => {
    await financialMutationsApi.createInstallmentPlan('customer-1', {
      totalAmount: '600.00',
      description: 'Refrigerator',
      startDate: '2026-08-01',
      installmentCount: 6,
      frequency: 'MONTHLY',
      notes: null,
    });

    expect(apiMock.post).toHaveBeenCalledWith('/customers/customer-1/installment-plans', {
      totalAmount: '600.00',
      description: 'Refrigerator',
      startDate: '2026-08-01',
      installmentCount: 6,
      frequency: 'MONTHLY',
      notes: null,
    });
    expect(apiMock.post.mock.calls[0][1]).not.toHaveProperty('schedule');
    expect(apiMock.post.mock.calls[0][1]).not.toHaveProperty('customerName');
    expect(apiMock.post.mock.calls[0][1]).not.toHaveProperty('phone');
  });

  it('records one installment-plan payment request for backend allocation', async () => {
    await financialMutationsApi.recordInstallmentPlanPayment('plan-1', {
      amount: '150.00',
      paymentDate: '2026-08-15',
      paymentMethod: 'CASH',
      reference: null,
      notes: null,
      idempotencyKey: 'key-2',
    });

    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(apiMock.post).toHaveBeenCalledWith('/installment-plans/plan-1/payments', {
      amount: '150.00',
      paymentDate: '2026-08-15',
      paymentMethod: 'CASH',
      reference: null,
      notes: null,
      idempotencyKey: 'key-2',
    });
  });

  it('cancels an installment plan with a reason only', async () => {
    await financialMutationsApi.cancelInstallmentPlan('plan-1', { reason: 'Agreement cancelled' });

    expect(apiMock.post).toHaveBeenCalledWith('/installment-plans/plan-1/cancel', {
      reason: 'Agreement cancelled',
    });
  });
});
