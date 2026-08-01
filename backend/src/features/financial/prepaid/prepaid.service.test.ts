import { DebtKind, DebtStatus, PrepaidPurchaseStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import {
  PrepaidNotDeliveredError,
  PrepaidNotPendingError,
  PrepaidRemainderHasPaymentsError,
} from '../domain/financial-errors';
import { PrepaidService } from './prepaid.service';
import { PrepaidPurchaseWithDetails } from './prepaid.repository';

const tx = { id: 'tx' };

const {
  correctionAuditMock,
  prepaidRepositoryMock,
  debtsRepositoryMock,
  verifyAdminPasswordMock,
} = vi.hoisted(() => ({
  correctionAuditMock: vi.fn(),
  prepaidRepositoryMock: {
    createForDebt: vi.fn(),
    findById: vi.fn(),
    findByDebtId: vi.fn(),
    list: vi.fn(),
    findAllForSummary: vi.fn(),
    markDelivered: vi.fn(),
    revertDelivery: vi.fn(),
    findDebtForRemainder: vi.fn(),
    buildWhere: vi.fn(() => ({})),
  },
  debtsRepositoryMock: {
    findUserIdentity: vi.fn(),
    createDebt: vi.fn(),
    cancelDebt: vi.fn(),
  },
  verifyAdminPasswordMock: vi.fn(),
}));

vi.mock('./prepaid.repository', () => ({
  PrepaidRepository: prepaidRepositoryMock,
}));

vi.mock('../debts/debts.repository', () => ({
  DebtsRepository: debtsRepositoryMock,
}));

vi.mock('../authorization/account-password', () => ({
  verifyAccountPassword: vi.fn(),
  verifyAdminPasswordForCorrection: verifyAdminPasswordMock,
}));

vi.mock('../corrections/correction-audit', () => ({
  writeFinancialCorrectionAudit: correctionAuditMock,
}));

vi.mock('../index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../index')>();
  return {
    ...actual,
    todayInBusinessTimezone: vi.fn(() => '2026-07-30'),
    runFinancialTransaction: vi.fn((operation: (client: unknown) => unknown) => operation(tx)),
  };
});

const adminUser = { userId: '11111111-1111-4111-8111-111111111111', role: 'ADMIN' };
const customer = { id: '22222222-2222-4222-8222-222222222222', name: 'Ahmad', phone: '70123456' };

function makeAllocation(amount: string, voided = false) {
  return {
    id: `alloc-${amount}-${voided}`,
    debtId: 'debt-1',
    installmentId: null,
    amount: new Decimal(amount),
    voidedAt: null,
    createdAt: new Date('2026-07-30T10:00:00.000Z'),
    payment: { id: 'pay-1', voidedAt: voided ? new Date() : null },
  };
}

interface MakePrepaidOptions {
  status?: PrepaidPurchaseStatus;
  fullAmount?: string;
  allocations?: ReturnType<typeof makeAllocation>[];
  debtCancelled?: boolean;
  remainderDebtId?: string | null;
}

function makePrepaid(overrides: MakePrepaidOptions = {}): PrepaidPurchaseWithDetails {
  const {
    status = PrepaidPurchaseStatus.PENDING,
    fullAmount = '400.00',
    allocations = [makeAllocation('200.00')],
    debtCancelled = false,
    remainderDebtId = null,
  } = overrides;

  return {
    id: '33333333-3333-4333-8333-333333333333',
    debtId: 'debt-1',
    status,
    deliveredAt: null,
    deliveredById: null,
    deliveryNotes: null,
    remainderDebtId,
    productId: null,
    createdAt: new Date('2026-07-30T10:00:00.000Z'),
    updatedAt: new Date('2026-07-30T10:00:00.000Z'),
    deliveredBy: null,
    debt: {
      id: 'debt-1',
      customerId: customer.id,
      customer,
      description: 'Air conditioner',
      kind: DebtKind.PREPAID_PURCHASE,
      originalAmount: new Decimal(fullAmount),
      dueDate: new Date(Date.UTC(2026, 6, 30)),
      status: debtCancelled ? DebtStatus.CANCELLED : DebtStatus.PARTIALLY_PAID,
      notes: null,
      createdById: adminUser.userId,
      createdAt: new Date('2026-07-30T10:00:00.000Z'),
      updatedAt: new Date('2026-07-30T10:00:00.000Z'),
      cancelledAt: debtCancelled ? new Date() : null,
      cancelledById: null,
      cancelReason: null,
      paymentAllocations: allocations,
    },
  } as unknown as PrepaidPurchaseWithDetails;
}

describe('PrepaidService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    debtsRepositoryMock.findUserIdentity.mockResolvedValue({
      id: adminUser.userId,
      fullName: 'Admin User',
      username: 'admin',
    });
    verifyAdminPasswordMock.mockResolvedValue(undefined);
  });

  describe('admin debt semantics', () => {
    it('reports the cash held, not the unpaid remainder', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(makePrepaid());

      const view = await PrepaidService.getPrepaidPurchase('33333333-3333-4333-8333-333333333333');

      expect(view.fullAmount).toBe('400.00');
      expect(view.amountPaid).toBe('200.00');
      expect(view.adminDebt).toBe('-200.00');
      expect(view.remainingToCollect).toBe('200.00');
      expect(view.isFullyPaid).toBe(false);
    });

    it('uses the paid amount when it differs from the remainder', async () => {
      // 400 item, 100 paid. The old formula produced -300.00; the business is
      // only holding 100, so the liability is -100.00.
      prepaidRepositoryMock.findById.mockResolvedValue(
        makePrepaid({ allocations: [makeAllocation('100.00')] })
      );

      const view = await PrepaidService.getPrepaidPurchase('33333333-3333-4333-8333-333333333333');

      expect(view.adminDebt).toBe('-100.00');
      expect(view.remainingToCollect).toBe('300.00');
    });

    it('ignores voided allocations', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(
        makePrepaid({ allocations: [makeAllocation('200.00'), makeAllocation('50.00', true)] })
      );

      const view = await PrepaidService.getPrepaidPurchase('33333333-3333-4333-8333-333333333333');

      expect(view.amountPaid).toBe('200.00');
      expect(view.adminDebt).toBe('-200.00');
    });

    it('drops to zero once delivered', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(
        makePrepaid({ status: PrepaidPurchaseStatus.DELIVERED })
      );

      const view = await PrepaidService.getPrepaidPurchase('33333333-3333-4333-8333-333333333333');

      expect(view.adminDebt).toBe('0.00');
    });

    it('drops to zero when the underlying debt is cancelled', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(makePrepaid({ debtCancelled: true }));

      const view = await PrepaidService.getPrepaidPurchase('33333333-3333-4333-8333-333333333333');

      expect(view.status).toBe(PrepaidPurchaseStatus.CANCELLED);
      expect(view.adminDebt).toBe('0.00');
    });

    it('returns every money value as a string', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(makePrepaid());

      const view = await PrepaidService.getPrepaidPurchase('33333333-3333-4333-8333-333333333333');

      for (const value of [view.fullAmount, view.amountPaid, view.adminDebt, view.remainingToCollect]) {
        expect(typeof value).toBe('string');
      }
    });
  });

  describe('summary', () => {
    it('counts only records awaiting delivery and does not derive totals from the page', async () => {
      const rows = [
        makePrepaid({ allocations: [makeAllocation('200.00')] }),
        makePrepaid({
          status: PrepaidPurchaseStatus.DELIVERED,
          allocations: [makeAllocation('400.00')],
        }),
        makePrepaid({ debtCancelled: true, allocations: [makeAllocation('50.00')] }),
      ];
      prepaidRepositoryMock.findAllForSummary.mockResolvedValue(rows);
      prepaidRepositoryMock.list.mockResolvedValue({ items: [rows[0]], total: 3 });

      const result = await PrepaidService.listPrepaidPurchases({
        status: 'ALL',
        fullyPaidOnly: false,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        page: 1,
        pageSize: 1,
      } as never);

      expect(result.summary.totalAdminDebt).toBe('-200.00');
      expect(result.summary.pendingCount).toBe(1);
      expect(result.summary.deliveredCount).toBe(1);
      expect(result.summary.cancelledCount).toBe(1);
      expect(result.summary.customerCount).toBe(1);
      expect(result.summary.basis).toBe('filtered');
      // One row on the page, but the summary covers all three.
      expect(result.items).toHaveLength(1);
      expect(result.pagination.total).toBe(3);
    });
  });

  describe('deliver', () => {
    it('creates a standard debt for the unpaid remainder', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(makePrepaid());
      debtsRepositoryMock.createDebt.mockResolvedValue({ id: 'remainder-debt-1' });
      prepaidRepositoryMock.markDelivered.mockResolvedValue(
        makePrepaid({
          status: PrepaidPurchaseStatus.DELIVERED,
          remainderDebtId: 'remainder-debt-1',
        })
      );

      const view = await PrepaidService.deliver(
        '33333333-3333-4333-8333-333333333333',
        { remainderDueDate: '2026-08-30', deliveryNotes: 'Handed over in store' },
        adminUser
      );

      expect(debtsRepositoryMock.createDebt).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: customer.id,
          kind: DebtKind.STANDARD,
          originalAmount: expect.any(Decimal),
        }),
        tx
      );
      expect(debtsRepositoryMock.createDebt.mock.calls[0][0].originalAmount.toFixed(2)).toBe('200.00');
      expect(prepaidRepositoryMock.markDelivered).toHaveBeenCalledWith(
        tx,
        '33333333-3333-4333-8333-333333333333',
        expect.objectContaining({ remainderDebtId: 'remainder-debt-1' })
      );
      expect(view.status).toBe(PrepaidPurchaseStatus.DELIVERED);
      expect(view.adminDebt).toBe('0.00');
    });

    it('creates no remainder debt when the item is fully paid', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(
        makePrepaid({ allocations: [makeAllocation('400.00')] })
      );
      prepaidRepositoryMock.markDelivered.mockResolvedValue(
        makePrepaid({
          status: PrepaidPurchaseStatus.DELIVERED,
          allocations: [makeAllocation('400.00')],
        })
      );

      await PrepaidService.deliver('33333333-3333-4333-8333-333333333333', {}, adminUser);

      expect(debtsRepositoryMock.createDebt).not.toHaveBeenCalled();
      expect(prepaidRepositoryMock.markDelivered).toHaveBeenCalledWith(
        tx,
        expect.any(String),
        expect.objectContaining({ remainderDebtId: null })
      );
    });

    it('requires a due date when money is still outstanding', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(makePrepaid());

      await expect(
        PrepaidService.deliver('33333333-3333-4333-8333-333333333333', {}, adminUser)
      ).rejects.toBeInstanceOf(ValidationError);
      expect(debtsRepositoryMock.createDebt).not.toHaveBeenCalled();
    });

    it('rejects delivering twice', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(
        makePrepaid({ status: PrepaidPurchaseStatus.DELIVERED })
      );

      await expect(
        PrepaidService.deliver(
          '33333333-3333-4333-8333-333333333333',
          { remainderDueDate: '2026-08-30' },
          adminUser
        )
      ).rejects.toBeInstanceOf(PrepaidNotPendingError);
    });

    it('rejects delivering a cancelled prepaid', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(makePrepaid({ debtCancelled: true }));

      await expect(
        PrepaidService.deliver(
          '33333333-3333-4333-8333-333333333333',
          { remainderDueDate: '2026-08-30' },
          adminUser
        )
      ).rejects.toBeInstanceOf(PrepaidNotPendingError);
    });

    it('throws when the prepaid does not exist', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(null);

      await expect(
        PrepaidService.deliver('33333333-3333-4333-8333-333333333333', {}, adminUser)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('writes an audit recording the liability change and no password', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(makePrepaid());
      debtsRepositoryMock.createDebt.mockResolvedValue({ id: 'remainder-debt-1' });
      prepaidRepositoryMock.markDelivered.mockResolvedValue(
        makePrepaid({ status: PrepaidPurchaseStatus.DELIVERED })
      );

      await PrepaidService.deliver(
        '33333333-3333-4333-8333-333333333333',
        { remainderDueDate: '2026-08-30' },
        adminUser
      );

      const auditArg = correctionAuditMock.mock.calls[0][0];
      expect(auditArg).toMatchObject({
        action: 'DELIVER_PREPAID',
        sourceScreen: 'PREPAID',
        customerId: customer.id,
      });
      expect(auditArg.affectedTotals).toMatchObject({
        adminDebtBefore: '-200.00',
        adminDebtAfter: '0.00',
      });
      expect(JSON.stringify(auditArg)).not.toContain('accountPassword');
    });
  });

  describe('revertDelivery', () => {
    const revertInput = { reason: 'Delivered the wrong unit', accountPassword: 'secret' };

    it('cancels the remainder debt rather than deleting it', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(
        makePrepaid({
          status: PrepaidPurchaseStatus.DELIVERED,
          remainderDebtId: 'remainder-debt-1',
        })
      );
      prepaidRepositoryMock.findDebtForRemainder.mockResolvedValue({
        id: 'remainder-debt-1',
        status: DebtStatus.UNPAID,
        paymentAllocations: [],
      });
      prepaidRepositoryMock.revertDelivery.mockResolvedValue(makePrepaid());

      const view = await PrepaidService.revertDelivery(
        '33333333-3333-4333-8333-333333333333',
        revertInput,
        adminUser
      );

      expect(verifyAdminPasswordMock).toHaveBeenCalled();
      expect(debtsRepositoryMock.cancelDebt).toHaveBeenCalledWith(
        tx,
        'remainder-debt-1',
        expect.objectContaining({ cancelledById: adminUser.userId })
      );
      expect(view.status).toBe(PrepaidPurchaseStatus.PENDING);
      expect(view.adminDebt).toBe('-200.00');
    });

    it('refuses when the remainder debt already has payments', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(
        makePrepaid({
          status: PrepaidPurchaseStatus.DELIVERED,
          remainderDebtId: 'remainder-debt-1',
        })
      );
      prepaidRepositoryMock.findDebtForRemainder.mockResolvedValue({
        id: 'remainder-debt-1',
        status: DebtStatus.PARTIALLY_PAID,
        paymentAllocations: [makeAllocation('50.00')],
      });

      await expect(
        PrepaidService.revertDelivery('33333333-3333-4333-8333-333333333333', revertInput, adminUser)
      ).rejects.toBeInstanceOf(PrepaidRemainderHasPaymentsError);
      expect(debtsRepositoryMock.cancelDebt).not.toHaveBeenCalled();
    });

    it('rejects reverting a record that was never delivered', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(makePrepaid());

      await expect(
        PrepaidService.revertDelivery('33333333-3333-4333-8333-333333333333', revertInput, adminUser)
      ).rejects.toBeInstanceOf(PrepaidNotDeliveredError);
    });

    it('writes an audit with the reason and no password', async () => {
      prepaidRepositoryMock.findById.mockResolvedValue(
        makePrepaid({ status: PrepaidPurchaseStatus.DELIVERED })
      );
      prepaidRepositoryMock.revertDelivery.mockResolvedValue(makePrepaid());

      await PrepaidService.revertDelivery(
        '33333333-3333-4333-8333-333333333333',
        revertInput,
        adminUser
      );

      const auditArg = correctionAuditMock.mock.calls[0][0];
      expect(auditArg).toMatchObject({
        action: 'REVERT_PREPAID_DELIVERY',
        reason: revertInput.reason,
        sourceScreen: 'PREPAID',
      });
      expect(JSON.stringify(auditArg)).not.toContain('secret');
    });
  });

  it('accepts Arabic item names end to end', async () => {
    const arabic = makePrepaid();
    (arabic.debt as { description: string }).description = 'مكيف هواء';
    prepaidRepositoryMock.findById.mockResolvedValue(arabic);

    const view = await PrepaidService.getPrepaidPurchase('33333333-3333-4333-8333-333333333333');

    expect(view.itemName).toBe('مكيف هواء');
  });
});
