import React, { useMemo, useState } from 'react';
import { AlertTriangle, PackageSearch, PackageX, ScanLine, Search, Warehouse } from 'lucide-react';
import { useProducts } from '../../features/products/hooks/useProducts';
import { ProductStockBadge } from '../../features/products/components/ProductStockBadge';
import { useInventorySummary, useLowStockProducts } from '../../features/inventory/hooks/useInventory';
import { MovementHistory } from '../../features/inventory/components/MovementHistory';
import { InventoryProductDrawer } from '../../features/inventory/components/InventoryProductDrawer';
import { useScannerLookup } from '../../features/scanner/hooks/useScannerLookup';
import { useScannerEvents } from '../../features/scanner/hooks/useScannerEvents';
import { ScanFeedback } from '../../features/scanner/components/ScanFeedback';

type Filter = 'ALL' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'TRACKED' | 'UNTRACKED';

export const InventoryPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const summary = useInventorySummary();
  const lowStock = useLowStockProducts({ search, pageSize: 100 });
  const products = useProducts({ search, pageSize: 100, sortBy: 'name' });
  const scanner = useScannerLookup({
    onFound: (result) => setSelectedProductId(result.product?.id ?? null),
    onSearch: setSearch,
  });
  useScannerEvents({ enabled: true, onOpenProduct: setSelectedProductId, canOpenProduct: !selectedProductId });

  const rows = useMemo(() => {
    if (filter === 'LOW_STOCK' || filter === 'OUT_OF_STOCK') {
      return (lowStock.data?.items ?? []).filter((item) => filter === 'LOW_STOCK' ? item.stockStatus === 'LOW_STOCK' : item.stockStatus === 'OUT_OF_STOCK');
    }
    return (products.data?.items ?? []).filter((item) => filter === 'TRACKED' ? item.trackStock : filter === 'UNTRACKED' ? !item.trackStock : true);
  }, [filter, lowStock.data?.items, products.data?.items]);
  const cards = [
    { label: 'Tracked products / المنتجات المتتبعة', value: summary.data?.trackedProducts, icon: Warehouse },
    { label: 'Low stock / مخزون منخفض', value: summary.data?.lowStockProducts, icon: AlertTriangle },
    { label: 'Out of stock / نفد المخزون', value: summary.data?.outOfStockProducts, icon: PackageX },
    { label: 'Movements today / حركات اليوم', value: summary.data?.movementsToday, icon: PackageSearch },
  ];

  return <div className="space-y-6"><header><div className="flex items-center gap-2"><Warehouse className="h-7 w-7 text-emerald-700" /><h1 className="text-2xl font-bold">Inventory / المخزون</h1></div><p className="mt-1 text-sm text-slate-500">Every quantity change has a reason and history / لكل تغيير في الكمية سبب وسجل</p></header>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><Icon className="h-5 w-5 text-emerald-700" /><p className="mt-2 text-2xl font-bold tabular-nums">{summary.isLoading ? '—' : value ?? 0}</p><p className="text-xs text-slate-500">{label}</p></div>)}</div>
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><form onSubmit={(event) => { event.preventDefault(); scanner.submit(search); }} className="flex gap-2"><label className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Search or scan product / ابحث أو امسح المنتج" value={search} onChange={(event) => { setSearch(event.target.value); scanner.clear(); }} placeholder="Name, SKU or barcode / الاسم أو الرمز أو الباركود" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3" /></label><button className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white"><ScanLine className="h-4 w-4" />Scan / مسح</button></form><ScanFeedback result={scanner.result} isLooking={scanner.isLooking} isError={scanner.isError} onOpenProduct={(id) => setSelectedProductId(id)} onManualSearch={scanner.clear} /></section>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Inventory filters">{(['ALL', 'LOW_STOCK', 'OUT_OF_STOCK', 'TRACKED', 'UNTRACKED'] as Filter[]).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filter === value ? 'border-emerald-600 bg-emerald-50 text-emerald-800' : 'border-slate-300 bg-white text-slate-600'}`}>{filterLabel(value)}</button>)}</div>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-4 py-3"><h2 className="font-bold">Products / المنتجات</h2></div>{rows.length ? <div className="divide-y divide-slate-100">{rows.map((item) => <button key={item.id} type="button" onClick={() => setSelectedProductId(item.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"><span className="min-w-0"><strong className="user-text block truncate" dir="auto">{item.name}</strong><span className="font-mono text-xs text-slate-500">{item.sku}{item.barcode ? ` · ${item.barcode}` : ''}</span></span><span className="flex items-center gap-3"><span className="text-xl font-bold tabular-nums">{item.stockQuantity}</span><ProductStockBadge status={item.stockStatus} /></span></button>)}</div> : <p className="p-6 text-center text-sm text-slate-500">No matching products / لا توجد منتجات مطابقة</p>}</section>
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h2 className="mb-2 font-bold">Recent stock movements / أحدث حركات المخزون</h2><MovementHistory movements={summary.data?.recentMovements ?? []} /></section>
    <InventoryProductDrawer productId={selectedProductId} onClose={() => setSelectedProductId(null)} />
  </div>;
};

const filterLabel = (filter: Filter) => ({
  ALL: 'All / الكل', LOW_STOCK: 'Low stock / منخفض', OUT_OF_STOCK: 'Out of stock / نافد', TRACKED: 'Tracked / متتبع', UNTRACKED: 'Untracked / غير متتبع',
})[filter];
