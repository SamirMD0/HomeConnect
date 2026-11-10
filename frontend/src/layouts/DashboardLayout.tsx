import React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LocalStatusIndicator } from '../features/system/components/LocalStatusIndicator';
import { Sidebar } from './Sidebar';
import { PageJump } from './PageJump';
import { UserAvatar } from './TopBarActions';
import { BranchScopeProvider, useBranchScope } from '../features/branches/scope/BranchScopeProvider';
import { BranchSelector } from '../features/branches/scope/BranchSelector';

const COLLAPSED_STORAGE_KEY = 'homeconnect.sidebar.collapsed';

/** Below this width the expanded sidebar covers the page instead of pushing it. */
function isNarrowViewport(): boolean {
  return window.innerWidth < 1024;
}

function readInitialCollapsed(): boolean {
  if (isNarrowViewport()) return true;
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export const DashboardLayout: React.FC = () => (
  <BranchScopeProvider>
    <DashboardShell />
  </BranchScopeProvider>
);

const DashboardShell: React.FC = () => {
  const { user, logout } = useAuth();
  const { ready: branchScopeReady } = useBranchScope();
  const navigate = useNavigate();
  const location = useLocation();
  const mainRef = React.useRef<HTMLElement>(null);
  const [collapsed, setCollapsed] = React.useState<boolean>(readInitialCollapsed);

  React.useEffect(() => {
    if (isNarrowViewport()) return;
    try {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      /* private mode / storage disabled — keep state in memory only */
    }
  }, [collapsed]);

  // <main> is the scroll container, so a new page must start from its top.
  React.useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    if (isNarrowViewport()) setCollapsed(true);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-backdrop flex h-screen overflow-hidden bg-background print:h-auto print:overflow-visible font-sans text-foreground">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
        onLogout={handleLogout}
      />

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden print:overflow-visible">
        <header className="no-print z-30 flex h-[4.5rem] shrink-0 items-center justify-between gap-3 px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <PageJump />
            <BranchSelector />
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden items-center gap-4 xl:flex">
              <LocalStatusIndicator />
              <span className="whitespace-nowrap text-sm font-medium text-slate-600">
                {new Date().toLocaleDateString('en-GB', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            </div>

            <UserAvatar name={user?.fullName} />
          </div>
        </header>

        <main ref={mainRef} className="app-main glass-panel relative mb-2 mr-2 flex-1 overflow-y-auto p-4 max-lg:ml-2 lg:mb-3 lg:mr-3 lg:p-6">
          {branchScopeReady ? (
            <Outlet />
          ) : (
            <div role="status" className="flex h-40 items-center justify-center text-sm text-slate-500">
              Loading branches…
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
