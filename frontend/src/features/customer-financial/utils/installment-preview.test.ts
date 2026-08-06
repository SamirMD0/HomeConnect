import { describe, expect, it } from 'vitest';
import { generateInstallmentPreview } from './installment-preview';

describe('generateInstallmentPreview', () => {
  it('previews weekly due dates seven days apart', () => {
    const preview = generateInstallmentPreview({
      totalAmount: '300.00', startDate: '2026-08-01', installmentCount: 3, frequency: 'WEEKLY',
    });
    expect(preview.rows.map((row) => row.dueDate)).toEqual(['2026-08-01', '2026-08-08', '2026-08-15']);
  });
  it('uses start date as first due date and splits whole-dollar totals without cents', () => {
    const preview = generateInstallmentPreview({
      totalAmount: '320.00',
      startDate: '2026-08-01',
      installmentCount: 3,
    });

    expect(preview.rows).toEqual([
      { installmentNumber: 1, dueDate: '2026-08-01', amountDue: '107.00' },
      { installmentNumber: 2, dueDate: '2026-09-01', amountDue: '107.00' },
      { installmentNumber: 3, dueDate: '2026-10-01', amountDue: '106.00' },
    ]);
    expect(preview.totalScheduled).toBe('320.00');
    expect(preview.isBalanced).toBe(true);
  });

  it('previews manual schedules and reports total mismatches', () => {
    const preview = generateInstallmentPreview({
      totalAmount: '320.00',
      startDate: '2026-08-01',
      installmentCount: 3,
      manualAmounts: ['120', '110', '90'],
    });
    const mismatch = generateInstallmentPreview({
      totalAmount: '320.00',
      startDate: '2026-08-01',
      installmentCount: 3,
      manualAmounts: ['120', '110', '80'],
    });

    expect(preview.rows.map((row) => row.amountDue)).toEqual(['120.00', '110.00', '90.00']);
    expect(preview.totalScheduled).toBe('320.00');
    expect(preview.isBalanced).toBe(true);
    expect(mismatch.totalScheduled).toBe('310.00');
    expect(mismatch.balanceDifference).toBe('10.00');
    expect(mismatch.isBalanced).toBe(false);
  });

  it('preserves the original anchor day and clamps month ends', () => {
    const preview = generateInstallmentPreview({
      totalAmount: '90.00',
      startDate: '2026-01-31',
      installmentCount: 3,
    });

    expect(preview.rows.map((row) => row.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
    ]);
  });

  it('handles leap-year February correctly', () => {
    const preview = generateInstallmentPreview({
      totalAmount: '90.00',
      startDate: '2028-01-31',
      installmentCount: 2,
    });

    expect(preview.rows.map((row) => row.dueDate)).toEqual(['2028-01-31', '2028-02-29']);
  });

  it('rejects invalid inputs before submission', () => {
    expect(() =>
      generateInstallmentPreview({
        totalAmount: '0.00',
        startDate: '2026-08-01',
        installmentCount: 3,
      })
    ).toThrow('valid total amount');
    expect(() =>
      generateInstallmentPreview({
        totalAmount: '100.00',
        startDate: '2026-02-30',
        installmentCount: 3,
      })
    ).toThrow('valid start date');
    expect(() =>
      generateInstallmentPreview({
        totalAmount: '100.00',
        startDate: '2026-08-01',
        installmentCount: 0,
      })
    ).toThrow('positive whole number');
  });
});
