import { beforeEach, describe, expect, it, vi } from 'vitest';

const { monthlyDebtsMock, repositoryMock } = vi.hoisted(() => ({
  monthlyDebtsMock: {
    getMonthlyDebtReport: vi.fn(),
    getMonthlyFinancialActivity: vi.fn(),
  },
  repositoryMock: { loadOperationalRecords: vi.fn() },
}));

vi.mock('../../reports/monthly-debts/monthly-debts.service', () => ({
  MonthlyDebtsService: monthlyDebtsMock,
}));
vi.mock('./month-end.repository', () => ({ MonthEndRepository: repositoryMock }));

import { MonthEndService } from './month-end.service';

describe('MonthEndService full-month characterization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    monthlyDebtsMock.getMonthlyDebtReport
      .mockResolvedValueOnce({ summary: { totalOutstanding: '100.00' }, rows: [] })
      .mockResolvedValueOnce({
        summary: { totalOutstanding: '120.00' },
        rows: [{ totalOutstanding: '120.00', overdueAmountAtCutoff: '0.00' }],
      });
    monthlyDebtsMock.getMonthlyFinancialActivity.mockResolvedValue({
      summary: {
        newSingleDebtAmount: '50.00',
        newInstallmentPlanAmount: '0.00',
        paymentsReceived: '30.00',
      },
    });
    repositoryMock.loadOperationalRecords.mockResolvedValue({
      supplierTransactions: [],
      serviceJobs: [],
    });
  });

  it('captures the byte-stable dashboard month-end service payload', async () => {
    const result = await MonthEndService.get('2026-07');

    expect(JSON.stringify(result)).toBe(JSON.stringify({
      month: '2026-07',
      disclosure: {
        en: 'Computed from current records. Retroactive corrections restate closed months.',
        ar: 'محسوبة من السجلات الحالية. التصحيحات بأثر رجعي تعيد بيان الأشهر المغلقة.',
      },
      customers: {
        opening: '100.00', newAmount: '50.00', collected: '30.00', adjustments: '0.00',
        closing: '120.00', reconciled: true, withDebt: 1, fullyPaid: 0, overdue: 0,
      },
      suppliers: {
        opening: '0.00', newAmount: '0.00', collected: '0.00', adjustments: '0.00',
        closing: '0.00', reconciled: true, withBalance: 0,
      },
      service: { opened: 0, completed: 0, pending: 0, cancelled: 0, netOpen: 0, averageDaysOpen: 0 },
    }));
  });
});
