import React from 'react';
import { Ban, Eye, FileClock, HandCoins, PackageCheck, Pencil, Undo2 } from 'lucide-react';
import { RowMenu, type RowMenuItem } from '../../../components/ui/RowMenu';
import { PrepaidPurchase } from '../types/prepaid.types';
import { businessLabels } from '../../../shared/labels/business-labels';

interface PrepaidRowActionsProps {
  item: PrepaidPurchase;
  canMutate: boolean;
  menuKey: string;
  openMenuKey: string | null;
  onOpenChange: (key: string | null) => void;
  onDeliver: (item: PrepaidPurchase) => void;
  onConvert?: (item: PrepaidPurchase) => void;
  onRevertDelivery: (item: PrepaidPurchase) => void;
  onViewDetails: (item: PrepaidPurchase) => void;
  onEdit: (item: PrepaidPurchase) => void;
  onRecordPayment: (item: PrepaidPurchase) => void;
  onCancel: (item: PrepaidPurchase) => void;
}

export function buildPrepaidMenuItems({
  item,
  canMutate,
  onDeliver,
  onConvert,
  onRevertDelivery,
  onViewDetails,
  onEdit,
  onRecordPayment,
  onCancel,
}: Omit<PrepaidRowActionsProps, 'menuKey' | 'openMenuKey' | 'onOpenChange'>): RowMenuItem[] {
  const actions: RowMenuItem[] = [
    { label: businessLabels.prepaid.viewDetails, icon: Eye, onSelect: () => onViewDetails(item) },
  ];

  if (canMutate && item.status === 'PENDING') {
    actions.push({ label: businessLabels.prepaid.editPurchase, icon: Pencil, onSelect: () => onEdit(item) });
    if (!item.isFullyPaid) {
      actions.push({
        label: businessLabels.prepaid.recordPayment,
        icon: HandCoins,
        tone: 'primary',
        onSelect: () => onRecordPayment(item),
      });
    }
    actions.push({ label: businessLabels.prepaid.markDelivered, icon: PackageCheck, onSelect: () => onDeliver(item) });
    if (onConvert && !item.isFullyPaid) {
      actions.push({ label: businessLabels.prepaid.convert, icon: FileClock, onSelect: () => onConvert(item) });
    }
    actions.push({
      label: businessLabels.prepaid.cancelPurchase,
      icon: Ban,
      tone: 'danger',
      onSelect: () => onCancel(item),
    });
  }
  if (canMutate && item.status === 'DELIVERED') {
    actions.push({
      label: businessLabels.prepaid.revertDelivery,
      icon: Undo2,
      tone: 'danger',
      onSelect: () => onRevertDelivery(item),
    });
  }

  return actions;
}

export const PrepaidRowActions: React.FC<PrepaidRowActionsProps> = ({ menuKey, openMenuKey, onOpenChange, ...props }) => (
  <RowMenu
    open={openMenuKey === menuKey}
    onOpenChange={(open) => onOpenChange(open ? menuKey : null)}
    label={`Actions for ${props.item.itemName}`}
    items={buildPrepaidMenuItems(props)}
  />
);
