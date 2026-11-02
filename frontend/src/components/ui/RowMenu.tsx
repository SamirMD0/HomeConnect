import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { MoreVertical, type LucideIcon } from 'lucide-react';
import { englishLabel } from '../../shared/labels/business-labels';
import { cn } from '../../lib/cn';

export interface RowMenuItem {
  label: string;
  icon?: LucideIcon;
  tone?: 'default' | 'primary' | 'danger';
  /** Navigates instead of running `onSelect`. */
  to?: string;
  onSelect?: () => void;
}

const MENU_WIDTH = 256;
const MENU_GAP = 6;
const VIEWPORT_EDGE = 8;
const ITEM_HEIGHT = 44;

const TONES: Record<NonNullable<RowMenuItem['tone']>, string> = {
  default: 'text-slate-800 hover:bg-slate-100 focus-visible:bg-slate-100',
  primary: 'text-brand-700 hover:bg-brand-50 focus-visible:bg-brand-50',
  danger: 'text-red-700 hover:bg-red-50 focus-visible:bg-red-50',
};

/** Prefers below the anchor, flips above when there is no room, and stays on screen. */
export function getRowMenuPosition(
  anchor: { top: number; left: number; bottom: number },
  menuHeight: number,
  viewport: { width: number; height: number }
): { top: number; left: number } {
  const below = anchor.bottom + MENU_GAP;
  const top = below + menuHeight <= viewport.height - VIEWPORT_EDGE
    ? below
    : Math.max(VIEWPORT_EDGE, anchor.top - MENU_GAP - menuHeight);
  const left = Math.max(VIEWPORT_EDGE, Math.min(anchor.left, viewport.width - MENU_WIDTH - VIEWPORT_EDGE));
  return { top, left };
}

/** The menu's list of actions. English only, whatever the label it is given. */
export const RowMenuList = React.forwardRef<
  HTMLDivElement,
  { items: RowMenuItem[]; label: string; emptyHint?: string; style?: React.CSSProperties; className?: string; onPick?: () => void }
>(function RowMenuList({ items, label, emptyHint, style, className, onPick }, ref) {
  const moveFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const entries = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const current = entries.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    entries[(current + step + entries.length) % entries.length]?.focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      style={style}
      onKeyDown={moveFocus}
      // A portal still bubbles React events to the row, which may have its own handlers.
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      className={cn('rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl', className)}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const text = englishLabel(item.label);
        const classes = cn(
          'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[15px] font-medium outline-none transition-colors',
          TONES[item.tone ?? 'default']
        );
        const content = (
          <>
            {Icon && <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />}
            <span className="min-w-0 flex-1">{text}</span>
          </>
        );
        return item.to ? (
          <Link key={text} role="menuitem" to={item.to} onClick={onPick} className={classes}>{content}</Link>
        ) : (
          <button
            key={text}
            type="button"
            role="menuitem"
            onClick={() => {
              onPick?.();
              item.onSelect?.();
            }}
            className={classes}
          >
            {content}
          </button>
        );
      })}
      {items.length === 0 && emptyHint && <p className="px-3 py-2.5 text-sm text-slate-600">{emptyHint}</p>}
    </div>
  );
});

/** What a custom menu body must pass on to its `RowMenuList`. */
export type RowMenuListProps = Pick<React.ComponentProps<typeof RowMenuList>, 'style' | 'className' | 'onPick' | 'label' | 'emptyHint'> & { ref: React.Ref<HTMLDivElement> };

export interface RowMenuProps {
  /** Omit when `renderList` builds the items, for menus that load them only once opened. */
  items?: RowMenuItem[];
  /** Renders the open menu instead of `items`. */
  renderList?: (list: RowMenuListProps) => React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accessible name, for example "Actions for Air conditioner". */
  label?: string;
  /** Shown when there is nothing to do on this row. */
  emptyHint?: string;
}

/**
 * The actions menu for a table row or card. It opens from its button or by
 * right-clicking anywhere on the row, and renders in a portal so a scrolling
 * table can't clip it. Right-click leaves form fields and selected text alone,
 * so copying from a row still works.
 */
export const RowMenu: React.FC<RowMenuProps> = ({ items = [], renderList, open, onOpenChange, label = 'Open row actions', emptyHint }) => {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pointRef = useRef<{ x: number; y: number } | null>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    const row = triggerRef.current?.closest('tr, article');
    if (!row) return undefined;
    const handleContextMenu = (event: Event) => {
      const mouse = event as MouseEvent;
      if ((mouse.target as Element).closest('input, textarea, select, [contenteditable="true"]')) return;
      if (window.getSelection()?.toString()) return;
      mouse.preventDefault();
      pointRef.current = { x: mouse.clientX, y: mouse.clientY };
      setPosition(null);
      onOpenChangeRef.current(true);
    };
    row.addEventListener('contextmenu', handleContextMenu);
    return () => row.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onOpenChangeRef.current(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      onOpenChangeRef.current(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      pointRef.current = null;
      setPosition(null);
      return undefined;
    }
    const update = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const point = pointRef.current;
      const rect = trigger.getBoundingClientRect();
      const anchor = point
        ? { top: point.y, left: point.x, bottom: point.y }
        : { top: rect.top, left: rect.right - MENU_WIDTH, bottom: rect.bottom };
      const height = menuRef.current?.offsetHeight || Math.max(52, items.length * ITEM_HEIGHT + 14);
      setPosition(getRowMenuPosition(anchor, height, { width: window.innerWidth, height: window.innerHeight }));
    };
    const handleScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      // A menu opened at the cursor has nothing to follow once the row moves away.
      if (pointRef.current) onOpenChangeRef.current(false);
      else update();
    };
    update();
    const frame = window.requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [items.length, open]);

  const listProps: RowMenuListProps = {
    ref: menuRef,
    label,
    emptyHint,
    onPick: () => onOpenChange(false),
    style: position ? { top: position.top, left: position.left, width: MENU_WIDTH } : undefined,
    className: 'fixed z-50 max-h-[calc(100vh-1rem)] overflow-y-auto',
  };

  const placed = Boolean(position);
  useEffect(() => {
    if (open && placed) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [open, placed]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title="Actions (or right-click the row)"
        onClick={() => {
          pointRef.current = null;
          onOpenChange(!open);
        }}
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white text-slate-700 shadow-sm transition-colors',
          'hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          open ? 'border-brand-400 bg-brand-50 text-brand-700' : 'border-slate-300'
        )}
      >
        <MoreVertical className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && position && typeof document !== 'undefined' && createPortal(
        renderList
          ? renderList(listProps)
          : <RowMenuList items={items} {...listProps} />,
        document.body
      )}
    </>
  );
};
