import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

export const LEDGER_CORRECTION_ENABLED = false;

export interface LedgerActionItem {
  label: string;
  onClick: () => void;
  tone?: 'pay' | 'cancel' | 'view';
}

interface MenuPosition {
  top: number;
  left: number;
}

const MENU_WIDTH = 192;
const MENU_GAP = 8;
const VIEWPORT_EDGE = 8;

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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const isOpen = openMenuKey === menuKey;
  const runAction = (action: LedgerActionItem) => {
    action.onClick();
    onOpenChange(null);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
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

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      if (trigger.getClientRects().length === 0) {
        setMenuPosition(null);
        return;
      }

      const estimatedHeight = Math.max(48, (actions.length || 1) * 40 + 8);
      const menuHeight = menuRef.current?.offsetHeight || estimatedHeight;
      setMenuPosition(
        getLedgerMenuPosition(trigger.getBoundingClientRect(), menuHeight, {
          width: window.innerWidth,
          height: window.innerHeight,
        })
      );
    };

    updatePosition();
    const animationFrame = window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [actions.length, isOpen]);

  const menu = isOpen && menuPosition && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ top: menuPosition.top, left: menuPosition.left, width: MENU_WIDTH }}
          className="fixed z-50 rounded-md border border-slate-200 bg-white p-1 shadow-xl"
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
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => onOpenChange(isOpen ? null : menuKey)}
        className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition-all hover:border-yellow-300 hover:bg-gray-600 hover:text-yellow-300 hover:shadow-[0_0_12px_rgba(250,204,21,0.4)] focus:outline-none focus:ring-2 focus:ring-yellow-300/50"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        <span className="sr-only">Open row actions</span>
      </button>
      {menu}
    </div>
  );
};

export function getLedgerMenuPosition(
  trigger: Pick<DOMRect, 'top' | 'right' | 'bottom'>,
  menuHeight: number,
  viewport: { width: number; height: number }
): MenuPosition {
  const belowTop = trigger.bottom + MENU_GAP;
  const roomBelow = belowTop + menuHeight <= viewport.height - VIEWPORT_EDGE;
  const top = roomBelow
    ? belowTop
    : Math.max(VIEWPORT_EDGE, trigger.top - MENU_GAP - menuHeight);
  const left = Math.min(
    Math.max(VIEWPORT_EDGE, trigger.right - MENU_WIDTH),
    Math.max(VIEWPORT_EDGE, viewport.width - MENU_WIDTH - VIEWPORT_EDGE)
  );

  return { top, left };
}

function actionClass(kind: 'pay' | 'cancel' | 'view') {
  if (kind === 'pay') {
    return 'rounded px-3 py-2 text-left text-sm font-medium text-emerald-700 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30';
  }
  if (kind === 'cancel') {
    return 'rounded px-3 py-2 text-left text-sm font-medium text-amber-700 hover:bg-amber-50 focus:outline-none focus:ring-2 focus:ring-amber-500/30';
  }
  return 'rounded px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30';
}
