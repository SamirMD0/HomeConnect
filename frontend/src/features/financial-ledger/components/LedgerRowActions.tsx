import React, { useEffect, useRef } from 'react';
import { MoreHorizontal } from 'lucide-react';

export const LEDGER_CORRECTION_ENABLED = false;

export interface LedgerActionItem {
  label: string;
  onClick: () => void;
  tone?: 'pay' | 'cancel' | 'view';
}

interface LedgerRowActionsProps {
  menuKey: string;
  openMenuKey: string | null;
  actions: LedgerActionItem[];
  immutableHint?: string;
  onOpenChange: (menuKey: string | null) => void;
}

export const LedgerRowActions: React.FC<LedgerRowActionsProps> = ({
  menuKey,
  openMenuKey,
  actions,
  immutableHint,
  onOpenChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const isOpen = openMenuKey === menuKey;
  const runAction = (action: LedgerActionItem) => {
    action.onClick();
    onOpenChange(null);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      onOpenChange(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChange(null);
      triggerRef.current?.focus();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onOpenChange]);

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => onOpenChange(isOpen ? null : menuKey)}
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Open row actions</span>
      </button>
      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 min-w-48 rounded-md border border-slate-200 bg-white p-1 shadow-lg"
        >
          <div className="flex flex-col">
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  runAction(action);
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;

                  event.preventDefault();
                  event.stopPropagation();
                  runAction(action);
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
                className={actionClass(action.tone ?? 'view')}
              >
                {action.label}
              </button>
            ))}
            {actions.length === 0 && immutableHint && (
              <span className="px-3 py-2 text-left text-xs text-slate-400">{immutableHint}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

function actionClass(kind: 'pay' | 'cancel' | 'view') {
  if (kind === 'pay') {
    return 'rounded px-3 py-2 text-left text-sm font-medium text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30';
  }
  if (kind === 'cancel') {
    return 'rounded px-3 py-2 text-left text-sm font-medium text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30';
  }
  return 'rounded px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30';
}
