import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertSqlIsSafe } from '../../maintenance/sql-safety-scanner';
import { createCustomerSchema, updateCustomerSchema } from '../../../validators/customers.validator';
import { createDebtSchema } from '../debts/debts.validator';

describe('additive credit-limit migration and input contract', () => {
  it('adds a nullable non-negative base USD limit without any historical DML', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../../../..', 'prisma/migrations/20260914160000_add_customer_credit_limits/migration.sql'), 'utf8');
    expect(() => assertSqlIsSafe(sql, 'credit-limit migration')).not.toThrow();
    expect(sql).not.toMatch(/\b(?:UPDATE|INSERT|DELETE|DROP|TRUNCATE)\b/i);
    expect(sql).not.toMatch(/\b(?:NOT NULL|DEFAULT)\b/i);
    expect(sql).toContain('DECIMAL(12,2)'); expect(sql).toContain('>= 0');
  });
  it('preserves absent limits, supports clearing/zero, and rejects invalid money', () => {
    expect(createCustomerSchema.parse({ name: 'Ali', phone: '03000000' })).not.toHaveProperty('creditLimit');
    for (const creditLimit of [null, '0.00', '100.00']) expect(updateCustomerSchema.parse({ creditLimit }).creditLimit).toBe(creditLimit);
    for (const creditLimit of ['-1', '1.001', '10000000000']) expect(updateCustomerSchema.safeParse({ creditLimit }).success).toBe(false);
  });
  it('retains explicit override acknowledgment and enforces reason validation', () => {
    const input = { amount: '100.00', description: 'Appliance', dueDate: '2026-09-14', overrideCreditLimit: true, creditLimitOverrideReason: 'Approved exception', accountPassword: 'secret' };
    expect(createDebtSchema.parse(input)).toMatchObject(input);
    expect(createDebtSchema.safeParse({ ...input, creditLimitOverrideReason: 'x' }).success).toBe(false);
  });
});
