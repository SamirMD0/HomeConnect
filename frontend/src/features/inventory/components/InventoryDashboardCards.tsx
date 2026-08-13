import React from 'react';
import { AlertTriangle, History, PackageMinus, PackageX, Warehouse } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useInventorySummary } from '../hooks/useInventory';

export const InventoryDashboardCards: React.FC = () => {
  const summary = useInventorySummary();
  if (summary.isError) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Unable to load inventory counts / تعذر تحميل أرقام المخزون</div>;
  const data = summary.data;
  const cards = [
    { label: 'Tracked products / المنتجات المتتبعة', value: data?.trackedProducts, icon: Warehouse, route: '/inventory' },
    { label: 'Low stock / مخزون منخفض', value: data?.lowStockProducts, icon: AlertTriangle, route: '/inventory' },
    { label: 'Out of stock / نفد المخزون', value: data?.outOfStockProducts, icon: PackageX, route: '/inventory' },
    { label: 'Movements today / حركات اليوم', value: data?.movementsToday, icon: History, route: '/inventory' },
    { label: 'Orders awaiting stock deduction / طلبات بانتظار إخراج المخزون', value: data?.ordersAwaitingStockDeduction, icon: PackageMinus, route: '/sales-orders?mode=all&awaitingStockDeduction=true' },
  ];
  return <section aria-label="Inventory overview" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-slate-900">Inventory / المخزون</h2><Link to="/inventory" className="text-sm font-semibold text-emerald-700">Open inventory / فتح المخزون</Link></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{cards.map(({ label, value, icon: Icon, route }) => <Link key={label} to={route} className="rounded-lg bg-slate-50 p-3 hover:bg-emerald-50"><Icon className="mb-2 h-4 w-4 text-emerald-700" /><p className="text-2xl font-bold tabular-nums">{summary.isLoading ? '—' : value ?? 0}</p><p className="mt-1 text-xs text-slate-500">{label}</p></Link>)}</div></section>;
};
