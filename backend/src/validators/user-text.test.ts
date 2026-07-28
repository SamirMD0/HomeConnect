import { describe, expect, it } from 'vitest';
import { createCustomerSchema } from './customers.validator';
import { createDebtSchema, updateDebtSchema } from '../features/financial/debts/debts.validator';
import {
  createInstallmentPlanSchema,
  createInstallmentPlanPaymentSchema,
} from '../features/financial/installment-plans/installment-plans.validator';
import { correctPaymentSchema } from '../features/financial/payments/payments.validator';
import { correctionReasonSchema } from '../features/financial/corrections/corrections.validator';

const arabicText = 'ثلاجة سامسونج - دفعة (1/3)، ملاحظة: بيروت';

describe('Arabic user text validation', () => {
  it('accepts Arabic customer name, address, and notes while trimming whitespace', () => {
    const result = createCustomerSchema.parse({
      name: '  علي الحاج  ',
      phone: '03000000',
      address: 'شارع الحمرا، بناية 12',
      notes: 'ملاحظة عربية مع English 123',
    });

    expect(result.name).toBe('علي الحاج');
    expect(result.address).toBe('شارع الحمرا، بناية 12');
    expect(result.notes).toBe('ملاحظة عربية مع English 123');
  });

  it('accepts Arabic debt descriptions, notes, and correction reasons', () => {
    expect(
      createDebtSchema.parse({
        amount: '320.00',
        description: arabicText,
        dueDate: '2026-08-01',
        notes: 'ملاحظات الدين',
      }).description
    ).toBe(arabicText);

    expect(
      updateDebtSchema.parse({
        originalAmount: '330.00',
        description: 'تصحيح دين',
        dueDate: '2026-08-02',
        notes: 'ملاحظات معدلة',
        reason: 'تصحيح إدخال خاطئ',
        accountPassword: 'admin123',
      }).reason
    ).toBe('تصحيح إدخال خاطئ');
  });

  it('accepts Arabic installment and payment text fields', () => {
    expect(
      createInstallmentPlanSchema.parse({
        totalAmount: '900.00',
        description: 'مكيف غرفة النوم',
        startDate: '2026-08-01',
        installmentCount: 3,
        frequency: 'MONTHLY',
        notes: 'تقسيط بدون فوائد',
      }).description
    ).toBe('مكيف غرفة النوم');

    expect(
      createInstallmentPlanPaymentSchema.parse({
        amount: '300.00',
        paymentDate: '2026-08-02',
        paymentMethod: 'CASH',
        reference: 'وصل رقم ١٢٣',
        notes: 'دفع نقدي',
      }).reference
    ).toBe('وصل رقم ١٢٣');
  });

  it('accepts Arabic payment correction reason', () => {
    const result = correctPaymentSchema.parse({
      amount: '200.00',
      paymentDate: '2026-08-03',
      paymentMethod: 'CASH',
      reference: 'مرجع عربي',
      notes: 'ملاحظات الدفع',
      reason: 'تصحيح مبلغ الدفع',
      accountPassword: 'admin123',
    });

    expect(result.notes).toBe('ملاحظات الدفع');
    expect(correctionReasonSchema.parse('سبب تصحيح عربي')).toBe('سبب تصحيح عربي');
  });

  it('rejects unsafe HTML while preserving Arabic punctuation policy', () => {
    expect(() =>
      createCustomerSchema.parse({
        name: '<script>alert(1)</script>',
        phone: '03000000',
      })
    ).toThrow();

    expect(() =>
      createDebtSchema.parse({
        amount: '100.00',
        description: 'فاتورة <b>خطرة</b>',
        dueDate: '2026-08-01',
      })
    ).toThrow();
  });
});
