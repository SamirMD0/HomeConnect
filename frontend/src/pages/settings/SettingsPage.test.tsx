import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

const { authMock } = vi.hoisted(() => ({
  authMock: {
    user: { id: 'admin', username: 'admin', fullName: 'Admin', role: 'ADMIN' },
  },
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => authMock,
}));

vi.mock('../../features/backup/components/BackupRestorePanel', () => ({
  BackupRestorePanel: () => <section>Backup panel rendered</section>,
}));

vi.mock('../../features/diagnostics/components/DiagnosticsPanel', () => ({
  DiagnosticsPanel: () => <section>Diagnostics panel rendered</section>,
}));

describe('SettingsPage', () => {
  beforeEach(() => {
    authMock.user = { id: 'admin', username: 'admin', fullName: 'Admin', role: 'ADMIN' };
  });

  it('renders backup controls for admins', () => {
    const html = renderToStaticMarkup(<SettingsPage />);

    expect(html).toContain('Settings');
    expect(html).toContain('Backup panel rendered');
  });

  it('hides backup controls from non-admin users', () => {
    authMock.user = { id: 'employee', username: 'employee', fullName: 'Employee', role: 'EMPLOYEE' };

    const html = renderToStaticMarkup(<SettingsPage />);

    expect(html).toContain('Settings are admin-only');
    expect(html).not.toContain('Backup panel rendered');
  });
});
