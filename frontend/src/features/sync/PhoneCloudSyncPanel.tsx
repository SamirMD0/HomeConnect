import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { PairedPhonesPanel } from './PairedPhonesPanel';

interface Status {
  enabled: boolean; relayUrl: string | null; secretConfigured: boolean;
  openingStart: string; openingEnd: string; lastSuccessAt: string | null; lastError: string | null;
}

export function PhoneCloudSyncPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [secret, setSecret] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    let mounted = true;
    const refresh = () => api.get('/sync/worker').then(response => {
      if (mounted) setStatus(previous => previous ? {
        ...previous, lastSuccessAt: response.data.data.lastSuccessAt, lastError: response.data.data.lastError,
      } : response.data.data);
    }).catch(() => { if (mounted) setError('Could not load cloud sync settings. Try opening Settings again.'); });
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!status) return;
    setPending(true); setError(''); setMessage('');
    try {
      const response = await api.put('/sync/worker', {
        enabled: status.enabled, relayUrl: status.relayUrl || null,
        openingStart: status.openingStart, openingEnd: status.openingEnd,
        ...(secret ? { workerSecret: secret } : {}),
      });
      setStatus(response.data.data); setSecret(''); setDirty(false); setMessage('Cloud sync settings saved.');
    } catch { setError('Could not save. Check the relay address, secret and opening hours, then try again.'); }
    finally { setPending(false); }
  }
  async function runNow() {
    setPending(true); setError(''); setMessage('');
    try { await api.post('/sync/worker/run-now'); setMessage('Sync queued. The last sync time will update when it finishes.'); }
    catch { setError('Could not start sync. Please try again.'); }
    finally { setPending(false); }
  }
  const input = 'mt-1 block min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-200';
  return <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="phone-cloud-heading">
    <h2 id="phone-cloud-heading" className="text-lg font-semibold text-slate-900">Phone cloud sync</h2>
    <p className="mt-1 text-sm text-slate-500">Sync phone records and queued actions while the shop PC is running.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <p role="status" className="mt-3 text-sm text-slate-700">{message || (!status && !error ? 'Loading sync settings…' : '')}</p>
    {status && <form onSubmit={event => void save(event)} onChange={() => setDirty(true)} className="mt-4 space-y-4">
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-900">
        <input type="checkbox" checked={status.enabled} onChange={event => setStatus({ ...status, enabled: event.target.checked })} /> Enable phone cloud sync
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Relay address
          <input type="url" className={input} value={status.relayUrl ?? ''} onChange={event => setStatus({ ...status, relayUrl: event.target.value })} placeholder="https://your-relay.example.com" />
        </label>
        <label className="text-sm font-medium text-slate-700">Worker secret
          <input type="password" className={input} autoComplete="new-password" value={secret} onChange={event => setSecret(event.target.value)} aria-describedby="worker-secret-help" />
          <span id="worker-secret-help" className="mt-1 block text-xs font-normal text-slate-500">{status.secretConfigured ? 'A secret is saved. Leave blank to keep it.' : 'Enter the secret configured on your relay.'}</span>
        </label>
        <label className="text-sm font-medium text-slate-700">Opening time
          <input type="time" required className={input} value={status.openingStart} onChange={event => setStatus({ ...status, openingStart: event.target.value })} />
        </label>
        <label className="text-sm font-medium text-slate-700">Closing time
          <input type="time" required className={input} value={status.openingEnd} onChange={event => setStatus({ ...status, openingEnd: event.target.value })} />
        </label>
      </div>
      <p className="text-sm text-slate-600">Last sync: {status.lastSuccessAt ? new Date(status.lastSuccessAt).toLocaleString() : 'Never'}</p>
      {status.lastError && <p role="status" className="text-sm text-amber-800">{status.lastError}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={pending} className="min-h-11 rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50">{pending ? 'Please wait…' : 'Save sync settings'}</button>
        <button type="button" disabled={pending || dirty || !status.enabled || !status.secretConfigured} onClick={() => void runNow()} className="min-h-11 rounded-md border border-brand-600 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50">Sync now</button>
      </div>
      {dirty && <p className="text-sm text-slate-500">Save your changes before syncing.</p>}
    </form>}
    {status?.secretConfigured && status.relayUrl && <PairedPhonesPanel />}
  </section>;
}
