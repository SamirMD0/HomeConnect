import { useEffect, useState } from 'react';
import { AlertCircle, Plus, ShoppingCart } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button, EmptyState, PageHeader, Pagination, SkeletonTable } from '../../components/ui';
import { CreateSalesOrderDialog } from '../../features/sales-orders/components/CreateSalesOrderDialog';
import { SalesOrderDateNavigator } from '../../features/sales-orders/components/SalesOrderDateNavigator';
import { SalesOrderFilters } from '../../features/sales-orders/components/SalesOrderFilters';
import { SalesOrderSummaryCards } from '../../features/sales-orders/components/SalesOrderSummaryCards';
import { SalesOrdersTable } from '../../features/sales-orders/components/SalesOrdersTable';
import { useSalesOrders, useSalesOrderSummary } from '../../features/sales-orders/hooks/useSalesOrders';
import type { SalesOrderFilters as FilterValues } from '../../features/sales-orders/types/sales-orders.types';
import {
  isAtLatest,
  periodCardLabels,
  resolveRange,
  stepRange,
  todayString,
  type SalesDateMode,
} from '../../features/sales-orders/utils/sales-order-dates';

const MODES: SalesDateMode[] = ['day', 'month', 'all'];

export function SalesOrdersPage() {
  const [params, setParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(params.get('action') === 'add');

  // Opens on today, because that is the day the shop is working in.
  const modeParam = params.get('mode');
  const mode: SalesDateMode = MODES.includes(modeParam as SalesDateMode) ? (modeParam as SalesDateMode) : 'day';
  const range = resolveRange(mode, params.get('date') || todayString());
  const period = periodCardLabels(range);

  const filters: FilterValues = {
    search: params.get('search') || undefined,
    salesChannel: params.get('salesChannel') ? [params.get('salesChannel') as never] : undefined,
    paymentStatus: params.get('paymentStatus') ? [params.get('paymentStatus') as never] : undefined,
    fulfillmentStatus: params.get('fulfillmentStatus') ? [params.get('fulfillmentStatus') as never] : undefined,
    dateFrom: range.dateFrom, dateTo: range.dateTo,
    page: Number(params.get('page') || 1), pageSize: 25, sort: 'createdDesc',
  };
  const orders = useSalesOrders(filters);
  // Same range as the list, so the cards and the table can never disagree.
  const summary = useSalesOrderSummary({ dateFrom: range.dateFrom, dateTo: range.dateTo });

  const update = (key: keyof FilterValues, value: string) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); setParams(next); };
  const setParam = (key: 'date' | 'mode', value: string) => { const next = new URLSearchParams(params); next.set(key, value); next.delete('page'); setParams(next); };
  const reset = () => setParams({});

  // ← and → step through days or months, unless the user is typing in a field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      if (range.mode === 'all' || (direction === 1 && isAtLatest(range))) return;
      setParam('date', stepRange(range, direction));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return <div className="space-y-5">
    <PageHeader title={{ en: 'Sales Orders', ar: 'طلبات البيع' }} description="Record shop and phone sales with fulfillment and ledger integration." icon={<ShoppingCart />} actions={<Button icon={<Plus />} onClick={() => setCreateOpen(true)}>Add Order / إضافة طلب</Button>} />
    <SalesOrderDateNavigator range={range} onAnchorChange={(anchor) => setParam('date', anchor)} onModeChange={(value) => setParam('mode', value)} />
    <SalesOrderSummaryCards data={summary.data} loading={summary.isLoading} period={period} />
    <SalesOrderFilters filters={filters} onChange={update} onReset={reset} />
    {orders.isLoading ? <SkeletonTable rows={6} columns={7} className="rounded-xl border border-slate-200 bg-white" /> : orders.isError ? <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="h-4 w-4" />Unable to load sales orders. <Button variant="link" onClick={() => orders.refetch()}>Retry</Button></div> : orders.data?.items.length ? <><SalesOrdersTable orders={orders.data.items} /><Pagination currentPage={filters.page ?? 1} totalPages={orders.data.pagination.totalPages} onPageChange={(page) => update('page', String(page))} /></> : <EmptyState title="No sales orders / لا توجد طلبات بيع" description={range.mode === 'all' ? 'Create the first order or adjust the filters.' : 'Nothing recorded here. Step back a day, or switch to All.'} action={<Button icon={<Plus />} onClick={() => setCreateOpen(true)}>Add Order / إضافة طلب</Button>} />}
    <CreateSalesOrderDialog isOpen={createOpen} onClose={() => setCreateOpen(false)} />
  </div>;
}
