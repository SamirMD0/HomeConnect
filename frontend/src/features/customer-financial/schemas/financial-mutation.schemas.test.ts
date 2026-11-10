import { describe, expect, it } from 'vitest';
import {
  cancelFinancialRecordSchema,
  createDebtSchema,
  createInstallmentPlanSchema,
  createPrepaidPurchaseSchema,
  debtPaymentSchema,
  installmentPlanPaymentSchema,
  updateDebtSchema,
  updateInstallmentPlanSchema,
  voidPaymentSchema,
} from './financial-mutation.schemas';

describe('customer profile mutations without password confirmation', () => {
  const debt = { amount: '100.00', description: 'Appliance', dueDate: '2026-11-04' };
  const plan = { totalAmount: '100.00', description: 'Appliance', startDate: '2026-11-04', installmentCount: 2 };
  const payment = { amount: '25.00', paymentDate: '2026-11-04', paymentMethod: 'CASH' };

  it.each([
    ['add debt', createDebtSchema, debt],
    ['add installment plan', createInstallmentPlanSchema, { ...plan, frequency: 'MONTHLY' }],
    ['add prepaid purchase', createPrepaidPurchaseSchema, { itemName: 'Appliance', paymentAmount: '25.00', fullAmount: '100.00' }],
    ['record debt payment', debtPaymentSchema('100.00'), payment],
    ['record installment payment', installmentPlanPaymentSchema('100.00'), payment],
    ['edit debt or prepaid purchase', updateDebtSchema, { ...debt, originalAmount: '100.00', reason: 'Correct invoice' }],
    ['edit installment plan', updateInstallmentPlanSchema, { ...plan, reason: 'Correct invoice' }],
    ['cancel debt, plan, or prepaid purchase', cancelFinancialRecordSchema, { reason: 'Cancelled by customer' }],
    ['void payment', voidPaymentSchema, { reason: 'Duplicate receipt' }],
  ])('%s accepts valid input without a password', (_name, schema, input) => {
    expect(schema.safeParse(input).success).toBe(true);
  });

  it('lets admins leave the reason blank but keeps balance validation', () => {
    expect(voidPaymentSchema.safeParse({ reason: '' }).success).toBe(true);
    expect(cancelFinancialRecordSchema.safeParse({ reason: '' }).success).toBe(true);
    expect(debtPaymentSchema('10.00').safeParse(payment).success).toBe(false);
  });
});
