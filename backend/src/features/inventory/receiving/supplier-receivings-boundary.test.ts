import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceDirectory = path.join(process.cwd(), 'backend', 'src', 'features', 'inventory', 'receiving');
const serviceSource = readFileSync(path.join(sourceDirectory, 'supplier-receivings.service.ts'), 'utf8');
const routesSource = readFileSync(path.join(sourceDirectory, 'supplier-receivings.routes.ts'), 'utf8');

describe('supplier receiving business boundaries', () => {
  it('keeps creation inside the serializable financial transaction boundary', () => {
    expect(serviceSource).toContain('runFinancialTransaction(async (tx)');
    expect(serviceSource).toContain('compareAndSetQuantity');
  });

  it('does not create or change supplier/customer financial records', () => {
    expect(serviceSource).not.toMatch(/supplierTransaction|customerLedger|customerPayment|paymentRepository|debtRepository/i);
  });

  it('keeps receiving documents immutable', () => {
    expect(routesSource).not.toMatch(/\.patch\(|\.put\(|\.delete\(/);
    expect(serviceSource).not.toMatch(/static async (update|delete|reverse)\b/);
  });
});
