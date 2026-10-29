import { useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ExternalLink } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../../../customer-financial/utils/financial-format';
import { BranchScopeContext } from '../../../branches/scope/BranchScopeProvider';
import type { BranchIdentity, WithBranchBreakdown } from '../../../branches/scope/BranchBreakdownTable';
import type { CustomerAnalyticsData, SupplierAnalyticsData } from '../../types';
import { DashboardSection } from '../layout/DashboardSection';
import { ChartFrame } from '../charts/ChartFrame';
import { SectionState } from './SectionState';

type CustomerRow = CustomerAnalyticsData & BranchIdentity;
type SupplierRow = SupplierAnalyticsData & BranchIdentity;
type Metric = 'collected' | 'newDebt' | 'net';

const METRICS: Record<Metric, string> = {
  collected: 'Collected / المحصّل',
  newDebt: 'New debt / دين جديد',
  net: 'Net (collected − new debt) / الصافي',
};
/** Distinguishable on white in both themes; cycles for more than six branches. */
const LINE_COLORS = ['#059669', '#2563eb', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];

export interface BranchesOverviewProps {
  customer: WithBranchBreakdown<CustomerAnalyticsData> | undefined;
  supplier: WithBranchBreakdown<SupplierAnalyticsData> | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

/**
 * All-branches view of customer debts, cash flow and supplier balances, using
 * the per-branch breakdown the dashboard sections already return. Every total
 * row is the server's own total. Customer receivables and supplier payables
 * are separate tables and are never netted.
 */
export function BranchesOverview({ customer, supplier, isLoading, isError, onRetry }: BranchesOverviewProps) {
  const customerRows = customer?.branchBreakdown;
  return (
    <DashboardSection
      title={{ en: 'Branches', ar: 'الفروع' }}
      subtitle={{ en: 'Debts and cash flow per branch for the selected period, in USD', ar: 'الديون والتدفق النقدي لكل فرع خلال الفترة المحددة' }}
      icon={Building2}
    >
      <SectionState
        isLoading={isLoading && !customer}
        isError={isError}
        isEmpty={!customer || !customerRows}
        onRetry={onRetry}
        emptyText="Per-branch figures appear when two or more branches are in view / تظهر الأرقام لكل فرع عند عرض فرعين أو أكثر"
      >
        {customer && customerRows && (
          <div className="space-y-5">
            <CustomerDebtsTable total={customer} rows={customerRows} />
            <CashFlowChart total={customer} rows={customerRows} />
            {supplier?.branchBreakdown && <SupplierTable total={supplier} rows={supplier.branchBreakdown} />}
          </div>
        )}
      </SectionState>
    </DashboardSection>
  );
}

function ReportLinks({ branchId }: { branchId: string }) {
  const scope = useContext(BranchScopeContext);
  const navigate = useNavigate();
  // Reports and the ledger read the header scope, so switch to this branch first.
  const open = (path: string) => {
    scope?.select({ kind: 'branch', branchId });
    navigate(path);
  };
  return (
    <span className="inline-flex gap-1">
      {[
        { path: '/reports', label: 'Reports' },
        { path: '/ledger', label: 'Ledger' },
      ].map((link) => (
        <button
          key={link.path}
          type="button"
          onClick={() => open(link.path)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
        >
          {link.label}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </button>
      ))}
    </span>
  );
}

function BranchName({ row }: { row: BranchIdentity }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="rounded bg-emerald-600 px-1 text-[10px] font-bold uppercase text-white">{row.branchCode.slice(0, 4)}</span>
      <span className="user-text font-medium text-slate-800" dir="auto">{row.branchName}</span>
    </span>
  );
}

const th = 'whitespace-nowrap px-4 py-2.5 font-medium';
const num = 'px-4 py-2.5 text-right tabular-nums';

function CustomerDebtsTable({ total, rows }: { total: CustomerAnalyticsData; rows: CustomerRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200" data-testid="branches-customer-debts">
      <table className="w-full text-left text-sm">
        <caption className="px-4 py-2.5 text-left text-sm font-semibold text-slate-900">Customer debts / ديون الزبائن</caption>
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th scope="col" className={th}>Branch / الفرع</th>
            <th scope="col" className={th + ' text-right'}>Outstanding</th>
            <th scope="col" className={th + ' text-right'}>With balance</th>
            <th scope="col" className={th + ' text-right'}>Overdue customers</th>
            <th scope="col" className={th + ' text-right'}>New debt</th>
            <th scope="col" className={th + ' text-right'}>Collected</th>
            <th scope="col" className={th + ' text-right'}>Net change</th>
            <th scope="col" className={th}><span className="sr-only">Reports</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.branchId}>
              <th scope="row" className="px-4 py-2.5 font-normal"><BranchName row={row} /></th>
              <td className={num}>{formatMoney(row.totals.outstanding)}</td>
              <td className={num}>{row.totals.customersWithBalance}</td>
              <td className={num}>{row.totals.overdueCustomers}</td>
              <td className={num}>{formatMoney(row.totals.newDebt)}</td>
              <td className={num}>{formatMoney(row.totals.collected)}</td>
              <td className={num}>{formatMoney(row.totals.netMovement)}</td>
              <td className="px-4 py-2.5"><ReportLinks branchId={row.branchId} /></td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-200 bg-slate-50/60 font-semibold text-slate-900">
          <tr>
            <th scope="row" className="px-4 py-2.5">All branches</th>
            <td className={num}>{formatMoney(total.totals.outstanding)}</td>
            <td className={num}>{total.totals.customersWithBalance}</td>
            <td className={num}>{total.totals.overdueCustomers}</td>
            <td className={num}>{formatMoney(total.totals.newDebt)}</td>
            <td className={num}>{formatMoney(total.totals.collected)}</td>
            <td className={num}>{formatMoney(total.totals.netMovement)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CashFlowChart({ total, rows }: { total: CustomerAnalyticsData; rows: CustomerRow[] }) {
  const [metric, setMetric] = useState<Metric>('collected');
  const series = useMemo(() => {
    const value = (point: { collected: string; newDebt: string }) =>
      metric === 'net' ? Number(point.collected) - Number(point.newDebt) : Number(point[metric]);
    return total.trend.map((bucket) => {
      const entry: Record<string, string | number> = { bucket: bucket.bucket };
      for (const row of rows) {
        const point = row.trend.find((candidate) => candidate.bucket === bucket.bucket);
        entry[row.branchId] = point ? value(point) : 0;
      }
      return entry;
    });
  }, [metric, rows, total.trend]);

  return (
    <div data-testid="branches-cash-flow">
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Cash flow metric">
        {(Object.keys(METRICS) as Metric[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={metric === key}
            onClick={() => setMetric(key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              metric === key ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {METRICS[key]}
          </button>
        ))}
      </div>
      <ChartFrame
        title={{ en: 'Cash flow by branch', ar: 'التدفق النقدي حسب الفرع' }}
        subtitle={METRICS[metric]}
        rows={series}
        columns={[
          { key: 'bucket', label: 'Period' },
          ...rows.map((row) => ({ key: row.branchId, label: row.branchName, format: (value: unknown) => formatMoney(String(value)) })),
        ]}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={64} tickFormatter={(value: number) => formatMoney(String(value))} />
            <Tooltip formatter={(value) => formatMoney(String(value))} />
            <Legend />
            {rows.map((row, index) => (
              <Line
                key={row.branchId}
                type="monotone"
                dataKey={row.branchId}
                name={row.branchName}
                stroke={LINE_COLORS[index % LINE_COLORS.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </ChartFrame>
    </div>
  );
}

function SupplierTable({ total, rows }: { total: SupplierAnalyticsData; rows: SupplierRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200" data-testid="branches-suppliers">
      <table className="w-full text-left text-sm">
        <caption className="px-4 py-2.5 text-left text-sm">
          <span className="font-semibold text-slate-900">Supplier balances / ذمم الموردين</span>
          <span className="ml-2 text-xs text-slate-500">What we owe suppliers, kept separate from what customers owe us.</span>
        </caption>
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th scope="col" className={th}>Branch / الفرع</th>
            <th scope="col" className={th + ' text-right'}>We owe</th>
            <th scope="col" className={th + ' text-right'}>Paid in period</th>
            <th scope="col" className={th + ' text-right'}>Suppliers with balance</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.branchId}>
              <th scope="row" className="px-4 py-2.5 font-normal"><BranchName row={row} /></th>
              <td className={num}>{formatMoney(row.totals.owed)}</td>
              <td className={num}>{formatMoney(row.totals.paid)}</td>
              <td className={num}>{row.totals.suppliersWithBalance}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-slate-200 bg-slate-50/60 font-semibold text-slate-900">
          <tr>
            <th scope="row" className="px-4 py-2.5">All branches</th>
            <td className={num}>{formatMoney(total.totals.owed)}</td>
            <td className={num}>{formatMoney(total.totals.paid)}</td>
            <td className={num}>{total.totals.suppliersWithBalance}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
