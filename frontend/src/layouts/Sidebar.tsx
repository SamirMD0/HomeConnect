import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react';
import { cn } from '../lib/cn';
import { useAuth } from '../hooks/useAuth';
import { NAVIGATION, isItemVisible, isPathActive, type NavigationItem } from './navigation';

export interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
}

/**
 * Primary application navigation. Two states:
 *  - expanded (264px): section headings + icons + labels + role-gated items.
 *  - rail (64px): icons only, native tooltip via the `title` attribute.
 * Width changes are a CSS transition on the shell; there's no framer-motion
 * animation of the layout, so the main content doesn't reflow every frame.
 */
export const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle, onLogout }) => {
  const { user } = useAuth();
  const location = useLocation();
  const role = user?.role;

  return (
    <aside
      className={cn(
        'no-print relative z-20 flex shrink-0 flex-col overflow-hidden',
        'bg-slate-900 text-slate-100 shadow-xl',
        'transition-[width] duration-150 ease-out motion-reduce:transition-none',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <SidebarBrand collapsed={collapsed} />

      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        className={cn(
          'absolute right-1 top-4 z-10 flex h-6 w-6 items-center justify-center rounded-full',
          'border border-white/10 bg-slate-800 text-slate-300 shadow-sm',
          'hover:border-emerald-400/40 hover:text-emerald-300',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900'
        )}
      >
        {collapsed ? <ChevronsRight className="h-3.5 w-3.5" /> : <ChevronsLeft className="h-3.5 w-3.5" />}
      </button>

      <nav
        aria-label="Primary navigation"
        className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-2 py-4 [scrollbar-color:theme(colors.slate.700)_transparent] [scrollbar-width:thin]"
      >
        {NAVIGATION.map((section) => {
          const items = section.items.filter((item) => isItemVisible(item, role));
          if (items.length === 0) return null;
          return (
            <div key={section.id}>
              {!collapsed && (
                <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {section.heading.en}
                </p>
              )}
              {collapsed && <div className="mx-3 mb-1 h-px bg-white/5" aria-hidden="true" />}
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <SidebarNavItem
                    key={item.key}
                    item={item}
                    active={isPathActive(item.path, location.pathname)}
                    collapsed={collapsed}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <SidebarAccountRow collapsed={collapsed} onLogout={onLogout} />
    </aside>
  );
};

const SidebarBrand: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
  <div
    className={cn(
      'flex h-16 shrink-0 items-center gap-3 border-b border-white/5 px-3',
      collapsed && 'justify-center px-0'
    )}
  >
    <img
      src="/homeconnects-logo.webp"
      alt=""
      className="h-9 w-9 shrink-0 rounded-md bg-white object-contain p-1 shadow-sm"
    />
    {!collapsed && (
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-bold uppercase tracking-[0.14em] text-white">Home Connect</p>
        <p className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-400/80">ERP</p>
      </div>
    )}
  </div>
);

interface SidebarNavItemProps {
  item: NavigationItem;
  active: boolean;
  collapsed: boolean;
}

const SidebarNavItem: React.FC<SidebarNavItemProps> = ({ item, active, collapsed }) => {
  const Icon = item.icon;
  const accessibleName = `${item.label.en} / ${item.label.ar}`;
  return (
    <li>
      <Link
        to={item.path}
        aria-current={active ? 'page' : undefined}
        aria-label={accessibleName}
        title={collapsed ? accessibleName : undefined}
        className={cn(
          'group relative flex items-center gap-3 rounded-md text-sm outline-none',
          'transition-colors duration-150 motion-reduce:transition-none',
          collapsed ? 'mx-1 justify-center px-0 py-2.5' : 'mx-1 px-2.5 py-2',
          active
            ? 'bg-emerald-500/10 text-white'
            : 'text-slate-300 hover:bg-white/[0.04] hover:text-white',
          'focus-visible:ring-2 focus-visible:ring-emerald-400/70 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900'
        )}
      >
        {active && (
          <span
            aria-hidden="true"
            className={cn(
              'absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-emerald-400',
              collapsed && 'left-0.5'
            )}
          />
        )}
        <Icon
          className={cn(
            'h-[18px] w-[18px] shrink-0',
            active ? 'text-emerald-300' : 'text-slate-400 group-hover:text-slate-200'
          )}
        />
        {!collapsed && (
          <span className="min-w-0 flex-1 truncate">
            <span className={cn('block truncate leading-tight', active ? 'font-semibold text-white' : 'font-medium')}>
              {item.label.en}
            </span>
            <span
              dir="rtl"
              className="user-text block truncate text-[11px] font-normal leading-tight text-slate-400"
            >
              {item.label.ar}
            </span>
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
  return (
    <div className="shrink-0 border-t border-white/5 p-2">
      <div
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-2',
          collapsed && 'justify-center px-0'
        )}
      >
        <div
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm font-bold text-emerald-300 ring-1 ring-inset ring-emerald-400/25"
        >
          {initial}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-white">{user?.fullName}</p>
            <p className="truncate text-[11px] capitalize text-slate-400">{user?.role?.toLowerCase()}</p>
          </div>
        )}
        {!collapsed && (
          <button
            type="button"
            onClick={onLogout}
            aria-label="Sign out"
            title="Sign out"
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400',
              'transition-colors duration-150 motion-reduce:transition-none',
              'hover:bg-red-500/10 hover:text-red-300',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900'
            )}
          >
            <LogOut className="h-4 w-4" />
          </button>
        )}
      </div>
      {collapsed && (
        <button
          type="button"
          onClick={onLogout}
          aria-label="Sign out"
          title="Sign out"
          className={cn(
            'mt-1 flex h-9 w-full items-center justify-center rounded-md text-slate-400',
            'transition-colors duration-150 motion-reduce:transition-none',
            'hover:bg-red-500/10 hover:text-red-300',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900'
          )}
        >
          <LogOut className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};
