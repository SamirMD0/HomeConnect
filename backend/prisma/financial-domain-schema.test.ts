import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(path.resolve('backend/prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  path.resolve(
    'backend/prisma/migrations/20260724090000_add_financial_domain_models/migration.sql'
  ),
  'utf8'
);

describe('Phase 2 financial domain schema', () => {
  it('adds the explicit financial domain models', () => {
    for (const model of [
      'model Debt',
      'model InstallmentPlan',
      'model Installment',
      'model Payment',
      'model PaymentAllocation',
    ]) {
      expect(schema).toContain(model);
    }
  });

  it('keeps legacy Transaction model intact', () => {
    expect(schema).toContain('model Transaction');
    expect(schema).toContain('enum TransactionType');
    expect(schema).toContain('ONE_TIME');
    expect(schema).toContain('INSTALLMENT');
    expect(schema).toContain('PAYMENT');
    expect(schema).toContain('ADJUSTMENT');
    expect(migration).not.toMatch(/ALTER TYPE "TransactionType"/);
    expect(migration).not.toMatch(/DROP TYPE "TransactionType"/);
    expect(migration).not.toMatch(/ALTER TABLE "transactions"/);
  });

  it('uses Decimal money fields and PostgreSQL DATE business dates', () => {
    for (const field of [
      'originalAmount Decimal',
      'totalAmount      Decimal',
      'amountDue         Decimal',
      'amount        Decimal',
    ]) {
      expect(schema).toContain(field);
    }

    expect(schema).toMatch(/dueDate\s+DateTime\s+@db\.Date/);
    expect(schema).toMatch(/startDate\s+DateTime\s+@db\.Date/);
    expect(schema).toMatch(/paidDate\s+DateTime\?\s+@db\.Date/);
    expect(schema).toMatch(/paymentDate\s+DateTime\s+@db\.Date/);
  });

  it('defines required uniqueness, index, and raw check constraints', () => {
    expect(schema).toContain('@@unique([installmentPlanId, installmentNumber])');
    expect(schema).toContain('idempotencyKey String?       @unique');

    for (const constraint of [
      'debts_originalAmount_positive_check',
      'installment_plans_totalAmount_positive_check',
      'installment_plans_installmentCount_positive_check',
      'installments_amountDue_positive_check',
      'installments_installmentNumber_positive_check',
      'payments_totalAmount_positive_check',
      'payment_allocations_amount_positive_check',
      'payment_allocations_target_xor_check',
    ]) {
      expect(migration).toContain(constraint);
    }
  });

  it('uses restrictive foreign keys for financial history', () => {
    const financialForeignKeys = migration
      .split('\n')
      .filter((line) => line.includes('ADD CONSTRAINT') && line.includes('_fkey'));

    expect(financialForeignKeys.length).toBeGreaterThan(0);
    for (const line of financialForeignKeys) {
      expect(line).toContain('ON DELETE RESTRICT');
    }
  });
});
