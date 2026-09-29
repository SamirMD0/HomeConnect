import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PanelLeft, PanelLeftClose } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { LocalStatusIndicator } from '../features/system/components/LocalStatusIndicator';
import { Sidebar } from './Sidebar';
import { findActiveItem } from './navigation';

const COLLAPSED_STORAGE_KEY = 'homeconnect.sidebar.collapsed';

function readInitialCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export const DashboardLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = React.useState<boolean>(readInitialCollapsed);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* private mode / storage disabled — keep state in memory only */
    }
  }, [collapsed]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const activeItem = findActiveItem(location.pathname, user?.role);
  const pageTitle = activeItem?.label.en ?? 'Dashboard';

  return (
    <div className="flex min-h-screen overflow-hidden bg-slate-50 font-sans text-slate-900">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
        onLogout={handleLogout}
      />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="no-print z-10 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCollapsed((prev) => !prev)}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              aria-expanded={!collapsed}
              className="-ml-2 flex h-9 w-9 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            >
              {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>

            <h2 className="hidden text-lg font-semibold text-slate-800 sm:block">{pageTitle}</h2>
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            <LocalStatusIndicator />
            <span className="text-sm font-medium text-slate-600">
              {new Date().toLocaleDateString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-500">
              v{__APP_VERSION__}
            </span>
          </div>
        </header>

        <main className="relative flex-1 overflow-y-auto p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
