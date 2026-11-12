import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '../lib/cn';
import { useAuth } from '../hooks/useAuth';
import { NAVIGATION, isItemVisible, isPathActive, type NavigationItem } from './navigation';
import { UpdateChip } from '../features/updates/UpdateChip';
import { useUnlinkedBillsCount } from '../features/suppliers/hooks/useUnlinkedBillsCount';

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
}

/**
 * Primary application navigation. Two states:
 *  - expanded (272px): section headings + icons + labels + role-gated items.
 *  - rail (72px): icons only, native tooltip via the `title` attribute.
 * Width changes are a CSS transition on the shell; there's no framer-motion
 * animation of the layout, so the main content doesn't reflow every frame.
 */
export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle, onLogout }) => {
  const { user } = useAuth();
  const location = useLocation();
  const role = user?.role;
  const unlinkedBills = useUnlinkedBillsCount();
  const toggleLabel = collapsed ? 'Expand navigation' : 'Collapse navigation';
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  const toggle = (
    <button
      type="button"
      onClick={onToggle}
      aria-label={toggleLabel}
      aria-expanded={!collapsed}
      title={toggleLabel}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500',
        'transition-colors hover:bg-white/60 hover:text-slate-800',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60'
      )}
    >
      <ToggleIcon className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );

  return (
    <aside
      className={cn(
        'no-print relative z-20 flex shrink-0 flex-col overflow-hidden',
        'glass-panel m-2 rounded-2xl border text-slate-700 lg:m-3',
        'transition-[width] duration-150 ease-out motion-reduce:transition-none',
        collapsed ? 'w-[4.5rem]' : 'w-[17rem] max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:bg-slate-100 max-lg:shadow-xl'
      )}
    >
      <div
        className={cn(
          'flex h-[4.5rem] shrink-0 items-center gap-2.5 px-4',
          collapsed && 'justify-center px-0'
        )}
      >
        <img src="/homeconnects-logo.webp" alt="" className="h-11 w-11 shrink-0 object-contain" />
        {!collapsed && (
          <>
            <p className="min-w-0 flex-1 truncate text-[17px] font-bold tracking-tight text-slate-900">Home Connect</p>
            {toggle}
          </>
        )}
      </div>

      {collapsed && <div className="flex justify-center pb-2">{toggle}</div>}

      <nav
        aria-label="Primary navigation"
        className="flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-3 pb-4 pt-2 [scrollbar-width:thin]"
      >
        {NAVIGATION.map((section) => {
          const items = section.items.filter((item) => isItemVisible(item, role));
          if (items.length === 0) return null;
          return (
            <div key={section.id}>
              {!collapsed && (
                <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {section.heading.en}
                </p>
              )}
              {collapsed && <div className="mx-2 mb-2 h-px bg-slate-300/60" aria-hidden="true" />}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <SidebarNavItem
                    key={item.key}
                    item={item}
                    active={isPathActive(item.path, location.pathname)}
                    collapsed={collapsed}
                    badge={item.key === 'suppliers' ? unlinkedBills : 0}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {!collapsed && <UpdateChip />}
      <SidebarAccountRow collapsed={collapsed} onLogout={onLogout} />
    </aside>
  );
};

interface SidebarNavItemProps {
  item: NavigationItem;
  active: boolean;
  collapsed: boolean;
  /** Items waiting for attention, e.g. unlinked supplier bills. */
  badge?: number;
}

const SidebarNavItem: React.FC<SidebarNavItemProps> = ({ item, active, collapsed, badge = 0 }) => {
  const Icon = item.icon;
  const badgeText = badge > 0 ? `${badge > 99 ? '99+' : badge}` : '';
  const accessibleName = `${item.label.en} / ${item.label.ar}${badge > 0 ? `, ${badge} unlinked bill${badge === 1 ? '' : 's'}` : ''}`;
  return (
    <li>
      <Link
        to={item.path}
        aria-current={active ? 'page' : undefined}
        aria-label={accessibleName}
        title={collapsed ? accessibleName : undefined}
        className={cn(
          'group relative flex items-center gap-3 rounded-lg text-sm outline-none',
          'transition-colors duration-150 motion-reduce:transition-none',
          collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
          active ? 'bg-white/80 text-brand-700 shadow-sm ring-1 ring-white' : 'text-slate-700 hover:bg-white/55 hover:text-slate-900',
          'focus-visible:ring-2 focus-visible:ring-ring/60'
        )}
      >
        <Icon
          className={cn(
            'h-[18px] w-[18px] shrink-0',
            active ? 'text-brand-600' : 'text-slate-500 group-hover:text-slate-700'
          )}
        />
        {!collapsed && (
          <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
            <span className={cn('truncate', active ? 'font-semibold' : 'font-medium')}>{item.label.en}</span>
            <span
              dir="rtl"
              className={cn('shrink-0 text-[11px] font-normal', active ? 'text-brand-700/80' : 'text-slate-500')}
            >
              {item.label.ar}
            </span>
          </span>
        )}
        {badgeText && (
          <span
            aria-hidden="true"
            className={cn(
              'rounded-full bg-amber-500 px-1.5 text-[11px] font-semibold leading-5 text-white',
              collapsed && 'absolute right-1 top-0.5'
            )}
          >
            {badgeText}
          </span>
        )}
      </Link>
    </li>
  );
};

interface SidebarAccountRowProps {
  collapsed: boolean;
  onLogout: () => void;
}

const SidebarAccountRow: React.FC<SidebarAccountRowProps> = ({ collapsed, onLogout }) => {
  const { user } = useAuth();
  const initial = user?.fullName?.charAt(0)?.toUpperCase() ?? '?';
  const signOutClasses = cn(
    'flex shrink-0 items-center justify-center rounded-lg text-slate-500',
    'transition-colors duration-150 motion-reduce:transition-none',
    'hover:bg-red-50 hover:text-red-600',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60'
  );
  return (
    <div className="shrink-0 border-t border-white/60 p-3">
      <div className={cn('flex items-center gap-2.5', collapsed && 'justify-center')}>
        <div
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-sm font-bold text-brand-700"
        >
          {initial}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-semibold text-slate-900">{user?.fullName}</p>
            <p className="truncate text-xs capitalize text-slate-500">
              {user?.role?.toLowerCase()} · v{__APP_VERSION__}
            </p>
          </div>
        )}
        {!collapsed && (
          <button type="button" onClick={onLogout} aria-label="Sign out" title="Sign out" className={cn(signOutClasses, 'h-8 w-8')}>
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
      {collapsed && (
        <button type="button" onClick={onLogout} aria-label="Sign out" title="Sign out" className={cn(signOutClasses, 'mt-2 h-9 w-full')}>
          <LogOut className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
