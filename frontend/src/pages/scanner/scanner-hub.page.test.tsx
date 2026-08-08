import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock, authState } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn() },
  authState: { user: { id: 'user-1', fullName: 'Master Administrator', role: 'ADMIN' } },
}));

vi.mock('../../services/api', () => ({ api: apiMock }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => authState }));

import { ScannerHubPage } from './ScannerHubPage';

/**
 * A static render, because this project has no jsdom: it proves the page
 * assembles, that its hooks can run, and — the part worth guarding — that the
 * admin-only controls are decided at page level and not merely inside the
 * panels that were tested in isolation.
 */
function render(node: ReactNode): string {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMock.get.mockResolvedValue({ data: { data: null } });
  apiMock.post.mockResolvedValue({ data: { data: null } });
  authState.user = { id: 'user-1', fullName: 'Master Administrator', role: 'ADMIN' };
});

describe('ScannerHubPage', () => {
  it('renders before any status has loaded', () => {
    const html = render(<ScannerHubPage />);
    expect(html).toContain('مركز المسح');
    expect(html).toContain('Scanner Hub');
  });

  it('offers a scan box on the hub itself', () => {
    const html = render(<ScannerHubPage />);
    expect(html).toContain('امسح الباركود أو رمز المنتج');
  });

  it('shows the paired-devices panel with an empty state', () => {
    expect(render(<ScannerHubPage />)).toContain('لا توجد هواتف مرتبطة');
  });

  it('reads as off until a status arrives, rather than guessing', () => {
    expect(render(<ScannerHubPage />)).toContain('ماسح الشبكة متوقف');
  });

  it('gives an admin the control to turn the scanner on', () => {
    expect(render(<ScannerHubPage />)).toContain('تشغيل');
  });

  /**
   * The page-level half of the permission boundary. The panels enforce it too,
   * but this asserts the page passes the right value down.
   */
  it('gives an employee no controls and explains why', () => {
    authState.user = { id: 'user-2', fullName: 'Shop Employee', role: 'EMPLOYEE' };
    const html = render(<ScannerHubPage />);
    expect(html).toContain('يمكن للمدير فقط');
    expect(html).not.toContain('تشغيل');
  });

  it('never renders a pairing code before one is generated', () => {
    const html = render(<ScannerHubPage />);
    expect(html).not.toContain('رمز الربط');
  });

  it('issues no request during render', () => {
    render(<ScannerHubPage />);
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});
