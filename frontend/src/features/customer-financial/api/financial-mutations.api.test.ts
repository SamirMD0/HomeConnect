import { beforeEach, describe, expect, it, vi } from 'vitest';
import { financialMutationsApi } from './financial-mutations.api';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('../../../services/api', () => ({
  api: apiMock,
}));

describe('financialMutationsApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.post.mockResolvedValue({ data: { success: true, data: { id: 'created-id' } } });
    apiMock.patch.mockResolvedValue({ data: { success: true, data: { id: 'updated-id' } } });
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

  it('creates a prepaid purchase with the initial and full amounts', async () => {
    await financialMutationsApi.createPrepaidPurchase('customer-1', {
      itemName: 'Air conditioner',
      paymentAmount: '100.00',
      fullAmount: '400.00',
      notes: 'Collect later',
    });

    expect(apiMock.post).toHaveBeenCalledWith('/customers/customer-1/prepaid-purchases', {
      itemName: 'Air conditioner',
      paymentAmount: '100.00',
      fullAmount: '400.00',
      notes: 'Collect later',
    });
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

  it('corrects a debt with account password and audit reason', async () => {
    await financialMutationsApi.updateDebt('debt-1', {
      originalAmount: '650.00',
      description: 'Updated debt',
      dueDate: '2026-08-15',
      notes: 'Updated notes',
      reason: 'Original invoice amount was entered incorrectly',
      sourceScreen: 'CUSTOMER_PROFILE',
      accountPassword: 'admin-password',
    });

    expect(apiMock.post).toHaveBeenCalledWith('/debts/debt-1/corrections', {
      originalAmount: '650.00',
      description: 'Updated debt',
      dueDate: '2026-08-15',
      notes: 'Updated notes',
      reason: 'Original invoice amount was entered incorrectly',
      sourceScreen: 'CUSTOMER_PROFILE',
      accountPassword: 'admin-password',
    });
  });

  it('cancels debt with a reason and account password', async () => {
    await financialMutationsApi.cancelDebt('debt-1', {
      reason: 'Returned',
      accountPassword: 'admin-password',
    });

    expect(apiMock.post).toHaveBeenCalledWith('/debts/debt-1/cancel', {
      reason: 'Returned',
      accountPassword: 'admin-password',
    });
  });

  it('voids a payment with a reason and account password', async () => {
    await financialMutationsApi.voidPayment('payment-1', {
      reason: 'Wrong payment was entered',
      sourceScreen: 'LEDGER',
      accountPassword: 'admin-password',
    });

    expect(apiMock.post).toHaveBeenCalledWith('/payments/payment-1/void', {
      reason: 'Wrong payment was entered',
      sourceScreen: 'LEDGER',
      accountPassword: 'admin-password',
    });
  });

  it('reallocates a payment with replacement installment allocations', async () => {
    await financialMutationsApi.reallocatePayment('payment-1', {
      allocations: [
        { installmentId: 'installment-1', amount: '120.00' },
        { installmentId: 'installment-2', amount: '80.00' },
      ],
      reason: 'Payment was allocated to the wrong installments',
      sourceScreen: 'PLAN_DETAILS',
      accountPassword: 'admin-password',
    });

    expect(apiMock.post).toHaveBeenCalledWith('/payments/payment-1/reallocate', {
      allocations: [
        { installmentId: 'installment-1', amount: '120.00' },
        { installmentId: 'installment-2', amount: '80.00' },
      ],
      reason: 'Payment was allocated to the wrong installments',
      sourceScreen: 'PLAN_DETAILS',
      accountPassword: 'admin-password',
    });
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

  it('creates an installment plan with a manual schedule when provided', async () => {
    await financialMutationsApi.createInstallmentPlan('customer-1', {
      totalAmount: '320.00',
      description: 'Manual refrigerator plan',
      startDate: '2026-08-01',
      installmentCount: 3,
      frequency: 'MONTHLY',
      notes: null,
      schedule: [{ amountDue: '120.00' }, { amountDue: '110.00' }, { amountDue: '90.00' }],
    });

    expect(apiMock.post).toHaveBeenCalledWith('/customers/customer-1/installment-plans', {
      totalAmount: '320.00',
      description: 'Manual refrigerator plan',
      startDate: '2026-08-01',
      installmentCount: 3,
      frequency: 'MONTHLY',
      notes: null,
      schedule: [{ amountDue: '120.00' }, { amountDue: '110.00' }, { amountDue: '90.00' }],
    });
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

  it('corrects an installment plan with account password and audit reason', async () => {
    await financialMutationsApi.updateInstallmentPlan('plan-1', {
      totalAmount: '650.00',
      description: 'Updated plan',
      startDate: '2026-08-01',
      installmentCount: 6,
      notes: 'Updated notes',
      reason: 'Corrected agreement amount',
      sourceScreen: 'PLAN_DETAILS',
      accountPassword: 'admin-password',
    });

    expect(apiMock.post).toHaveBeenCalledWith('/installment-plans/plan-1/corrections', {
      totalAmount: '650.00',
      description: 'Updated plan',
      startDate: '2026-08-01',
      installmentCount: 6,
      notes: 'Updated notes',
      reason: 'Corrected agreement amount',
      sourceScreen: 'PLAN_DETAILS',
      accountPassword: 'admin-password',
    });
  });

  it('cancels an installment plan with a reason and account password', async () => {
    await financialMutationsApi.cancelInstallmentPlan('plan-1', {
      reason: 'Agreement cancelled',
      accountPassword: 'admin-password',
    });

    expect(apiMock.post).toHaveBeenCalledWith('/installment-plans/plan-1/cancel', {
      reason: 'Agreement cancelled',
      accountPassword: 'admin-password',
    });
  });
});
