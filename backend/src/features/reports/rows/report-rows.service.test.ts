import { StockMovementType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository, metrics, debts } = vi.hoisted(() => ({
  repository: {
    newCustomers: vi.fn(), customerPayments: vi.fn(), supplierTransactions: vi.fn(),
    supplierReceivings: vi.fn(), salesOrders: vi.fn(), unpaidSalesOrders: vi.fn(),
    stockMovements: vi.fn(), receivingReconciliation: vi.fn(), openDebtsAsOf: vi.fn(),
    paymentsThrough: vi.fn(), receivedProducts: vi.fn(), soldQuantityByProduct: vi.fn(),
    receivedQuantityTotal: vi.fn(),
  },
  metrics: { get: vi.fn() },
  debts: { getDebtReportForRange: vi.fn(), getFinancialActivityForRange: vi.fn() },
}));

vi.mock('./report-rows.repository', () => ({ ReportRowsRepository: repository }));
vi.mock('../metrics/reports-metrics.service', () => ({ ReportsMetricsService: metrics }));
vi.mock('../monthly-debts/monthly-debts.service', () => ({ MonthlyDebtsService: debts }));

import { ReportRowsService } from './report-rows.service';

const options = { businessDate: '2026-08-17', generatedAt: new Date('2026-08-17T09:00:00.000Z') };

describe('ReportRowsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(repository).forEach((mock) => mock.mockResolvedValue([]));
    metrics.get.mockResolvedValue({ sales: { orderCount: 0, totalAmount: '0.00', paidAmount: '0.00', unpaidAmount: '0.00', averageOrderValue: '0.00' } });
  });

  it('serializes customer payments and keeps the backend authoritative for totals', async () => {
    repository.customerPayments.mockResolvedValue([
      { id: 'p1', totalAmount: new Decimal('123.45'), paymentDate: new Date('2026-08-03T00:00:00Z'), paymentMethod: 'CASH', reference: 'R1', notes: null, customer: { id: 'c1', name: 'Ali', phone: '1' }, createdBy: { fullName: 'Admin', username: 'admin' } },
      { id: 'p2', totalAmount: new Decimal('10.00'), paymentDate: new Date('2026-08-04T00:00:00Z'), paymentMethod: 'CARD', reference: null, notes: null, customer: { id: 'c2', name: 'Maya', phone: '2' }, createdBy: { fullName: 'Admin', username: 'admin' } },
    ]);

    const report = await ReportRowsService.get('customers-payments', { period: 'thisMonth' }, options);

    expect(report.meta.to).toBe('2026-08-17');
    expect(report.data.summary).toEqual({ count: 2, totalAmount: '133.45' });
    expect(report.data.rows[0]).toMatchObject({ amount: '123.45', paymentDate: '2026-08-03' });
  });

  it('reuses the point-in-time customer debt service for an exact custom range', async () => {
    debts.getDebtReportForRange.mockResolvedValue({ summary: { totalOutstanding: '90.00' }, rows: [{ customer: { name: 'Ali' }, totalOutstanding: '90.00' }] });

    const report = await ReportRowsService.get('customers-debts', { period: 'custom', from: '2026-07-10', to: '2026-07-20' }, options);

    expect(debts.getDebtReportForRange).toHaveBeenCalledWith(expect.objectContaining({ month: '2026-07', limit: 10000 }), '2026-07-10', '2026-07-20');
    expect(report.data.summary).toEqual({ totalOutstanding: '90.00' });
  });

  it('keeps supplier receiving separate from supplier money transactions', async () => {
    repository.supplierTransactions.mockResolvedValue([
      { id: 't1', type: 'SUPPLIER_DEBT', direction: 'INCREASE_OWED', amount: new Decimal('500.00'), transactionDate: new Date('2026-08-02T00:00:00Z'), description: 'Invoice', reference: null, receiptNumber: '1', supplierReceivingId: null, supplier: { id: 's1', name: 'Supplier', companyName: null } },
      { id: 't2', type: 'SUPPLIER_PAYMENT', direction: 'DECREASE_OWED', amount: new Decimal('120.00'), transactionDate: new Date('2026-08-03T00:00:00Z'), description: 'Paid', reference: null, receiptNumber: null, supplierReceivingId: null, supplier: { id: 's1', name: 'Supplier', companyName: null } },
    ]);

    const report = await ReportRowsService.get('suppliers-debts', { period: 'thisMonth' }, options);

    expect(report.data.summary).toEqual({ count: 2, increased: '500.00', decreased: '120.00', netChange: '380.00' });
    expect(repository.supplierReceivings).not.toHaveBeenCalled();
  });

  it('uses CP-R3 sales metrics instead of summing row values', async () => {
    repository.salesOrders.mockResolvedValue([]);
    metrics.get.mockResolvedValue({ sales: { orderCount: 7, totalAmount: '999.99', paidAmount: '600.00', unpaidAmount: '399.99', averageOrderValue: '142.86' } });

    const report = await ReportRowsService.get('sales-orders', { period: 'lastMonth' }, options);

    expect(report.data.summary).toEqual(expect.objectContaining({ totalAmount: '999.99', orderCount: 7 }));
    expect(metrics.get).toHaveBeenCalledWith(expect.objectContaining({ preset: 'lastMonth' }));
  });

  it('flags a receiving item whose PURCHASE_RECEIPT relation is inconsistent', async () => {
    repository.receivingReconciliation.mockResolvedValue([receivingRecord({ quantityChange: 4 })]);

    const report = await ReportRowsService.get('inventory-reconciliation', { period: 'thisMonth' }, options);

    expect(report.data.summary).toEqual({ count: 1, ok: 0, mismatches: 1 });
    expect(report.data.rows[0]).toMatchObject({ status: 'MISMATCH' });
    expect((report.data.rows[0] as { issues: string[] }).issues).toContain('Original movement quantity does not match receiving item');
  });

  it('accepts matching posted receiving movement relations', async () => {
    repository.receivingReconciliation.mockResolvedValue([receivingRecord({ quantityChange: 5 })]);

    const report = await ReportRowsService.get('inventory-reconciliation', { period: 'thisMonth' }, options);

    expect(report.data.summary).toEqual({ count: 1, ok: 1, mismatches: 0 });
    expect(report.data.rows[0]).toMatchObject({ status: 'OK', issues: [] });
  });

  it('requires a matching reversal movement for every voided receiving item', async () => {
    const record = receivingRecord({ quantityChange: 5 });
    record.status = 'VOIDED';
    record.items[0].status = 'REVERSED';
    record.items[0].reversalStockMovement = {
      id: 'm2', productId: 'p1', movementType: StockMovementType.PURCHASE_RECEIPT_REVERSAL,
      quantityChange: -5, referenceType: 'SUPPLIER_RECEIVING_ITEM', referenceId: 'i1',
    };
    repository.receivingReconciliation.mockResolvedValue([record]);

    const report = await ReportRowsService.get('inventory-reconciliation', { period: 'thisMonth' }, options);

    expect(report.data.summary).toEqual({ count: 1, ok: 1, mismatches: 0 });
  });

  it('exports Arabic and quoted values through the shared BOM CSV builder', async () => {
    repository.newCustomers.mockResolvedValue([{ id: 'c1', name: 'علي, "الحداد"', phone: '1', isActive: true, createdAt: new Date('2026-08-02T10:00:00Z') }]);

    const result = await ReportRowsService.exportCsv('customers-new', { period: 'thisMonth' }, options);

    expect(result.csv.startsWith('\uFEFF')).toBe(true);
    expect(result.csv).toContain('"علي, ""الحداد"""');
    expect(result.filename).toBe('customers-new-2026-08-01-to-2026-08-17.csv');
  });
});

describe('ReportRowsService customer movement reports', () => {
  const snapshot = (rows: Array<Record<string, unknown>>) => ({ summary: {}, rows });

  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(repository).forEach((mock) => mock.mockResolvedValue([]));
    repository.soldQuantityByProduct.mockResolvedValue(new Map());
    // Opening call first, closing call second.
    debts.getDebtReportForRange
      .mockResolvedValueOnce(snapshot([
        { customer: { id: 'c1', name: 'Ali', phone: '1' }, totalOutstanding: '100.00', lastPaymentDate: '2026-05-01', activeDebtCount: 1, activePlanCount: 0 },
      ]))
      .mockResolvedValueOnce(snapshot([
        { customer: { id: 'c1', name: 'Ali', phone: '1' }, totalOutstanding: '150.00', lastPaymentDate: '2026-05-01', activeDebtCount: 2, activePlanCount: 0 },
        { customer: { id: 'c2', name: 'Maya', phone: '2' }, totalOutstanding: '20.00', lastPaymentDate: '2026-08-10', activeDebtCount: 1, activePlanCount: 0 },
      ]));
    debts.getFinancialActivityForRange.mockResolvedValue({
      items: [
        { type: 'DEBT_CREATED', amount: '50.00', customer: { id: 'c1', name: 'Ali', phone: '1' } },
        { type: 'PAYMENT_RECEIVED', amount: '30.00', customer: { id: 'c2', name: 'Maya', phone: '2' } },
      ],
    });
  });

  it('lists only customers with no payment in the period, with full movement columns', async () => {
    const report = await ReportRowsService.get('customers-not-paid', { period: 'thisMonth' }, options);

    expect(report.data.rows).toHaveLength(1);
    expect(report.data.rows[0]).toMatchObject({
      customer: { id: 'c1', name: 'Ali' },
      openingBalance: '100.00', newDebt: '50.00', paidInPeriod: '0.00',
      closingBalance: '150.00', paymentCount: 0, unpaidDebtCount: 2,
      lastPaymentDate: '2026-05-01',
    });
    expect(report.data.summary).toMatchObject({ count: 1, newDebt: '50.00', paidInPeriod: '0.00' });
  });

  it('labels the risk on a customer who did not pay and whose debt grew', async () => {
    const report = await ReportRowsService.get('customers-not-paid', { period: 'thisMonth' }, options);
    const labels = (report.data.rows[0] as { riskLabels: string[] }).riskLabels;

    expect(labels).toContain('NO_PAYMENT_THIS_PERIOD');
    expect(labels).toContain('DEBT_INCREASED');
    expect(labels).toContain('OLD_UNPAID_BALANCE');
    expect(labels).not.toContain('HIGH_BALANCE');
  });

  it('lists only customers who did pay, and counts their payments', async () => {
    const report = await ReportRowsService.get('customers-paid', { period: 'thisMonth' }, options);

    expect(report.data.rows).toHaveLength(1);
    expect(report.data.rows[0]).toMatchObject({
      customer: { id: 'c2', name: 'Maya' }, paidInPeriod: '30.00', paymentCount: 1, closingBalance: '20.00',
    });
    expect(report.data.summary).toMatchObject({ count: 1, paymentCount: 1, paidInPeriod: '30.00' });
  });

  /** Opening and closing must come from the debt snapshot service, not a second calculation. */
  it('reads opening and closing balances from the point-in-time debt service', async () => {
    await ReportRowsService.get('customers-not-paid', { period: 'thisMonth' }, options);

    expect(debts.getDebtReportForRange).toHaveBeenCalledTimes(2);
    const [openingCall, closingCall] = debts.getDebtReportForRange.mock.calls;
    expect(openingCall[1]).toBe('2026-07-31');
    expect(openingCall[2]).toBe('2026-07-31');
    expect(closingCall[1]).toBe('2026-08-01');
    expect(closingCall[2]).toBe('2026-08-17');
  });
});

describe('ReportRowsService products bought', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.values(repository).forEach((mock) => mock.mockResolvedValue([]));
    repository.soldQuantityByProduct.mockResolvedValue(new Map([['p1', 3]]));
    repository.receivedProducts.mockResolvedValue([
      receivedItem({ id: 'i1', productId: 'p1', quantity: 10 }),
      receivedItem({ id: 'i2', productId: 'p2', quantity: 4, status: 'REVERSED' }),
    ]);
  });

  it('reports received quantities and never claims a purchase value', async () => {
    const report = await ReportRowsService.get('products-bought', { period: 'thisMonth' }, options);
    const summary = report.data.summary as Record<string, unknown>;

    expect(summary.totalUnits).toBe(10);
    expect(summary.valuation).toBe('NOT_AVAILABLE');
    expect(JSON.stringify(report.data)).not.toMatch(/unitPrice|costPrice|purchaseValue/);
  });

  it('keeps a reversed line visible but excludes it from the totals', async () => {
    const report = await ReportRowsService.get('products-bought', { period: 'thisMonth' }, options);
    const summary = report.data.summary as Record<string, unknown>;

    expect(report.data.rows).toHaveLength(2);
    expect(summary.activeLines).toBe(1);
    expect(summary.reversedLines).toBe(1);
    expect(summary.totalUnits).toBe(10);
  });

  it('flags an active product received but not sold in the period', async () => {
    repository.soldQuantityByProduct.mockResolvedValue(new Map());
    const report = await ReportRowsService.get('products-bought', { period: 'thisMonth' }, options);

    expect((report.data.summary as Record<string, unknown>).receivedNotSold).toBe(1);
    expect(report.data.rows[0]).toMatchObject({ soldInPeriod: 0 });
  });

  it('carries the linked supplier debt when one exists', async () => {
    const report = await ReportRowsService.get('products-bought', { period: 'thisMonth' }, options);

    expect(report.data.rows[0]).toMatchObject({ linkedDebt: { id: 't1', amount: '99.00' } });
  });
});

function receivedItem({ id, productId, quantity, status = 'ACTIVE' }: { id: string; productId: string; quantity: number; status?: string }) {
  return {
    id, quantity, status,
    product: { id: productId, name: `Product ${productId}`, sku: `SKU-${productId}`, barcode: null, stockQuantity: 12 },
    stockMovement: { id: `m-${id}`, movementType: StockMovementType.PURCHASE_RECEIPT, quantityChange: quantity },
    reversalStockMovement: null,
    receiving: {
      id: 'r1', referenceNumber: 'INV-1', receivedOn: new Date('2026-08-02T00:00:00Z'), status: 'POSTED',
      supplier: { id: 's1', name: 'Supplier One' },
      receivedBy: { fullName: 'Admin', username: 'admin' },
      transactions: [{ id: 't1', amount: new Decimal('99.00') }],
    },
  };
}

function receivingRecord({ quantityChange }: { quantityChange: number }) {
  return {
    id: 'r1', referenceNumber: 'R1', receivedOn: new Date('2026-08-02T00:00:00Z'), status: 'POSTED',
    supplier: { id: 's1', name: 'Supplier' },
    items: [{
      id: 'i1', quantity: 5, status: 'ACTIVE', productId: 'p1', product: { name: 'Product', sku: 'SKU1' },
      stockMovement: { id: 'm1', productId: 'p1', movementType: StockMovementType.PURCHASE_RECEIPT, quantityChange, referenceType: 'SUPPLIER_RECEIVING_ITEM', referenceId: 'i1' },
      reversalStockMovement: null as null | { id: string; productId: string; movementType: StockMovementType; quantityChange: number; referenceType: string; referenceId: string },
    }],
  };
}
