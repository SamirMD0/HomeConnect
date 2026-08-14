import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = { id: 'tx', user: { findUnique: vi.fn() } };

const { repository, auditMock, verifyAdminPasswordMock } = vi.hoisted(() => ({
  repository: {
    findById: vi.fn(),
    receivingCount: vi.fn(),
    transactionCount: vi.fn(),
    deleteAudits: vi.fn(),
    delete: vi.fn(),
    balances: vi.fn(),
  },
  auditMock: vi.fn(),
  verifyAdminPasswordMock: vi.fn(),
}));

vi.mock('./suppliers.repository', () => ({ SuppliersRepository: repository }));
vi.mock('../audit/supplier-audit', () => ({ writeSupplierAudit: auditMock }));
vi.mock('../audit/supplier-audit.repository', () => ({ SupplierAuditRepository: { list: vi.fn() } }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verifyAdminPasswordMock }));
vi.mock('../../financial/infrastructure/transaction', () => ({
  runFinancialTransaction: vi.fn((operation: (client: unknown) => unknown) => operation(tx)),
}));

import { SuppliersService } from './suppliers.service';

const admin = { userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' };
const context = { requestId: null, ipAddress: null };
const supplierId = '22222222-2222-4222-8222-222222222222';

const supplier = {
  id: supplierId,
  name: 'Al-Nour Trading',
  phone: '70123456',
  companyName: null,
  secondaryPhone: null,
  email: null,
  notes: null,
  isActive: true,
  archivedAt: null,
  archivedReason: null,
};

const deleteInput = { reason: 'Created by mistake', accountPassword: 'secret' };

describe('SuppliersService.delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.user.findUnique.mockResolvedValue({ fullName: 'Admin User', username: 'admin' });
    verifyAdminPasswordMock.mockResolvedValue(undefined);
    repository.findById.mockResolvedValue(supplier);
    repository.receivingCount.mockResolvedValue(0);
    repository.transactionCount.mockResolvedValue(0);
  });

  it('refuses to hard delete a supplier that has stock receivings', async () => {
    repository.receivingCount.mockResolvedValue(1);

    await expect(SuppliersService.delete(supplierId, deleteInput, admin, context)).rejects.toMatchObject({
      statusCode: 409,
      code: 'SUPPLIER_HAS_RECEIVINGS',
    });

    expect(repository.transactionCount).not.toHaveBeenCalled();
    expect(repository.delete).not.toHaveBeenCalled();
    expect(repository.deleteAudits).not.toHaveBeenCalled();
  });

  it('refuses to hard delete a supplier that has transactions', async () => {
    repository.transactionCount.mockResolvedValue(3);

    await expect(SuppliersService.delete(supplierId, deleteInput, admin, context)).rejects.toMatchObject({
      statusCode: 409,
      code: 'SUPPLIER_HAS_TRANSACTIONS',
    });

    expect(repository.delete).not.toHaveBeenCalled();
    expect(repository.deleteAudits).not.toHaveBeenCalled();
  });

  it('hard deletes a supplier with no transactions and keeps a DELETE audit', async () => {
    repository.transactionCount.mockResolvedValue(0);

    await expect(SuppliersService.delete(supplierId, deleteInput, admin, context)).resolves.toEqual({
      id: supplierId,
      deleted: true,
    });

    expect(verifyAdminPasswordMock).toHaveBeenCalled();
    // Audit rows are cleared first: the FK to suppliers is onDelete: Restrict.
    expect(repository.deleteAudits).toHaveBeenCalledWith(supplierId, tx);
    expect(repository.delete).toHaveBeenCalledWith(supplierId, tx);

    const audit = auditMock.mock.calls[0][0];
    expect(audit).toMatchObject({ action: 'DELETE', reason: deleteInput.reason });
    expect(audit.beforeValues).toMatchObject({ name: supplier.name });
    expect(JSON.stringify(audit)).not.toContain('secret');
  });

  it('requires the account password before deleting', async () => {
    repository.transactionCount.mockResolvedValue(0);
    verifyAdminPasswordMock.mockRejectedValue(new Error('Account password is required'));

    await expect(SuppliersService.delete(supplierId, deleteInput, admin, context)).rejects.toThrow();

    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('rejects a non-admin actor', async () => {
    repository.transactionCount.mockResolvedValue(0);

    await expect(
      SuppliersService.delete(supplierId, deleteInput, { ...admin, role: 'EMPLOYEE' }, context)
    ).rejects.toThrow();

    expect(repository.delete).not.toHaveBeenCalled();
  });
});
