import { InstallmentPlanFrequency } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { InstallmentScheduleError } from './financial-errors';
import { generateMonthlyInstallmentSchedule } from './installment-schedule';
import { moneyToApiString, sumMoney } from './money';

describe('monthly installment schedule generation', () => {
  it('generates weekly installments seven days apart', () => {
    const schedule = generateMonthlyInstallmentSchedule({
      totalAmount: '300.00',
      startDate: '2026-08-01',
      installmentCount: 3,
      frequency: InstallmentPlanFrequency.WEEKLY,
    });

    expect(schedule.map((installment) => installment.dueDate)).toEqual([
      '2026-08-01',
      '2026-08-08',
      '2026-08-15',
    ]);
  });
  it('generates six monthly installments with the first due on the start date', () => {
    const schedule = generateMonthlyInstallmentSchedule({
      totalAmount: '600.00',
      startDate: '2026-08-01',
      installmentCount: 6,
      frequency: InstallmentPlanFrequency.MONTHLY,
    });

    expect(schedule.map((installment) => installment.dueDate)).toEqual([
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
      '2026-11-01',
      '2026-12-01',
      '2027-01-01',
    ]);
    expect(schedule.every((installment) => moneyToApiString(installment.amountDue) === '100.00')).toBe(true);
  });

  it('splits whole-dollar totals without cents and puts remainder dollars first', () => {
    const schedule = generateMonthlyInstallmentSchedule({
      totalAmount: '320.00',
      startDate: '2026-08-01',
      installmentCount: 3,
      frequency: InstallmentPlanFrequency.MONTHLY,
    });

    expect(schedule.map((installment) => moneyToApiString(installment.amountDue))).toEqual([
      '107.00',
      '107.00',
      '106.00',
    ]);
    expect(moneyToApiString(sumMoney(schedule.map((installment) => installment.amountDue)))).toBe('320.00');
  });

  it('supports a one-installment schedule', () => {
    const schedule = generateMonthlyInstallmentSchedule({
      totalAmount: '25.50',
      startDate: '2026-08-01',
      installmentCount: 1,
      frequency: InstallmentPlanFrequency.MONTHLY,
    });

    expect(schedule).toHaveLength(1);
    expect(schedule[0]).toMatchObject({ installmentNumber: 1, dueDate: '2026-08-01' });
    expect(moneyToApiString(schedule[0].amountDue)).toBe('25.50');
  });

  it('preserves original month-end anchor across February, leap years, and year rollover', () => {
    const nonLeap = generateMonthlyInstallmentSchedule({
      totalAmount: '400.00',
      startDate: '2026-01-31',
      installmentCount: 4,
      frequency: InstallmentPlanFrequency.MONTHLY,
    });

    expect(nonLeap.map((installment) => installment.dueDate)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);

    const leap = generateMonthlyInstallmentSchedule({
      totalAmount: '200.00',
      startDate: '2028-01-31',
      installmentCount: 2,
      frequency: InstallmentPlanFrequency.MONTHLY,
    });

    expect(leap[1].dueDate).toBe('2028-02-29');
  });

  it('rejects totals too small to produce positive cent-level installments', () => {
    expect(() =>
      generateMonthlyInstallmentSchedule({
        totalAmount: '0.03',
        startDate: '2026-08-01',
        installmentCount: 4,
        frequency: InstallmentPlanFrequency.MONTHLY,
      })
    ).toThrow(InstallmentScheduleError);
  });

  it('supports large installment counts while preserving exact sum equality', () => {
    const schedule = generateMonthlyInstallmentSchedule({
      totalAmount: '120.00',
      startDate: '2026-01-15',
      installmentCount: 12,
      frequency: InstallmentPlanFrequency.MONTHLY,
    });

    expect(schedule).toHaveLength(12);
    expect(schedule[11].dueDate).toBe('2026-12-15');
    expect(moneyToApiString(sumMoney(schedule.map((installment) => installment.amountDue)))).toBe('120.00');
  });
});
