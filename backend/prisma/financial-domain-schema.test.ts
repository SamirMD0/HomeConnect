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
const legacyRemovalMigration = readFileSync(
  path.resolve(
    'backend/prisma/migrations/20260830183000_remove_legacy_transactions/migration.sql'
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

  it('retires the legacy Transaction model only in its dedicated migration', () => {
    expect(schema).not.toContain('model Transaction');
    expect(schema).not.toContain('enum TransactionType');
    expect(migration).not.toMatch(/ALTER TYPE "TransactionType"/);
    expect(migration).not.toMatch(/DROP TYPE "TransactionType"/);
    expect(migration).not.toMatch(/ALTER TABLE "transactions"/);
    expect(legacyRemovalMigration).toContain('DROP TABLE "transactions"');
    expect(legacyRemovalMigration).toContain('DROP TYPE "TransactionType"');
  });

  it('uses Decimal money fields and PostgreSQL DATE business dates', () => {
    for (const field of ['originalAmount', 'totalAmount', 'amountDue', 'amount']) {
      expect(schema).toMatch(new RegExp(`${field}\\s+Decimal\\s+@db\\.Decimal\\(12, 2\\)`));
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
