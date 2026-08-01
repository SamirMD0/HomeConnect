import {
  SupplierTransactionDirection,
  SupplierTransactionStatus,
  SupplierTransactionType,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tx = { id: 'tx', user: { findUnique: vi.fn() } };

const { repository, suppliersRepository, auditMock, verifyAdminPasswordMock } = vi.hoisted(() => ({
  repository: {
    summaryRows: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    supplierCount: vi.fn(),
  },
  suppliersRepository: { findById: vi.fn() },
  auditMock: vi.fn(),
  verifyAdminPasswordMock: vi.fn(),
}));

vi.mock('./supplier-transactions.repository', () => ({
  SupplierTransactionsRepository: repository,
  supplierTransactionWhere: vi.fn((query: Record<string, unknown>) => ({
    ...(query.supplierId ? { supplierId: query.supplierId } : {}),
    ...(!query.includeRemoved ? { status: SupplierTransactionStatus.ACTIVE } : {}),
  })),
}));
vi.mock('../suppliers/suppliers.repository', () => ({ SuppliersRepository: suppliersRepository }));
vi.mock('../audit/supplier-audit', () => ({ writeSupplierAudit: auditMock }));
vi.mock('../../../lib/admin-verification', () => ({ verifyAdminPassword: verifyAdminPasswordMock }));
vi.mock('../../financial/infrastructure/transaction', () => ({
  runFinancialTransaction: vi.fn((operation: (client: unknown) => unknown) => operation(tx)),
}));

import { summaryForWhere, SupplierTransactionsService } from './supplier-transactions.service';
import { supplierTransactionWhere } from './supplier-transactions.repository';

const admin = { userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' };
const context = { requestId: null, ipAddress: null };
const supplierId = '22222222-2222-4222-8222-222222222222';
const transactionId = '33333333-3333-4333-8333-333333333333';

function makeTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: transactionId,
    supplierId,
    type: SupplierTransactionType.SUPPLIER_DEBT,
    direction: SupplierTransactionDirection.INCREASE_OWED,
    amount: new Decimal('500.00'),
    transactionDate: new Date(Date.UTC(2026, 6, 30)),
    description: 'Air conditioners received',
    reference: null,
    notes: null,
    status: SupplierTransactionStatus.ACTIVE,
    removedAt: null,
    removedById: null,
    removedReason: null,
    createdAt: new Date('2026-07-30T10:00:00.000Z'),
    updatedAt: new Date('2026-07-30T10:00:00.000Z'),
    ...overrides,
  };
}

const debtRow = {
  type: SupplierTransactionType.SUPPLIER_DEBT,
  direction: SupplierTransactionDirection.INCREASE_OWED,
  _sum: { amount: '500.00' },
  _count: { _all: 1 },
};

describe('supplier transaction summary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('derives all totals from every matching row, independent of pagination', async () => {
    repository.summaryRows.mockResolvedValue([
      { type: SupplierTransactionType.SUPPLIER_DEBT, direction: SupplierTransactionDirection.INCREASE_OWED, _sum: { amount: '500.00' }, _count: { _all: 2 } },
      { type: SupplierTransactionType.SUPPLIER_PAYMENT, direction: SupplierTransactionDirection.DECREASE_OWED, _sum: { amount: '125.25' }, _count: { _all: 3 } },
      { type: SupplierTransactionType.SUPPLIER_CREDIT, direction: SupplierTransactionDirection.DECREASE_OWED, _sum: { amount: '25.00' }, _count: { _all: 1 } },
      { type: SupplierTransactionType.SUPPLIER_ADJUSTMENT, direction: SupplierTransactionDirection.INCREASE_OWED, _sum: { amount: '10.00' }, _count: { _all: 1 } },
    ]);

    await expect(summaryForWhere({ status: 'ACTIVE' })).resolves.toEqual({
      totalOwed: '510.00',
      totalPaid: '125.25',
      totalCredit: '25.00',
      balance: '359.75',
      transactionCount: 7,
    });
  });
});

describe('SupplierTransactionsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.user.findUnique.mockResolvedValue({ fullName: 'Admin User', username: 'admin' });
    verifyAdminPasswordMock.mockResolvedValue(undefined);
    repository.summaryRows.mockResolvedValue([debtRow]);
  });

  const createInput = {
    type: SupplierTransactionType.SUPPLIER_DEBT,
    amount: '500.00',
    transactionDate: '2026-07-30',
    description: 'Air conditioners received',
    reference: null,
    notes: null,
  } as never;

  it('rejects a transaction for an archived supplier', async () => {
    suppliersRepository.findById.mockResolvedValue({ id: supplierId, isActive: false });

    await expect(
      SupplierTransactionsService.create(supplierId, createInput, admin, context)
    ).rejects.toMatchObject({ statusCode: 409, code: 'SUPPLIER_ARCHIVED' });

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('excludes removed transactions from the active balance', async () => {
    const activeOnly = supplierTransactionWhere({ supplierId, includeRemoved: false });
    const withRemoved = supplierTransactionWhere({ supplierId, includeRemoved: true });

    expect(activeOnly).toMatchObject({ status: SupplierTransactionStatus.ACTIVE });
    expect(withRemoved).not.toHaveProperty('status');
  });

  it('still lists removed transactions when includeRemoved is set', async () => {
    const removed = makeTransaction({ status: SupplierTransactionStatus.REMOVED, removedReason: 'Duplicate entry' });
    repository.list.mockResolvedValue({ items: [removed], total: 1, where: {} });
    repository.supplierCount.mockResolvedValue(1);

    const result = await SupplierTransactionsService.ledger({
      includeRemoved: true, page: 1, pageSize: 25, sortBy: 'transactionDate', sortOrder: 'desc',
    } as never);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ status: SupplierTransactionStatus.REMOVED });
    expect(result.summary.basis).toBe('filtered');
  });

  it('rejects an edit that does not carry the account password', async () => {
    repository.findById.mockResolvedValue(makeTransaction());
    verifyAdminPasswordMock.mockRejectedValue(
      Object.assign(new Error('Account password is required'), { statusCode: 401 })
    );

    await expect(
      SupplierTransactionsService.update(
        transactionId,
        { amount: '600.00', reason: 'Invoice re-checked', accountPassword: '' } as never,
        admin,
        context
      )
    ).rejects.toThrow();

    expect(repository.update).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it('writes an audit with balanceBefore and balanceAfter when an edit succeeds', async () => {
    const existing = makeTransaction();
    repository.findById.mockResolvedValue(existing);
    repository.update.mockResolvedValue(makeTransaction({ amount: new Decimal('600.00') }));
    repository.summaryRows
      .mockResolvedValueOnce([debtRow])
      .mockResolvedValueOnce([{ ...debtRow, _sum: { amount: '600.00' } }]);

    await SupplierTransactionsService.update(
      transactionId,
      { amount: '600.00', reason: 'Invoice re-checked', accountPassword: 'secret' } as never,
      admin,
      context
    );

    expect(verifyAdminPasswordMock).toHaveBeenCalled();
    const audit = auditMock.mock.calls[0][0];
    expect(audit).toMatchObject({ action: 'UPDATE', reason: 'Invoice re-checked' });
    expect(audit.affectedTotals).toEqual({ balanceBefore: '500.00', balanceAfter: '600.00' });
    expect(JSON.stringify(audit)).not.toContain('secret');
  });

  it('soft removes a transaction, persisting the reason', async () => {
    repository.findById.mockResolvedValue(makeTransaction());
    repository.update.mockResolvedValue(
      makeTransaction({ status: SupplierTransactionStatus.REMOVED, removedReason: 'Entered twice by mistake' })
    );

    const result = await SupplierTransactionsService.remove(
      transactionId,
      { reason: 'Entered twice by mistake', accountPassword: 'secret' },
      admin,
      context
    );

    expect(repository.update).toHaveBeenCalledWith(
      transactionId,
      expect.objectContaining({
        status: SupplierTransactionStatus.REMOVED,
        removedReason: 'Entered twice by mistake',
        removedById: admin.userId,
      }),
      tx
    );
    expect(result.status).toBe(SupplierTransactionStatus.REMOVED);
    expect(auditMock).toHaveBeenCalled();
  });

  it('refuses to remove a transaction twice', async () => {
    repository.findById.mockResolvedValue(makeTransaction({ status: SupplierTransactionStatus.REMOVED }));

    await expect(
      SupplierTransactionsService.remove(
        transactionId,
        { reason: 'Entered twice by mistake', accountPassword: 'secret' },
        admin,
        context
      )
    ).rejects.toMatchObject({ statusCode: 409, code: 'SUPPLIER_TRANSACTION_STATE_CONFLICT' });
  });
});
