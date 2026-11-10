import { describe, expect, it } from 'vitest';
import { NO_REASON_GIVEN } from '../corrections/corrections.validator';
import { correctPaymentSchema, reallocatePaymentSchema, voidPaymentSchema } from './payments.validator';

const installmentId = '11111111-1111-4111-8111-111111111111';

describe('payment correction reasons are optional for admins', () => {
  it('records a blank or missing reason as "No reason given"', () => {
    expect(voidPaymentSchema.parse({}).reason).toBe(NO_REASON_GIVEN);
    expect(voidPaymentSchema.parse({ reason: '   ' }).reason).toBe(NO_REASON_GIVEN);
    expect(correctPaymentSchema.parse({ paymentDate: '2026-11-10', paymentMethod: 'CASH', reason: '' }).reason).toBe(NO_REASON_GIVEN);
    expect(reallocatePaymentSchema.parse({ allocations: [{ installmentId, amount: '10.00' }] }).reason).toBe(NO_REASON_GIVEN);
  });

  it('keeps a typed reason, even a short one', () => {
    expect(voidPaymentSchema.parse({ reason: ' dup ' }).reason).toBe('dup');
  });
});
