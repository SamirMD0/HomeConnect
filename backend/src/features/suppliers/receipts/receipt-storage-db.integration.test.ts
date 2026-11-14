import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../../../lib/prisma';
import { isIsolatedTestDatabase } from '../../../test/database';
import { billImage, deleteBill, storeReceipt } from './receipts.service';

const enabled =
  process.env.RUN_FINANCIAL_DB_TESTS === '1' && isIsolatedTestDatabase(process.env.DATABASE_URL);
(enabled ? describe : describe.skip)('hosted receipt persistence', () => {
  const userId = randomUUID(),
    branchId = randomUUID(),
    supplierId = randomUUID();
  const scope = { mode: 'single' as const, branchIds: [branchId] };
  beforeAll(async () => {
    vi.stubEnv('HOSTED_MODE', 'true');
    await prisma.user.create({
      data: {
        id: userId,
        username: `bill-test-${userId}`,
        password: 'synthetic-unused',
        fullName: 'Bill test',
        role: 'ADMIN',
      },
    });
    await prisma.branch.create({
      data: {
        id: branchId,
        code: `bill-${branchId}`,
        name: `Bill test ${branchId}`,
        createdById: userId,
      },
    });
    await prisma.supplier.create({
      data: {
        id: supplierId,
        branchId,
        name: 'Bill test supplier',
        phone: '000',
        createdById: userId,
      },
    });
  });
  afterAll(async () => {
    await prisma.supplierReceivingReceipt.deleteMany({ where: { supplierId } });
    await prisma.supplier.deleteMany({ where: { id: supplierId } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    vi.unstubAllEnvs();
    await prisma.$disconnect();
  });
  it('keeps bytes in the database, survives a storage-mode change, and deduplicates a retry', async () => {
    const input = {
      supplierId,
      capturedById: userId,
      mime: 'image/jpeg',
      bytes: Buffer.from([255, 216, 1, 0]),
      receiptId: randomUUID(),
    };
    const row = await storeReceipt(input, scope);
    expect(
      await prisma.supplierReceiptBlob.findUnique({ where: { receiptId: row.id } })
    ).toMatchObject({ data: input.bytes });
    vi.stubEnv('HOSTED_MODE', 'false');
    expect((await billImage(row.id, scope)).bytes).toEqual(input.bytes);
    expect((await storeReceipt(input, scope)).id).toBe(row.id);
    expect(await prisma.supplierReceivingReceipt.count({ where: { id: row.id } })).toBe(1);
    // Deletes are soft: the row records who deleted it and the bytes stay.
    await deleteBill(row.id, { wholeBill: true }, { userId, role: 'ADMIN' }, scope);
    expect(
      await prisma.supplierReceivingReceipt.findUnique({ where: { id: row.id } })
    ).toMatchObject({ deletedById: userId });
    expect(
      await prisma.supplierReceiptBlob.findUnique({ where: { receiptId: row.id } })
    ).not.toBeNull();
  });
  it('rolls back the receipt row when its blob cannot be written', async () => {
    vi.stubEnv('HOSTED_MODE', 'true');
    const receiptId = randomUUID();
    // A temporary trigger simulates a DB write failure inside the transaction.
    const trigger = `bill_test_${randomUUID().replaceAll('-', '')}`;
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION "${trigger}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic blob failure'; END; $$`
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER "${trigger}" BEFORE INSERT ON supplier_receipt_blobs FOR EACH ROW EXECUTE FUNCTION "${trigger}"()`
    );
    try {
      await expect(
        storeReceipt(
          {
            supplierId,
            capturedById: userId,
            mime: 'image/jpeg',
            bytes: Buffer.from('photo'),
            receiptId,
          },
          scope
        )
      ).rejects.toThrow();
      expect(
        await prisma.supplierReceivingReceipt.findUnique({ where: { id: receiptId } })
      ).toBeNull();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER "${trigger}" ON supplier_receipt_blobs`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION "${trigger}"()`);
    }
  });
});
