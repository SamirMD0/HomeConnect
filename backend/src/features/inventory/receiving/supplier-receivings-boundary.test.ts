import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceDirectory = path.join(process.cwd(), 'backend', 'src', 'features', 'inventory', 'receiving');
const serviceSource = readFileSync(path.join(sourceDirectory, 'supplier-receivings.service.ts'), 'utf8');
const routesSource = readFileSync(path.join(sourceDirectory, 'supplier-receivings.routes.ts'), 'utf8');
const repositorySource = readFileSync(path.join(sourceDirectory, 'supplier-receivings.repository.ts'), 'utf8');

describe('supplier receiving business boundaries', () => {
  it('keeps creation inside the serializable financial transaction boundary', () => {
    expect(serviceSource).toContain('runFinancialTransaction(async (tx)');
    expect(serviceSource).toContain('compareAndSetQuantity');
  });

  it('does not create or change supplier/customer financial records', () => {
    // SupplierTransactionStatus is read to refuse a void while money is still
    // posted. Reading the ledger is allowed; writing to it is not.
    expect(serviceSource).not.toMatch(/supplierTransaction\.(create|update|delete)|customerLedger|customerPayment|paymentRepository|debtRepository/i);
    expect(repositorySource).not.toMatch(/supplierTransaction\.(create|update|delete)|payment|debt/i);
  });

  /**
   * A posted document may be corrected, but never erased. Corrections are
   * compensating movements and status flips — there is no delete route, no
   * delete query, and no rewrite of a movement that already happened.
   */
  it('offers correction without any hard delete of posted history', () => {
    expect(routesSource).not.toMatch(/\.delete\(/);
    expect(routesSource).toContain("patch('/:receivingId/metadata'");
    expect(routesSource).toContain("post('/:receivingId/void'");
    expect(serviceSource).not.toMatch(/\.delete\(|deleteMany|\.destroy\(/);
    expect(repositorySource).not.toMatch(/\.delete\(|deleteMany/);
  });

  it('reverses stock with a compensating movement instead of editing the original', () => {
    expect(serviceSource).toContain('StockMovementType.PURCHASE_RECEIPT_REVERSAL');
    expect(serviceSource).toContain('quantityChange: -item.quantity');
    expect(serviceSource).toContain('REVERSAL_WOULD_GO_NEGATIVE');
    // The original movement is referenced for the audit trail and never updated.
    expect(serviceSource).not.toMatch(/stockMovement\.update|updateMovement/);
  });

  it('guards both correction paths behind an admin role and a typed reason', () => {
    expect(routesSource).toContain('const adminOnly = requireRole([Role.ADMIN])');
    expect(routesSource).toMatch(/patch\('\/:receivingId\/metadata', adminOnly/);
    expect(routesSource).toMatch(/post\('\/:receivingId\/void', adminOnly/);
    expect(serviceSource).toContain("assertAdmin(user, 'correct receiving documents')");
    expect(serviceSource).toContain("assertAdmin(user, 'void receiving documents')");
    expect(serviceSource).toContain("action: 'VOID_SUPPLIER_RECEIVING'");
  });

  it('never lets a metadata correction reach a quantity, product, or date', () => {
    const updateMetadata = serviceSource.slice(
      serviceSource.indexOf('static async updateMetadata'),
      serviceSource.indexOf('static async void')
    );
    expect(updateMetadata).not.toMatch(/quantity|productId|receivedOn|supplierId|createMovement/);
  });
});
