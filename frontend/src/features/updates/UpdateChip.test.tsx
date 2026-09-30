import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '../../hooks/useAuth';
import { UpdateChip } from './UpdateChip';
import { useUpdater } from './useUpdater';

vi.mock('../../hooks/useAuth', () => ({ useAuth: vi.fn() }));
vi.mock('./useUpdater', () => ({ useUpdater: vi.fn() }));

describe('UpdateChip', () => {
  it('shows an available update to an admin', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { role: 'ADMIN' } } as ReturnType<typeof useAuth>);
    vi.mocked(useUpdater).mockReturnValue({ status: { state: 'available', version: '2.0.3' }, supported: true, busyReasons: [], checkNow: vi.fn(), installNow: vi.fn() });
    const html = renderToStaticMarkup(<MemoryRouter><UpdateChip /></MemoryRouter>);
    expect(html).toContain('Update available: 2.0.3');
    expect(html).toContain('/settings#updates');
  });

  it('hides the chip from employees', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { role: 'EMPLOYEE' } } as ReturnType<typeof useAuth>);
    vi.mocked(useUpdater).mockReturnValue({ status: { state: 'available', version: '2.0.3' }, supported: true, busyReasons: [], checkNow: vi.fn(), installNow: vi.fn() });
    expect(renderToStaticMarkup(<MemoryRouter><UpdateChip /></MemoryRouter>)).toBe('');
  });
});
