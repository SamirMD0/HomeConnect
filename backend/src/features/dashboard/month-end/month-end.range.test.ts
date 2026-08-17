import { SupplierTransactionDirection, SupplierTransactionType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { monthlyDebtsMock, repositoryMock } = vi.hoisted(() => ({
  monthlyDebtsMock: {
    getDebtReportForRange: vi.fn(),
    getFinancialActivityForRange: vi.fn(),
  },
  repositoryMock: { loadOperationalRecords: vi.fn() },
}));

vi.mock('../../reports/monthly-debts/monthly-debts.service', () => ({
  MonthlyDebtsService: monthlyDebtsMock,
}));
vi.mock('./month-end.repository', () => ({ MonthEndRepository: repositoryMock }));

import { MonthEndService } from './month-end.service';

describe('MonthEndService explicit ranges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    monthlyDebtsMock.getDebtReportForRange
      .mockResolvedValueOnce({ summary: { totalOutstanding: '80.00' }, rows: [] })
      .mockResolvedValueOnce({
        summary: { totalOutstanding: '100.00' },
        rows: [{ totalOutstanding: '100.00', overdueAmountAtCutoff: '0.00' }],
      });
    monthlyDebtsMock.getFinancialActivityForRange.mockResolvedValue({
      summary: {
        newSingleDebtAmount: '30.00',
        newInstallmentPlanAmount: '0.00',
        paymentsReceived: '10.00',
      },
    });
    repositoryMock.loadOperationalRecords.mockResolvedValue({
      supplierTransactions: [
        transaction('opening', '40.00', '2026-07-31'),
        transaction('inside', '20.00', '2026-08-05'),
        transaction('after', '50.00', '2026-08-20'),
      ],
      serviceJobs: [],
    });
  });

  it('uses from minus one day as opening and reconciles through the exact cutoff', async () => {
    const result = await MonthEndService.get({ from: '2026-08-05', to: '2026-08-10' });

    expect(monthlyDebtsMock.getDebtReportForRange).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ includeZero: false }),
      '2026-08-04',
      '2026-08-04'
    );
    expect(result.meta).toEqual({ from: '2026-08-05', to: '2026-08-10' });
    expect(result.customers).toMatchObject({
      opening: '80.00', newAmount: '30.00', collected: '10.00', adjustments: '0.00',
      closing: '100.00', reconciled: true,
    });
    expect(new Decimal(result.customers.opening)
      .plus(result.customers.newAmount)
      .minus(result.customers.collected)
      .plus(result.customers.adjustments)
      .toFixed(2)).toBe(result.customers.closing);
    expect(result.suppliers).toMatchObject({ opening: '40.00', newAmount: '20.00', closing: '60.00' });
  });

  it.each([
    ['month crossing', '2026-07-28', '2026-08-03', '2026-07-27'],
    ['single day', '2026-08-17', '2026-08-17', '2026-08-16'],
  ])('keeps meta.to and opening cutoff correct for a %s range', async (_label, from, to, openingCutoff) => {
    const result = await MonthEndService.get({ from, to });

    expect(result.meta.to).toBe(to);
    expect(monthlyDebtsMock.getDebtReportForRange).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      openingCutoff,
      openingCutoff
    );
    expect(monthlyDebtsMock.getFinancialActivityForRange).toHaveBeenCalledWith(
      expect.any(Object),
      from,
      to
    );
  });
});

function transaction(id: string, amount: string, transactionDate: string) {
  return {
    id,
    supplierId: 'supplier-1',
    supplier: { isActive: true },
    type: SupplierTransactionType.SUPPLIER_DEBT,
    direction: SupplierTransactionDirection.INCREASE_OWED,
    amount: new Decimal(amount),
    transactionDate: new Date(`${transactionDate}T00:00:00.000Z`),
  };
}
