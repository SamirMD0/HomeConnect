import React, { useState } from 'react';
import { AlertTriangle, Minus, PackagePlus, RotateCcw, SearchCheck, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { ProductStockBadge } from '../../products/components/ProductStockBadge';
import { useProductInventory } from '../hooks/useInventory';
import type { WiredStockMovementType } from '../types/inventory.types';
import { MovementHistory } from './MovementHistory';
import { StockMovementDialog } from './StockMovementDialog';
import { VerifyOpeningCountDialog } from './VerifyOpeningCountDialog';

export const ProductInventoryPanel: React.FC<{ productId: string }> = ({ productId }) => {
  const { user } = useAuth();
  const inventory = useProductInventory(productId);
  const [action, setAction] = useState<WiredStockMovementType | null>(null);
  const [verifyingOpeningCount, setVerifyingOpeningCount] = useState(false);
  const data = inventory.data;
  if (inventory.isLoading) return <p className="text-sm text-slate-500">Loading inventory… / جارٍ تحميل المخزون</p>;
  if (inventory.isError || !data) return <p role="alert" className="text-sm text-red-700">Unable to load inventory / تعذر تحميل المخزون</p>;
  const onboarded = data.onboardingStatus === 'ONBOARDED';
  const actions: Array<{ type: WiredStockMovementType; label: string; icon: React.ElementType; admin?: boolean }> = [
    { type: 'MANUAL_ADD', label: 'Add / إضافة', icon: PackagePlus },
    { type: 'MANUAL_REMOVE', label: 'Remove / إزالة', icon: Minus, admin: true },
    { type: 'STOCK_COUNT', label: 'Count / جرد', icon: SearchCheck, admin: true },
    { type: 'DAMAGE_LOSS', label: 'Damage/loss / تلف أو فقدان', icon: Trash2, admin: true },
    { type: 'RETURN_TO_STOCK', label: 'Return / إعادة', icon: RotateCcw },
  ];

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-4"><div><p className="text-xs text-slate-500">Current stock / المخزون الحالي</p><p className="text-3xl font-bold tabular-nums">{data.product.stockQuantity}</p></div><ProductStockBadge status={data.product.stockStatus} /></div>
    {data.onboardingStatus === 'PENDING_ONBOARDING' && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><AlertTriangle className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">This product needs a verified opening count before stock actions / يحتاج هذا المنتج جردًا مؤكدًا قبل حركات المخزون</span>{user?.role === 'ADMIN' && <button type="button" onClick={() => setVerifyingOpeningCount(true)} className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white"><ShieldCheck className="h-4 w-4" />Verify Opening Count / تأكيد الجرد الافتتاحي</button>}</div>}
    {data.onboardingStatus === 'NOT_IN_INVENTORY' && <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><span className="min-w-0 flex-1">This product is not in inventory / هذا المنتج غير مُدرج في المخزون</span>{user?.role === 'ADMIN' && <button type="button" onClick={() => setVerifyingOpeningCount(true)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-white px-3 py-2 text-xs font-semibold text-emerald-700"><ShieldCheck className="h-4 w-4" />Verify Opening Count / تأكيد الجرد الافتتاحي</button>}</div>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{actions.map(({ type, label, icon: Icon, admin }) => <button key={type} type="button" disabled={!data.product.trackStock || !onboarded || Boolean(admin && user?.role !== 'ADMIN')} onClick={() => setAction(type)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40"><Icon className="h-4 w-4" />{label}</button>)}</div>
    <div><h4 className="mb-2 text-sm font-semibold uppercase text-slate-700">Movement history / سجل الحركات</h4><MovementHistory movements={data.recentMovements} /></div>
    <StockMovementDialog productId={productId} productName={data.product.name} currentQuantity={data.product.stockQuantity} type={action} onClose={() => setAction(null)} />
    <VerifyOpeningCountDialog productId={productId} productName={data.product.name} open={verifyingOpeningCount} onClose={() => setVerifyingOpeningCount(false)} />
  </div>;
};
