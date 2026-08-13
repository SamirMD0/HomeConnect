import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { ProductInventoryPanel } from './ProductInventoryPanel';
import { useProductInventory } from '../hooks/useInventory';

export const InventoryProductDrawer: React.FC<{ productId: string | null; onClose: () => void }> = ({ productId, onClose }) => {
  const inventory = useProductInventory(productId ?? '');
  useEffect(() => {
    if (!productId) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [productId, onClose]);
  if (!productId) return null;
  return <div className="fixed inset-0 z-40"><button type="button" aria-label="Close inventory details" onClick={onClose} className="absolute inset-0 bg-slate-900/40" /><aside role="dialog" aria-modal="true" aria-label="Inventory details" className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-semibold uppercase text-emerald-700">Inventory / المخزون</p><h2 className="user-text mt-1 text-xl font-bold" dir="auto">{inventory.data?.product.name ?? 'Loading…'}</h2><p className="font-mono text-xs text-slate-500">{inventory.data?.product.sku}</p></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></header><div className="flex-1 overflow-y-auto p-5"><ProductInventoryPanel productId={productId} /></div></aside></div>;
};
