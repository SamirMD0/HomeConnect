import React, { useEffect, useRef } from 'react';
import { MoreVertical } from 'lucide-react';
import { PrepaidPurchase } from '../types/prepaid.types';
import { businessLabels } from '../../../shared/labels/business-labels';

interface PrepaidRowActionsProps {
  item: PrepaidPurchase;
  canMutate: boolean;
  menuKey: string;
  openMenuKey: string | null;
  onOpenChange: (key: string | null) => void;
  onDeliver: (item: PrepaidPurchase) => void;
  onRevertDelivery: (item: PrepaidPurchase) => void;
  onViewDetails: (item: PrepaidPurchase) => void;
}

export const PrepaidRowActions: React.FC<PrepaidRowActionsProps> = ({
  item,
  canMutate,
  menuKey,
  openMenuKey,
  onOpenChange,
  onDeliver,
  onRevertDelivery,
  onViewDetails,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isOpen = openMenuKey === menuKey;

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onOpenChange(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onOpenChange]);

  const actions: Array<{ label: string; onClick: () => void; tone?: 'danger' }> = [
    { label: businessLabels.prepaid.viewDetails, onClick: () => onViewDetails(item) },
  ];

  if (canMutate && item.status === 'PENDING') {
    actions.push({ label: businessLabels.prepaid.markDelivered, onClick: () => onDeliver(item) });
  }
  if (canMutate && item.status === 'DELIVERED') {
    actions.push({
      label: businessLabels.prepaid.revertDelivery,
      onClick: () => onRevertDelivery(item),
      tone: 'danger',
    });
  }

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={businessLabels.common.actions}
        onClick={() => onOpenChange(isOpen ? null : menuKey)}
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <MoreVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              onClick={() => {
                onOpenChange(null);
                action.onClick();
              }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                action.tone === 'danger' ? 'text-red-600' : 'text-slate-700'
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
