import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Archive, MoreHorizontal, Printer, RotateCcw, ShoppingCart, Tags } from 'lucide-react';
import { Link } from 'react-router-dom';
import { salesOrderCreateUrl } from '../../sales-orders/utils/sales-order-links';
import { useRolloutMode } from '../../pricing-card/hooks/useRolloutMode';
import type { Product } from '../types/product.types';

interface Props {
  product: Product;
  canAdmin: boolean;
  onArchive: () => void;
  onRestore: () => void;
  defaultOpen?: boolean;
}

type MenuPlacement = 'above-start' | 'above-end' | 'below-start' | 'below-end';

const menuPlacementClass: Record<MenuPlacement, string> = {
  'above-start': 'bottom-full left-0 mb-1',
  'above-end': 'bottom-full right-0 mb-1',
  'below-start': 'left-0 top-full mt-1',
  'below-end': 'right-0 top-full mt-1',
};

export const ProductOverflowMenu: React.FC<Props> = ({ product, canAdmin, onArchive, onRestore, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const [placement, setPlacement] = useState<MenuPlacement>('above-start');
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const updatePlacement = useCallback(() => {
    if (!trigger.current || typeof window === 'undefined') return;
    const triggerRect = trigger.current.getBoundingClientRect();
    const menuWidth = menu.current?.offsetWidth ?? 224;
    const menuHeight = menu.current?.offsetHeight ?? (canAdmin ? 116 : 80);
    const gutter = 8;
    const vertical = triggerRect.bottom + menuHeight + gutter <= window.innerHeight ? 'below' : 'above';
    const horizontal = triggerRect.left + menuWidth + gutter <= window.innerWidth ? 'start' : 'end';
    setPlacement(`${vertical}-${horizontal}` as MenuPlacement);
  }, [canAdmin]);

  useLayoutEffect(() => {
    if (open) updatePlacement();
  }, [open, updatePlacement]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [open, updatePlacement]);

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
    {open && <ProductOverflowMenuItems menuRef={menu} placement={placement} product={product} canAdmin={canAdmin} onArchive={() => closeAnd(onArchive)} onRestore={() => closeAnd(onRestore)} />}
  </div>;
};

interface MenuItemsProps extends Omit<Props, 'defaultOpen'> {
  placement?: MenuPlacement;
  menuRef?: React.Ref<HTMLDivElement>;
}

export const ProductOverflowMenuItems: React.FC<MenuItemsProps> = ({ product, canAdmin, onArchive, onRestore, placement = 'above-start', menuRef }) => {
  const rollout = useRolloutMode();
  return <div ref={menuRef} role="menu" aria-label={`Actions for ${product.name}`} className={`absolute z-30 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-xl ${menuPlacementClass[placement]}`}>
    {rollout.legacyEnabled && <Link role="menuitem" to={`/products/${product.id}/label`} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Printer className="h-4 w-4" />Print label / طباعة الملصق</Link>}
    {rollout.pricingCardEnabled && <Link role="menuitem" to={`/products/${product.id}/pricing-card`} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><Tags className="h-4 w-4" />Pricing card / بطاقة السعر</Link>}
    <Link role="menuitem" to={salesOrderCreateUrl(product.id)} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"><ShoppingCart className="h-4 w-4" />Make Order / إنشاء طلب</Link>
    {canAdmin && (product.isActive
      ? <button role="menuitem" type="button" onClick={onArchive} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"><Archive className="h-4 w-4" />Archive / أرشفة</button>
      : <button role="menuitem" type="button" onClick={onRestore} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-brand-700 hover:bg-brand-50"><RotateCcw className="h-4 w-4" />Restore / استعادة</button>)}
  </div>;
};
