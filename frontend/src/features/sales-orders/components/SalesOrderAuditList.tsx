import { AlertCircle, History } from 'lucide-react';
import { Button, EmptyState, SkeletonText } from '../../../components/ui';
import { formatDateTime } from '../../customer-financial/utils/financial-format';
import { useSalesOrderAudit } from '../hooks/useSalesOrders';

export function SalesOrderAuditList({ salesOrderId }: { salesOrderId: string }) {
  const audit = useSalesOrderAudit(salesOrderId, true);
  if (audit.isLoading) return <SkeletonText lines={4} />;
  if (audit.isError) return <div role="alert" className="flex items-center gap-2 text-sm text-red-700"><AlertCircle className="h-4 w-4" />Unable to load history.<Button variant="link" onClick={() => audit.refetch()}>Retry</Button></div>;
  if (!audit.data?.length) return <EmptyState title="No audit history" description="No recorded changes were found." icon={<History className="h-8 w-8 text-slate-300" />} />;
  return <ol className="divide-y divide-slate-100">{audit.data.map((entry) => <li key={entry.id} className="py-3"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium text-slate-900">{entry.action.replaceAll('_', ' ')}</p><time className="text-xs text-slate-500">{formatDateTime(entry.changedAt)}</time></div><p className="user-text mt-1 text-sm text-slate-600" dir="auto">{entry.reason}</p><p className="mt-1 text-xs text-slate-500">{entry.changedByName} · {entry.changedByUsername}</p></li>)}</ol>;
}
