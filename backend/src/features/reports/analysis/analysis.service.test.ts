import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { review, repository } = vi.hoisted(() => ({
  review: { get: vi.fn() },
  repository: { receivedQuantityTotal: vi.fn(), soldQuantityByProduct: vi.fn(), receivedProducts: vi.fn() },
}));
vi.mock('../monthly-review/monthly-review.service', () => ({ MonthlyReviewService: review }));
vi.mock('../rows/report-rows.repository', () => ({ ReportRowsRepository: repository }));

import { AnalysisService } from './analysis.service';

const options = { businessDate: '2026-08-17', generatedAt: new Date('2026-08-17T09:00:00.000Z') };

function envelope(overrides: {
  sales?: Partial<{ orderCount: number; totalAmount: string; paidAmount: string; unpaidAmount: string }>;
  customerMovement?: Partial<{ newAmount: string; collected: string; closing: string }>;
  supplierMovement?: Partial<{ newAmount: string; collected: string; closing: string }>;
  inventory?: Partial<{ lowStockProducts: number; outOfStockProducts: number; ordersAwaitingStockDeduction: number }>;
  topDebtors?: Array<{ customerId: string; customerName: string; outstanding: string }>;
} = {}) {
  return {
    meta: { from: '2026-08-01', to: '2026-08-17', previousFrom: '2026-07-15', previousTo: '2026-07-31', preset: 'thisMonth', generatedAt: '', currency: 'USD' },
    data: {
      sales: { orderCount: 0, totalAmount: '0.00', paidAmount: '0.00', unpaidAmount: '0.00', averageOrderValue: '0.00', ...overrides.sales },
      customers: {
        movement: { opening: '0.00', newAmount: '0.00', collected: '0.00', adjustments: '0.00', closing: '0.00', reconciled: true, ...overrides.customerMovement },
        operationalSnapshot: { generatedAt: '', ageDistribution: [], topDebtors: overrides.topDebtors ?? [] },
      },
      suppliers: {
        movement: { opening: '0.00', newAmount: '0.00', collected: '0.00', adjustments: '0.00', closing: '0.00', reconciled: true, ...overrides.supplierMovement },
        operationalSnapshot: { generatedAt: '', owed: '0.00', suppliersWithBalance: 0, topBalances: [] },
      },
      inventory: {
        operationalSnapshot: {
          generatedAt: '',
          summary: { lowStockProducts: 0, outOfStockProducts: 0, ordersAwaitingStockDeduction: 0, ...overrides.inventory },
        },
      },
      risk: { alerts: [], total: 0, operationalSnapshotAt: '' },
    },
  };
}

describe('AnalysisService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.receivedQuantityTotal.mockResolvedValue({ units: 0, lines: 0 });
    repository.soldQuantityByProduct.mockResolvedValue(new Map());
    repository.receivedProducts.mockResolvedValue([]);
    review.get.mockResolvedValue(envelope());
  });

  it('compares the period against the one before it', async () => {
    review.get
      .mockResolvedValueOnce(envelope({ sales: { totalAmount: '1000.00', orderCount: 10 } }))
      .mockResolvedValueOnce(envelope({ sales: { totalAmount: '800.00', orderCount: 8 } }));

    const report = await AnalysisService.get({ period: 'thisMonth' }, options);

    expect(report.data.health.salesTotal).toEqual({ current: '1000.00', previous: '800.00', change: '200.00', changePercent: 25 });
    expect(report.data.health.orderCount).toEqual({ current: 10, previous: 8, change: 2 });
  });

  it('reports no percentage when the previous period was zero rather than dividing by it', async () => {
    review.get
      .mockResolvedValueOnce(envelope({ sales: { totalAmount: '500.00' } }))
      .mockResolvedValueOnce(envelope({ sales: { totalAmount: '0.00' } }));

    const report = await AnalysisService.get({ period: 'thisMonth' }, options);

    expect(report.data.health.salesTotal.changePercent).toBeNull();
  });

  it('keeps each ledger in its own section and never merges them', async () => {
    review.get.mockResolvedValue(envelope({
      customerMovement: { closing: '300.00' }, supplierMovement: { closing: '700.00' },
    }));

    const report = await AnalysisService.get({ period: 'thisMonth' }, options);

    expect(report.data.health.customerReceivables.current).toBe('300.00');
    expect(report.data.health.supplierPayables.current).toBe('700.00');
    expect(JSON.stringify(report.data)).not.toContain('1000.00');
  });

  it('warns when supplier debt grew faster than collections', async () => {
    review.get
      .mockResolvedValueOnce(envelope({ supplierMovement: { closing: '900.00' }, customerMovement: { collected: '100.00' } }))
      .mockResolvedValueOnce(envelope({ supplierMovement: { closing: '200.00' } }));

    const report = await AnalysisService.get({ period: 'thisMonth' }, options);
    const finding = report.data.findings.find((item) => item.key === 'SUPPLIER_DEBT_OUTRUNNING_COLLECTIONS');

    expect(report.data.cashflow.supplierDebtOutrunningCollections).toBe(true);
    expect(finding?.severity).toBe('serious');
    expect(finding?.detail.en).toContain('700.00');
    expect(finding?.detail.ar).toContain('700.00');
  });

  it('warns when collections fell short of newly created debt', async () => {
    review.get.mockResolvedValue(envelope({ customerMovement: { newAmount: '500.00', collected: '100.00' } }));

    const report = await AnalysisService.get({ period: 'thisMonth' }, options);

    expect(report.data.cashflow.collectionShortfall).toBe(true);
    expect(report.data.findings.map((item) => item.key)).toContain('COLLECTION_SHORTFALL');
  });

  it('flags a receivable concentrated in one customer', async () => {
    review.get.mockResolvedValue(envelope({
      customerMovement: { closing: '1000.00' },
      topDebtors: [{ customerId: 'c1', customerName: 'Rami', outstanding: '600.00' }],
    }));

    const report = await AnalysisService.get({ period: 'thisMonth' }, options);
    const finding = report.data.findings.find((item) => item.key === 'RECEIVABLE_CONCENTRATION');

    expect(finding?.detail.en).toContain('Rami');
    expect(finding?.detail.en).toContain('60');
  });

  it('reports the unpaid share of sales and leaves it null when there were no sales', async () => {
    review.get.mockResolvedValue(envelope({ sales: { totalAmount: '400.00', unpaidAmount: '100.00' } }));
    expect((await AnalysisService.get({ period: 'thisMonth' }, options)).data.salesVsDebt.unpaidPercentOfSales).toBe(25);

    review.get.mockResolvedValue(envelope());
    expect((await AnalysisService.get({ period: 'thisMonth' }, options)).data.salesVsDebt.unpaidPercentOfSales).toBeNull();
  });

  it('counts inventory received, sold, and received-but-unsold products', async () => {
    repository.receivedQuantityTotal.mockResolvedValue({ units: 25, lines: 3 });
    repository.soldQuantityByProduct.mockResolvedValue(new Map([['p1', 4]]));
    repository.receivedProducts.mockResolvedValue([
      { product: { id: 'p1' }, receiving: { id: 'r1', transactions: [{ id: 't1' }] } },
      { product: { id: 'p2' }, receiving: { id: 'r2', transactions: [] } },
    ]);

    const report = await AnalysisService.get({ period: 'thisMonth' }, options);

    expect(report.data.inventoryPosition.receivedUnits).toBe(25);
    expect(report.data.inventoryPosition.soldUnits).toBe(4);
    expect(report.data.inventoryPosition.receivedNotSoldProducts).toBe(1);
    expect(report.data.supplierPosition.receivingWithoutLinkedDebt).toBe(1);
    expect(report.data.findings.map((item) => item.key)).toContain('RECEIVING_WITHOUT_LINKED_DEBT');
  });

  it('raises stock findings by severity, preferring out-of-stock over low-stock', async () => {
    review.get.mockResolvedValue(envelope({ inventory: { lowStockProducts: 3, outOfStockProducts: 2 } }));
    const keys = (await AnalysisService.get({ period: 'thisMonth' }, options)).data.findings.map((item) => item.key);

    expect(keys).toContain('OUT_OF_STOCK');
    expect(keys).not.toContain('LOW_STOCK');
  });

  it('produces no findings for a quiet, balanced period', async () => {
    expect((await AnalysisService.get({ period: 'thisMonth' }, options)).data.findings).toEqual([]);
  });

  it('exports a CSV of the analysis alone, with a BOM and its own filename', async () => {
    review.get.mockResolvedValue(envelope({ sales: { totalAmount: '1000.00' } }));

    const result = await AnalysisService.exportCsv({ period: 'thisMonth' }, options);

    expect(result.csv.startsWith('﻿')).toBe(true);
    expect(result.csv).toContain('Sales');
    expect(result.csv).toContain('1000.00');
    expect(result.filename).toBe('analysis-2026-08-01-to-2026-08-17.csv');
  });

  it('never writes: every collaborator it uses is a read', async () => {
    await AnalysisService.get({ period: 'thisMonth' }, options);

    expect(review.get).toHaveBeenCalled();
    for (const mock of Object.values(repository)) {
      for (const call of mock.mock.calls) expect(call[0]).not.toHaveProperty('data');
    }
  });
});

describe('AnalysisService money handling', () => {
  it('keeps decimal money exact through comparison', async () => {
    review.get
      .mockResolvedValueOnce(envelope({ customerMovement: { closing: '0.10' } }))
      .mockResolvedValueOnce(envelope({ customerMovement: { closing: '0.20' } }));
    repository.receivedQuantityTotal.mockResolvedValue({ units: 0, lines: 0 });
    repository.soldQuantityByProduct.mockResolvedValue(new Map());
    repository.receivedProducts.mockResolvedValue([]);

    const report = await AnalysisService.get({ period: 'thisMonth' }, options);

    expect(report.data.health.customerReceivables.change).toBe('-0.10');
    expect(new Decimal(report.data.health.customerReceivables.change).toString()).toBe('-0.1');
  });
});
