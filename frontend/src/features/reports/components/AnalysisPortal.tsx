import { AlertTriangle, Info, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMoney } from '../../customer-financial/utils/financial-format';
import { useAnalysis } from '../hooks/useAnalysis';
import type {
  AnalysisComparison, AnalysisCountComparison, AnalysisData, AnalysisFinding,
} from '../types/analysis.types';
import type { MonthlyReviewQuery } from '../types/monthly-review.types';
import { ReportErrorState, ReportLoadingState } from './ReportStates';

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
      Select both dates to load the analysis / اختر التاريخين لتحميل التحليل
    </div>;
  }
  if (analysis.isLoading && !analysis.data) return <ReportLoadingState />;
  if (analysis.isError || !analysis.data) return <ReportErrorState onRetry={() => void analysis.refetch()} />;

  const { data, meta } = analysis.data;
  return <div className="space-y-6">
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <strong>Comparing / مقارنة:</strong> {meta.from} → {meta.to}
      <span className="text-slate-500"> vs {meta.previousFrom} → {meta.previousTo}</span>
    </div>

    <FindingsSection findings={data.findings} />

    <Section title="Business health / صحة العمل">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MoneyCompare label="Sales / المبيعات" value={data.health.salesTotal} />
        <CountCompare label="Orders / الطلبات" value={data.health.orderCount} />
        <MoneyCompare label="Customer debt added / دين زبائن جديد" value={data.health.customerDebtAdded} invert />
        <MoneyCompare label="Customer collected / محصّل من الزبائن" value={data.health.customerCollected} />
        <MoneyCompare label="Supplier debt added / دين موردين جديد" value={data.health.supplierDebtAdded} invert />
        <MoneyCompare label="Supplier paid / مدفوع للموردين" value={data.health.supplierPaid} />
        <MoneyCompare label="Customer receivables / ذمم الزبائن" value={data.health.customerReceivables} invert />
        <MoneyCompare label="Supplier payables / ذمم الموردين" value={data.health.supplierPayables} invert />
        <CountCompare label="Units received / وحدات مستلمة" value={data.health.inventoryReceivedUnits} />
        <CountCompare label="Units sold / وحدات مباعة" value={data.health.inventorySoldUnits} />
      </div>
    </Section>

    <Section title="Cashflow pressure / ضغط التدفق النقدي">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Customer debt growth / نمو دين الزبائن" value={data.cashflow.customerDebtGrowth} money />
        <Figure label="Supplier debt growth / نمو دين الموردين" value={data.cashflow.supplierDebtGrowth} money />
        <Figure label="Collections / التحصيل" value={data.cashflow.collections} money />
        <Figure label="Supplier payments / دفعات الموردين" value={data.cashflow.supplierPayments} money />
        <Figure label="Net collection position / صافي التحصيل" value={data.cashflow.netCollectionPosition} money />
        <Figure label="Unpaid customer sales / مبيعات غير مدفوعة" value={data.cashflow.unpaidCustomerAmount} money />
        <Figure label="Owed to suppliers / مستحق للموردين" value={data.cashflow.supplierAmountOwed} money />
      </div>
    </Section>

    <Section title="Sales vs debt / المبيعات مقابل الدين">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Orders / الطلبات" value={String(data.salesVsDebt.orderCount)} />
        <Figure label="Paid / المدفوع" value={data.salesVsDebt.paidAmount} money />
        <Figure label="Unpaid / غير المدفوع" value={data.salesVsDebt.unpaidAmount} money />
        <Figure
          label="Unpaid share of sales / نسبة غير المدفوع"
          value={data.salesVsDebt.unpaidPercentOfSales === null ? '—' : `${data.salesVsDebt.unpaidPercentOfSales}%'`.replace("'", '')}
        />
      </div>
      <RankedList
        title="Top customers by outstanding / أكبر الزبائن مديونية"
        items={data.salesVsDebt.topDebtors.map((debtor) => ({
          id: debtor.customerId, name: debtor.customerName,
          value: formatMoney(debtor.outstanding), to: `/customers/${debtor.customerId}`,
        }))}
      />
    </Section>

    <Section title="Supplier position / وضع الموردين">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Owed to suppliers / المستحق" value={data.supplierPosition.owed} money />
        <Figure label="Suppliers with balance / موردون برصيد" value={String(data.supplierPosition.suppliersWithBalance)} />
        <Figure label="Paid this period / مدفوع هذه الفترة" value={data.supplierPosition.paidInPeriod} money />
        <Figure label="Receiving with no bill / استلام بلا فاتورة" value={String(data.supplierPosition.receivingWithoutLinkedDebt)} />
      </div>
      <RankedList
        title="Top suppliers owed / أكبر الموردين استحقاقًا"
        items={data.supplierPosition.topBalances.map((entry) => ({
          id: entry.supplierId, name: entry.supplierName,
          value: formatMoney(entry.balance), to: `/suppliers/${entry.supplierId}`,
        }))}
      />
    </Section>

    <Section title="Inventory position / وضع المخزون">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure label="Units received / وحدات مستلمة" value={String(data.inventoryPosition.receivedUnits)} />
        <Figure label="Units sold / وحدات مباعة" value={String(data.inventoryPosition.soldUnits)} />
        <Figure label="Low stock / مخزون منخفض" value={String(data.inventoryPosition.lowStockProducts)} />
        <Figure label="Out of stock / نفد المخزون" value={String(data.inventoryPosition.outOfStockProducts)} />
        <Figure label="Received not sold / استُلم ولم يُبع" value={String(data.inventoryPosition.receivedNotSoldProducts)} />
        <Figure label="Awaiting stock deduction / بانتظار الخصم" value={String(data.inventoryPosition.ordersAwaitingStockDeduction)} />
      </div>
    </Section>
  </div>;
}

function FindingsSection({ findings }: { findings: AnalysisFinding[] }) {
  if (findings.length === 0) {
    return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
      <strong>No risks detected for this period.</strong> / لم يُرصد أي خطر لهذه الفترة.
    </div>;
  }
  const icon = { serious: TriangleAlert, warning: AlertTriangle, info: Info };
  const tone = {
    serious: 'border-red-200 bg-red-50 text-red-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-blue-200 bg-blue-50 text-blue-900',
  };
  return <Section title="Risk & actions / المخاطر والإجراءات">
    <ul className="space-y-3">
      {findings.map((finding) => {
        const Icon = icon[finding.severity];
        return <li key={finding.key} className={`flex gap-3 rounded-xl border p-4 ${tone[finding.severity]}`}>
          <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{finding.label.en} / {finding.label.ar}</p>
            <p className="mt-1 text-sm">{finding.detail.en}</p>
            <p className="user-text mt-0.5 text-sm" dir="auto">{finding.detail.ar}</p>
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
    <p className={`mt-1 text-xs font-semibold ${value.change === 0 ? 'text-slate-500' : value.change > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
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
        <Link to={item.to} className="user-text font-semibold text-emerald-700 hover:underline" dir="auto">{item.name}</Link>
        <strong className="tabular-nums">{item.value}</strong>
      </li>)}
    </ul>
  </div>;
}

export type { AnalysisData };
