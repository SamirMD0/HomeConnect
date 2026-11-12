import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { REPORT_CATALOG, REPORT_PATHS } from '@shared/report-catalog';
import { formatMoney, formatBusinessDate, formatDateTime } from '@shared/money-format';
import { collectionPage, serverPage } from './pagination';
import {
  DASHBOARD_HIDE_KEY,
  dashboardDisplayValue,
  readDashboardPrivacy,
} from './dashboard-privacy';
import { contactPhone, validDateRange } from './filters';
import { reportFieldCurrency, reportMoneyField, reportPercentageField } from './report-display';
import { queryKeys } from '../query/keys';
import { can } from '../permissions/can';
describe('lookup boundaries and formatting', () => {
  it('isolates every resource/filter in the existing PC/user/branch key factory', () => {
    const scope = { server: 'http://pc:3011', userId: 'u', branchId: 'a' };
    for (const resource of [
      'dashboard',
      'products',
      'product-inventory',
      'customers',
      'customer-financial',
      'customer-statement',
      'suppliers',
      'supplier-statement',
      'supplier-bills',
      'bill-image',
      'sales-orders',
      'sales-order',
      'report',
    ]) {
      const key = queryKeys.lookup(scope, resource, { id: '1', from: '2026-11-01' });
      for (const changed of [
        { ...scope, branchId: 'b' },
        { ...scope, userId: 'v' },
        { ...scope, server: 'http://other:3011' },
      ])
        expect(queryKeys.lookup(changed, resource, { id: '1', from: '2026-11-01' })).not.toEqual(
          key
        );
      expect(queryKeys.lookup(scope, resource, { id: '2', from: '2026-11-01' })).not.toEqual(key);
    }
  });
  it('uses bounded server pages, including the final full page without dropping records', () => {
    expect(
      serverPage(
        Array.from({ length: 25 }, (_, i) => i),
        1
      ).nextPage
    ).toBe(2);
    expect(serverPage([26], 2).nextPage).toBeUndefined();
    expect(serverPage([], 2).nextPage).toBeUndefined();
    expect(() => serverPage({} as never, 1)).toThrow('invalid list');
  });
  it('pages complete statement/report collections without changing their values', () => {
    const entries = Array.from({ length: 53 }, (_, i) => ({
      id: String(i),
      runningBalance: `-${i}.01`,
    }));
    const pages = [1, 2, 3].map((page) => collectionPage(entries, page));
    expect(pages.flatMap((page) => page.items)).toEqual(entries);
    expect(pages.map((page) => page.items.length)).toEqual([25, 25, 3]);
    expect(pages[2]?.nextPage).toBeUndefined();
  });
  it('formats server decimal strings exactly without float conversion', () => {
    expect(formatMoney('9007199254740993.25')).toBe('$9,007,199,254,740,993.25');
    expect(formatMoney('-45.50')).toBe('-$45.50');
    expect(formatMoney('2500000.00', 'LBP')).toBe('2,500,000 LBP');
    expect(formatMoney('')).toBe('—');
    expect(formatBusinessDate('2026-11-12')).toBe('12/11/2026');
    expect(formatBusinessDate(null)).toBe('—');
    expect(formatDateTime('2026-11-12T09:30:00Z')).toBe(
      new Date('2026-11-12T09:30:00Z').toLocaleString('en-GB', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    );
  });
  it('masks dashboard money and counts and uses the desktop per-device preference key', async () => {
    expect(dashboardDisplayValue(true, '$125.50')).toBe('••••');
    expect(dashboardDisplayValue(true, '125')).toBe('••••');
    expect(dashboardDisplayValue(false, '$125.50')).toBe('$125.50');
    const getItemAsync = vi.fn().mockResolvedValue('1');
    expect(await readDashboardPrivacy({ getItemAsync })).toBe(true);
    expect(getItemAsync).toHaveBeenCalledWith(DASHBOARD_HIDE_KEY);
    getItemAsync.mockResolvedValue(null);
    expect(await readDashboardPrivacy({ getItemAsync })).toBe(false);
    getItemAsync.mockRejectedValue(new Error('unavailable'));
    expect(await readDashboardPrivacy({ getItemAsync })).toBe(true);
  });
  it('matches the desktop report catalogue and admin-only visibility', () => {
    const source = readFileSync(
      new NodeURL('../../../frontend/src/features/reports/reports.registry.ts', import.meta.url),
      'utf8'
    );
    const ids = [...source.matchAll(/\bid: '([^']+)'/g)].map((match) => match[1]);
    expect(REPORT_CATALOG.map((report) => report.id)).toEqual(ids);
    const desktopApi = readFileSync(
      new NodeURL('../../../frontend/src/features/reports/api/report-rows.api.ts', import.meta.url),
      'utf8'
    );
    const desktopPaths = Object.fromEntries(
      [...desktopApi.matchAll(/(?:'([^']+)'|\b(profit)):\s*'([^']+)'/g)].map((match) => [
        match[1] ?? match[2],
        match[3],
      ])
    );
    expect(REPORT_PATHS).toEqual(desktopPaths);
    expect(can('reports.read', { role: 'ADMIN' })).toBe(true);
    expect(can('reports.read', { role: 'EMPLOYEE' })).toBe(false);
  });
  it('keeps percent/rate/count fields as numbers and formats money fields only', () => {
    expect(reportMoneyField('closingBalance', '125.50')).toBe(true);
    expect(reportMoneyField('cashPrice', '125.50')).toBe(true);
    expect(reportMoneyField('marginPercent', '10.50')).toBe(false);
    expect(reportMoneyField('paymentCount', 5)).toBe(false);
    expect(reportMoneyField('shareOfSales', '25.50')).toBe(false);
    expect(reportPercentageField('shareOfSales')).toBe(true);
    for (const key of [
      'outstanding',
      'obligationTotal',
      'difference',
      'moneyIn',
      'moneyOut',
      'stockValue',
      'retailValue',
      'vat',
      'averageOrder',
      'adjustments',
      'over30',
    ]) {
      expect(reportMoneyField(key, '125.50')).toBe(true);
    }
    expect(reportFieldCurrency('customers-payments', 'amount', 'LBP')).toBe('LBP');
    expect(reportFieldCurrency('customers-payments', 'baseAmount', 'LBP')).toBe('USD');
    expect(reportFieldCurrency('suppliers-aging', 'transactionAmount', 'LBP')).toBe('LBP');
    expect(reportFieldCurrency('suppliers-aging', 'remainingAmount', 'LBP')).toBe('USD');
    expect(reportFieldCurrency('sales-orders', 'totalAmount', 'LBP')).toBe('USD');
  });
  it('validates custom dates and creates contact links without modifying data', () => {
    expect(validDateRange({ from: '2026-02-30', to: '2026-03-01' })).toBe(false);
    expect(validDateRange({ from: '2026-11-12', to: '2026-11-01' })).toBe(false);
    expect(validDateRange({ from: '2026-11-01', to: '2026-11-12' })).toBe(true);
    expect(contactPhone('+961 3 123 456')).toBe('9613123456');
    expect(contactPhone('03 123 456')).toBe('9613123456');
  });
});
