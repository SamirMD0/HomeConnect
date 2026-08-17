import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { analysis } = vi.hoisted(() => ({ analysis: { value: undefined as unknown } }));
vi.mock('../hooks/useAnalysis', () => ({ useAnalysis: () => analysis.value }));

import { AnalysisPortal } from './AnalysisPortal';

const meta = { from: '2026-08-01', to: '2026-08-17', previousFrom: '2026-07-15', previousTo: '2026-07-31', preset: 'thisMonth', generatedAt: '2026-08-17T09:00:00.000Z', currency: 'USD' };
const compare = (current: string, previous: string, change: string, changePercent: number | null) => ({ current, previous, change, changePercent });
const counts = (current: number, previous: number) => ({ current, previous, change: current - previous });

const data = {
  health: {
    salesTotal: compare('1000.00', '800.00', '200.00', 25),
    orderCount: counts(10, 8),
    customerDebtAdded: compare('500.00', '200.00', '300.00', 150),
    customerCollected: compare('100.00', '150.00', '-50.00', -33.3),
    supplierDebtAdded: compare('700.00', '100.00', '600.00', 600),
    supplierPaid: compare('50.00', '80.00', '-30.00', -37.5),
    customerReceivables: compare('900.00', '600.00', '300.00', 50),
    supplierPayables: compare('750.00', '150.00', '600.00', 400),
    inventoryReceivedUnits: counts(25, 10),
    inventorySoldUnits: counts(4, 12),
  },
  cashflow: {
    customerDebtGrowth: '300.00', supplierDebtGrowth: '600.00', collections: '100.00',
    supplierPayments: '50.00', netCollectionPosition: '50.00', unpaidCustomerAmount: '400.00',
    supplierAmountOwed: '750.00', supplierDebtOutrunningCollections: true, collectionShortfall: true,
  },
  salesVsDebt: {
    orderCount: 10, paidAmount: '600.00', unpaidAmount: '400.00', unpaidPercentOfSales: 40,
    topDebtors: [{ customerId: 'c1', customerName: 'Rami', outstanding: '540.00' }],
  },
  supplierPosition: {
    owed: '750.00', suppliersWithBalance: 2, paidInPeriod: '50.00',
    topBalances: [{ supplierId: 's1', supplierName: 'Supplier One', balance: '500.00' }],
    receivingWithoutLinkedDebt: 1,
  },
  inventoryPosition: {
    receivedUnits: 25, receivedLines: 3, soldUnits: 4, lowStockProducts: 2,
    outOfStockProducts: 1, receivedNotSoldProducts: 1, ordersAwaitingStockDeduction: 3,
  },
  findings: [
    { key: 'SUPPLIER_DEBT_OUTRUNNING_COLLECTIONS', severity: 'serious', label: { en: 'Supplier debt grew faster than collections', ar: 'ديون الموردين نمت أسرع من التحصيل' }, detail: { en: 'Supplier debt rose by 600.00 while collections were 100.00. This may create cash pressure.', ar: 'ارتفع دين الموردين.' } },
    { key: 'RECEIVED_NOT_SOLD', severity: 'info', label: { en: 'Products received but not sold', ar: 'منتجات استُلمت ولم تُبع' }, detail: { en: '1 product(s) were received this period with no sale movement.', ar: 'منتج واحد.' } },
  ],
};

const loaded = { data: { meta, data }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };

describe('Analysis portal', () => {
  beforeEach(() => { analysis.value = loaded; });

  it('states which two periods it is comparing', () => {
    const html = render();
    expect(html).toContain('2026-08-01');
    expect(html).toContain('2026-08-17');
    expect(html).toContain('2026-07-15');
    expect(html).toContain('2026-07-31');
  });

  it('compares customer debt, supplier debt, sales, and inventory in one view', () => {
    const html = render();
    for (const label of [
      'Sales / المبيعات', 'Customer debt added / دين زبائن جديد', 'Supplier debt added / دين موردين جديد',
      'Customer receivables / ذمم الزبائن', 'Supplier payables / ذمم الموردين',
      'Units received / وحدات مستلمة', 'Units sold / وحدات مباعة',
    ]) expect(html).toContain(label);
  });

  it('renders every section the analysis portal promises', () => {
    const html = render();
    for (const section of [
      'Business health / صحة العمل', 'Cashflow pressure / ضغط التدفق النقدي',
      'Sales vs debt / المبيعات مقابل الدين', 'Supplier position / وضع الموردين',
      'Inventory position / وضع المخزون', 'Risk &amp; actions / المخاطر والإجراءات',
    ]) expect(html).toContain(section);
  });

  /** The portal explains risk in words, which is the point of an ERP report. */
  it('explains each risk in both languages rather than only showing numbers', () => {
    const html = render();
    expect(html).toContain('Supplier debt grew faster than collections');
    expect(html).toContain('ديون الموردين نمت أسرع من التحصيل');
    expect(html).toContain('This may create cash pressure');
    expect(html).toContain('Products received but not sold');
  });

  it('renders backend figures verbatim and computes nothing itself', () => {
    const html = render();
    expect(html).toContain('1,000.00');
    expect(html).toContain('750.00');
    expect(html).toContain('40%');
    expect(html).toContain('Rami');
    expect(html).toContain('Supplier One');
  });

  it('says so plainly when a quiet period has no risks', () => {
    analysis.value = { ...loaded, data: { meta, data: { ...data, findings: [] } } };
    const html = render();
    expect(html).toContain('No risks detected for this period');
    expect(html).not.toContain('Supplier debt grew faster');
  });

  it('renders loading, error, and incomplete-range states', () => {
    analysis.value = { data: undefined, isLoading: true, isError: false, isFetching: true, refetch: vi.fn() };
    expect(render()).toContain('animate-pulse');

    analysis.value = { data: undefined, isLoading: false, isError: true, isFetching: false, refetch: vi.fn() };
    expect(render()).toContain('Report failed to load');

    analysis.value = loaded;
    expect(render({ period: 'custom' })).toContain('Select both dates');
  });
});

function render(period: { period: string; from?: string; to?: string } = { period: 'thisMonth' }) {
  return renderToStaticMarkup(
    <MemoryRouter><AnalysisPortal period={period as never} /></MemoryRouter>
  );
}
