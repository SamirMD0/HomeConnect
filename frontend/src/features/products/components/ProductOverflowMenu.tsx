import React, { useState } from 'react';
import { Archive, Printer, RotateCcw, ShoppingCart, Tags } from 'lucide-react';
import { RowMenu, RowMenuList, type RowMenuItem, type RowMenuListProps } from '../../../components/ui/RowMenu';
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

function useProductMenuItems({ product, canAdmin, onArchive, onRestore }: Omit<Props, 'defaultOpen'>): RowMenuItem[] {
  const rollout = useRolloutMode();
  return [
    ...(rollout.legacyEnabled ? [{ label: 'Print label', icon: Printer, to: `/products/${product.id}/label` }] : []),
    ...(rollout.pricingCardEnabled ? [{ label: 'Pricing card', icon: Tags, to: `/products/${product.id}/pricing-card` }] : []),
    { label: 'Make Order', icon: ShoppingCart, to: salesOrderCreateUrl(product.id) },
    ...(canAdmin
      ? [product.isActive
        ? { label: 'Archive', icon: Archive, tone: 'danger' as const, onSelect: onArchive }
        : { label: 'Restore', icon: RotateCcw, tone: 'primary' as const, onSelect: onRestore }]
      : []),
  ];
}

export const ProductOverflowMenu: React.FC<Props> = ({ defaultOpen = false, ...props }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <RowMenu
      open={open}
      onOpenChange={setOpen}
      label={`More actions for ${props.product.name}`}
      renderList={(list) => <ProductOverflowMenuItems {...props} list={list} />}
    />
  );
};

/** Separate so the rollout lookup only runs for a menu that is actually open. */
export const ProductOverflowMenuItems: React.FC<Omit<Props, 'defaultOpen'> & { list?: RowMenuListProps }> = ({ list, ...props }) => {
  const items = useProductMenuItems(props);
  return <RowMenuList items={items} label={`Actions for ${props.product.name}`} {...list} />;
};
