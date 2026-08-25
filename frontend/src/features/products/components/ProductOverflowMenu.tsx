import React, { useRef, useState } from 'react';
import { Archive, MoreHorizontal, Printer, RotateCcw, ShoppingCart } from 'lucide-react';
import { Link } from 'react-router-dom';
import { salesOrderCreateUrl } from '../../sales-orders/utils/sales-order-links';
import type { Product } from '../types/product.types';

interface Props {
  product: Product;
  canAdmin: boolean;
  onArchive: () => void;
  onRestore: () => void;
  defaultOpen?: boolean;
}

export const ProductOverflowMenu: React.FC<Props> = ({ product, canAdmin, onArchive, onRestore, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeAnd = (action: () => void) => {
    setOpen(false);
    action();
  };

  return <div className="relative" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      trigger.current?.focus();
    }
  }}>
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-label={`More actions for ${product.name} / إجراءات إضافية`} title="More actions / إجراءات إضافية" onClick={() => setOpen((current) => !current)} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"><MoreHorizontal className="h-4 w-4" /></button>
    {open && <ProductOverflowMenuItems product={product} canAdmin={canAdmin} onArchive={() => closeAnd(onArchive)} onRestore={() => closeAnd(onRestore)} />}
  </div>;
};

export const ProductOverflowMenuItems: React.FC<Omit<Props, 'defaultOpen'>> = ({ product, canAdmin, onArchive, onRestore }) => <div role="menu" aria-label={`Actions for ${product.name}`} className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-xl">
  <Link role="menuitem" to={`/products/${product.id}/label`} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Printer className="h-4 w-4" />Print label / طباعة الملصق</Link>
  <Link role="menuitem" to={salesOrderCreateUrl(product.id)} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><ShoppingCart className="h-4 w-4" />Make Order / إنشاء طلب</Link>
  {canAdmin && (product.isActive
    ? <button role="menuitem" type="button" onClick={onArchive} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"><Archive className="h-4 w-4" />Archive / أرشفة</button>
    : <button role="menuitem" type="button" onClick={onRestore} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-700 hover:bg-brand-50"><RotateCcw className="h-4 w-4" />Restore / استعادة</button>)}
</div>;
