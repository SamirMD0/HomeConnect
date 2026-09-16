import { ReportTotals } from './ReportDataTable';
import { formatMoney } from '../../customer-financial/utils/financial-format';

export function SupplierAgingSummary({ summary }: { summary: Record<string, unknown> }) {
  const buckets = (summary.buckets ?? []) as Array<{ key: string; label: string; amount: string }>;
  const oldest = summary.oldestOverdue as { supplierName: string; dueDate: string; daysOverdue: number; remainingAmount: string } | null;
  return <section className="space-y-3">
    <p className="text-sm text-slate-600">As of / حتى: {String(summary.asOf)} · Due soon / مستحق قريباً: {String(summary.dueSoonDays)} days / أيام. Report-only FIFO · stored base USD / تسوية مشتقة للتقرير فقط.</p>
    <ReportTotals items={buckets.map((b) => ({ label: b.label, value: b.amount, money: true }))} />
    {oldest && <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">Oldest overdue payable / أقدم مستحق متأخر: <span dir="auto">{oldest.supplierName}</span> · {oldest.dueDate} · {oldest.daysOverdue} days / أيام · {formatMoney(oldest.remainingAmount)}</p>}
  </section>;
}
