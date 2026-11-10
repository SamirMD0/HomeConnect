import { AlertTriangle, Info, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { useAnalysis } from '../hooks/useAnalysis';
import type {
  AnalysisComparison, AnalysisCountComparison, AnalysisData, AnalysisFinding,
} from '../types/analysis.types';
import type { MonthlyReviewQuery } from '../types/monthly-review.types';
import { ReportErrorState, ReportLoadingState } from './ReportStates';
import { BranchBreakdownTable, type WithBranchBreakdown } from '../../branches/scope/BranchBreakdownTable';

/**
 * The analysis portal: one period read against the one before it.
 *
 * Every number here is computed by the backend and rendered verbatim — the
 * comparisons, percentages, and findings all arrive already decided. The page's
 * job is to make the comparison legible, not to do arithmetic.
 */
export function AnalysisPortal({ period }: { period: MonthlyReviewQuery }) {
  const analysis = useAnalysis(period);
  const incompleteCustom = period.period === 'custom' && (!period.from || !period.to);

  if (incompleteCustom) {
    return <div className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
      Select both dates to load the analysis
    </div>;
  }
  if (analysis.isLoading && !analysis.data) return <ReportLoadingState />;
  if (analysis.isError || !analysis.data) return <ReportErrorState onRetry={() => void analysis.refetch()} />;

  const { data, meta } = analysis.data;
  return <div className="space-y-6">
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <strong>Comparing:</strong> {meta.from} → {meta.to}
      <span className="text-slate-500"> vs {meta.previousFrom} → {meta.previousTo}</span>
    </div>

    <FindingsSection findings={data.findings} />

    <Section title="Business health">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MoneyCompare label="Sales" value={data.health.salesTotal} />
        <CountCompare label="Orders" value={data.health.orderCount} />
        <MoneyCompare label="Customer debt added" value={data.health.customerDebtAdded} invert />
        <MoneyCompare label="Customer collected" value={data.health.customerCollected} />
        <MoneyCompare label="Supplier debt added" value={data.health.supplierDebtAdded} invert />
        <MoneyCompare label="Supplier paid" value={data.health.supplierPaid} />
        <MoneyCompare label="Customer receivables" value={data.health.customerReceivables} invert />
        <MoneyCompare label="Supplier payables" value={data.health.supplierPayables} invert />
        <CountCompare label="Units received" value={data.health.inventoryReceivedUnits} />
        <CountCompare label="Units sold" value={data.health.inventorySoldUnits} />
      </div>
    </Section>

    <BranchBreakdownTable<AnalysisData>
      title="By branch"
      description="This period, in USD. Customer receivables and supplier payables are separate balances and are never netted."
      total={data}
      rows={(data as WithBranchBreakdown<AnalysisData>).branchBreakdown}
      metrics={[
        { label: 'Sales', numeric: true, value: (figures) => formatMoney(figures.health.salesTotal.current) },
        { label: 'Customer collected', numeric: true, value: (figures) => formatMoney(figures.health.customerCollected.current) },
        { label: 'Customer receivables', numeric: true, value: (figures) => formatMoney(figures.health.customerReceivables.current) },
        { label: 'Supplier paid', numeric: true, value: (figures) => formatMoney(figures.health.supplierPaid.current) },
        { label: 'Supplier payables', numeric: true, value: (figures) => formatMoney(figures.health.supplierPayables.current) },
      ]}
    />

    <Section title="Cashflow pressure">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Customer debt growth" value={data.cashflow.customerDebtGrowth} money />
        <Figure label="Supplier debt growth" value={data.cashflow.supplierDebtGrowth} money />
        <Figure label="Collections" value={data.cashflow.collections} money />
        <Figure label="Supplier payments" value={data.cashflow.supplierPayments} money />
        <Figure label="Net collection position" value={data.cashflow.netCollectionPosition} money />
        <Figure label="Unpaid customer sales" value={data.cashflow.unpaidCustomerAmount} money />
        <Figure label="Owed to suppliers" value={data.cashflow.supplierAmountOwed} money />
      </div>
    </Section>

    <Section title="Sales vs debt">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Orders" value={String(data.salesVsDebt.orderCount)} />
        <Figure label="Paid" value={data.salesVsDebt.paidAmount} money />
        <Figure label="Unpaid" value={data.salesVsDebt.unpaidAmount} money />
        <Figure
          label="Unpaid share of sales"
          value={data.salesVsDebt.unpaidPercentOfSales === null ? '—' : `${data.salesVsDebt.unpaidPercentOfSales}%'`.replace("'", '')}
        />
      </div>
      <RankedList
        title="Top customers by outstanding"
        items={data.salesVsDebt.topDebtors.map((debtor) => ({
          id: debtor.customerId, name: debtor.customerName,
          value: formatMoney(debtor.outstanding), to: `/customers/${debtor.customerId}`,
        }))}
      />
    </Section>

    <Section title="Supplier position">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Owed to suppliers" value={data.supplierPosition.owed} money />
        <Figure label="Suppliers with balance" value={String(data.supplierPosition.suppliersWithBalance)} />
        <Figure label="Paid this period" value={data.supplierPosition.paidInPeriod} money />
        <Figure label="Receiving with no bill" value={String(data.supplierPosition.receivingWithoutLinkedDebt)} />
      </div>
      <RankedList
        title="Top suppliers owed"
        items={data.supplierPosition.topBalances.map((entry) => ({
          id: entry.supplierId, name: entry.supplierName,
          value: formatMoney(entry.balance), to: `/suppliers/${entry.supplierId}`,
        }))}
      />
    </Section>

    <Section title="Inventory position">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Units received" value={String(data.inventoryPosition.receivedUnits)} />
        <Figure label="Units sold" value={String(data.inventoryPosition.soldUnits)} />
        <Figure label="Low stock" value={String(data.inventoryPosition.lowStockProducts)} />
        <Figure label="Out of stock" value={String(data.inventoryPosition.outOfStockProducts)} />
        <Figure label="Received not sold" value={String(data.inventoryPosition.receivedNotSoldProducts)} />
        <Figure label="Awaiting stock deduction" value={String(data.inventoryPosition.ordersAwaitingStockDeduction)} />
      </div>
    </Section>
  </div>;
}

function FindingsSection({ findings }: { findings: AnalysisFinding[] }) {
  if (findings.length === 0) {
    return <div className="rounded-xl border border-brand-200 bg-brand-50 p-5 text-sm text-brand-900">
      <strong>No risks detected for this period.</strong>
    </div>;
  }
  const icon = { serious: TriangleAlert, warning: AlertTriangle, info: Info };
  const tone = {
    serious: 'border-red-200 bg-red-50 text-red-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-blue-200 bg-blue-50 text-blue-900',
  };
  return <Section title="Risk & actions">
    <ul className="space-y-3">
      {findings.map((finding) => {
        const Icon = icon[finding.severity];
        return <li key={finding.key} className={`flex gap-3 rounded-xl border p-4 ${tone[finding.severity]}`}>
          <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{finding.label.en}</p>
            <p className="mt-1 text-sm">{finding.detail.en}</p>
          </div>
        </li>;
      })}
    </ul>
  </Section>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="space-y-3">
    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>
    {children}
  </section>;
}

function Figure({ label, value, money }: { label: string; value: string; money?: boolean }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <strong className="mt-2 block text-xl text-slate-900">{money ? formatMoney(value) : value}</strong>
  </div>;
}

/**
 * `invert` marks a measure where growth is bad news (debt, payables), so the
 * colour reflects business meaning rather than the sign of the number.
 */
function MoneyCompare({ label, value, invert }: { label: string; value: AnalysisComparison; invert?: boolean }) {
  const rising = value.change.startsWith('-') ? false : value.change !== '0.00';
  const good = value.change === '0.00' ? null : invert ? !rising : rising;
  return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <strong className="mt-2 block text-xl text-slate-900">{formatMoney(value.current)}</strong>
    <p className={`mt-1 flex items-center gap-1 text-xs font-semibold ${good === null ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-red-700'}`}>
      {value.change !== '0.00' && (rising ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />)}
      {formatMoney(value.change)}
      {value.changePercent !== null && <span> ({value.changePercent}%)</span>}
      <span className="font-normal text-slate-400"> vs {formatMoney(value.previous)}</span>
    </p>
  </div>;
}

function CountCompare({ label, value }: { label: string; value: AnalysisCountComparison }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <strong className="mt-2 block text-xl text-slate-900">{value.current}</strong>
    <p className={`mt-1 text-xs font-semibold ${value.change === 0 ? 'text-slate-500' : value.change > 0 ? 'text-brand-700' : 'text-red-700'}`}>
      {value.change > 0 ? '+' : ''}{value.change}
      <span className="font-normal text-slate-400"> vs {value.previous}</span>
    </p>
  </div>;
}

function RankedList({ title, items }: { title: string; items: Array<{ id: string; name: string; value: string; to: string }> }) {
  if (items.length === 0) return null;
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <p className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-700">{title}</p>
    <ul className="divide-y divide-slate-100">
      {items.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
        <Link to={item.to} className="user-text font-semibold text-brand-700 hover:underline" dir="auto">{item.name}</Link>
        <strong className="tabular-nums">{item.value}</strong>
      </li>)}
    </ul>
  </div>;
}

export type { AnalysisData };
