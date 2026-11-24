import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import type { UpdaterStatus } from '../../types/updater';
import { useUpdater } from './useUpdater';

const currentVersion = typeof __APP_VERSION__ === 'undefined' ? 'unknown' : __APP_VERSION__;

function statusLabel(status: UpdaterStatus, supported: boolean) {
  if (!supported) return 'Unavailable';
  switch (status.state) {
    case 'checking': return 'Checking…';
    case 'available': return `Update available (${status.version ?? 'unknown'})`;
    case 'downloading': return `Downloading ${status.version ?? 'update'} — ${Math.round(status.progressPct ?? 0)}%`;
    case 'ready': return `Update ready (${status.version ?? 'unknown'})`;
    case 'preparing': return 'Saving the current version before updating…';
    case 'error': return status.error === 'install-failed'
      ? 'Update not installed. Your current version is still available.'
      : 'Could not check for updates';
    default: return status.lastCheckedAt ? 'Up to date' : 'Not checked yet';
  }
}

export function UpdateSettingsPanel() {
  const { user } = useAuth();
  const { status, supported, checkNow, installNow } = useUpdater();
  const admin = user?.role === 'ADMIN';
  const checkedAt = status.lastCheckedAt ? new Date(status.lastCheckedAt) : null;
  const lastChecked = checkedAt && !Number.isNaN(checkedAt.getTime()) ? checkedAt.toLocaleString() : '—';
  const handleInstall = async () => {
    const outcome = await installNow();
    if (!outcome.ok) toast(outcome.blocked.map((reason) => `• ${reason}`).join('\n') + '\nPlease finish, then try again.', { icon: '⏳', duration: 4000 });
  };

  return (
    <section id="updates" className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      {admin && <h2 className="mb-4 text-lg font-semibold text-slate-900">Updates</h2>}
      <dl className="grid gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm font-medium text-slate-500">Current version</dt>
          <dd className="mt-1 font-semibold text-slate-900">{currentVersion}</dd>
        </div>
        {admin && <>
          <div>
            <dt className="text-sm font-medium text-slate-500">Update status</dt>
            <dd className="mt-1 font-semibold text-slate-900">{statusLabel(status, supported)}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-slate-500">Last checked</dt>
            <dd className="mt-1 text-sm text-slate-700">{lastChecked}</dd>
          </div>
        </>}
      </dl>
      {admin && <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => void checkNow()} disabled={!supported || status.state === 'checking'} className="rounded-md border border-brand-600 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50">
          {status.state === 'checking' ? 'Checking…' : 'Check now'}
        </button>
        {status.state === 'ready' && <button type="button" onClick={() => void handleInstall()} className="rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800">
          Install &amp; Restart
        </button>}
      </div>}
      {/* Release notes fetching is out of Phase 2 scope. */}
    </section>
  );
}
