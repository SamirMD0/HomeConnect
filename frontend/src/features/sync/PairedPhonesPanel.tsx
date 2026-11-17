import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { PairingQrCode } from '../scanner/components/PairingQrCode';
interface Choice { id: string; fullName: string; branches: { id: string; name: string }[] }
interface Device { id: string; name: string; userName: string; branchIds: string[]; lastSeenAt: string | null; revokedAt: string | null;pinSet?:boolean;lastUnlockAt?:string|null }
export function DeviceSecurityStatus({pinSet,lastUnlockAt}:Pick<Device,'pinSet'|'lastUnlockAt'>){return <p className="text-slate-500">PIN set: {pinSet?'Yes':'No'} · Last unlock: {lastUnlockAt?new Date(lastUnlockAt).toLocaleString():'Never'}</p>;}
export function PairedPhonesPanel() {
  const [choices, setChoices] = useState<Choice[]>([]), [devices, setDevices] = useState<Device[]>([]);
  const [userId, setUserId] = useState(''), [branches, setBranches] = useState<string[]>([]), [name, setName] = useState('Phone');
  const [qr, setQr] = useState<string | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const selected = choices.find(user => user.id === userId);
  const loadDevices = async () => setDevices((await api.get('/sync/worker/devices')).data.data);
  useEffect(() => { void api.get('/sync/worker/devices/options').then(response => setChoices(response.data.data)).catch(() => setError('Could not load users.')); }, []);
  useEffect(() => { void loadDevices().catch(() => setError('Could not load paired phones.')); }, []);
  useEffect(() => { if (!qr) return; const timer = setTimeout(() => setQr(null), 5 * 60000); return () => clearTimeout(timer); }, [qr]);
  const pair = async () => {
    setBusy(true); setError(''); setQr(null);
    try { const response = await api.post('/sync/worker/devices', { name, userId, branchIds: branches }); setQr(JSON.stringify(response.data.data)); await loadDevices(); }
    catch { setError('Could not pair the phone. Check the relay settings and internet connection.'); }
    finally { setBusy(false); }
  };
  const revoke = async (id: string) => {
    setBusy(true); setError('');
    try { await api.post(`/sync/worker/devices/${id}/revoke`); setQr(null); await loadDevices(); }
    catch { setError('Could not revoke this phone. Please try again.'); }
    finally { setBusy(false); }
  };
  const input = 'mt-1 block min-h-11 w-full rounded-md border border-slate-300 px-3 py-2 text-sm';
  return <div className="mt-6 space-y-4 border-t border-slate-200 pt-5">
    <h3 className="font-semibold text-slate-900">Pair a phone</h3>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm text-slate-700">Phone name<input className={input} value={name} maxLength={200} onChange={event => setName(event.target.value)} /></label>
      <label className="text-sm text-slate-700">User<select className={input} value={userId} onChange={event => { setUserId(event.target.value); setBranches([]); }}><option value="">Choose user</option>{choices.map(user => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></label>
    </div>
    <fieldset><legend className="text-sm font-medium text-slate-700">Branches</legend><div className="flex flex-wrap gap-4">{selected?.branches.map(branch => <label key={branch.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={branches.includes(branch.id)} onChange={event => setBranches(event.target.checked ? [...branches, branch.id] : branches.filter(id => id !== branch.id))} />{branch.name}</label>)}</div></fieldset>
    <button type="button" disabled={busy || !userId || !branches.length || !name.trim()} onClick={() => void pair()} className="min-h-11 rounded-md border border-brand-600 px-4 py-2 text-sm font-medium text-brand-700 disabled:opacity-50">{busy ? 'Please wait…' : 'Create pairing QR'}</button>
    {qr && <div role="dialog" aria-modal="false" aria-label="Pair this phone" className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4"><PairingQrCode url={qr} size={320} label="Cloud phone pairing QR" /><p className="text-sm text-slate-600">Scan once. This code disappears in 5 minutes.</p><button type="button" onClick={() => setQr(null)} className="min-h-11 rounded-md border border-slate-300 px-4 py-2 text-sm">Close QR</button></div>}
    <div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Paired phones</h3><button type="button" disabled={busy} onClick={() => void loadDevices().catch(() => setError('Could not load paired phones.'))} className="min-h-11 px-3 text-sm text-brand-700">Refresh phones</button></div>
    <ul className="divide-y divide-slate-200">{devices.map(device => <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="text-sm"><p className="font-medium">{device.name} · {device.userName}</p><p className="text-slate-500">{device.branchIds.map(id => choices.flatMap(user => user.branches).find(branch => branch.id === id)?.name ?? id).join(', ')}</p><p className="text-slate-500">{device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : 'Not seen yet'}{device.revokedAt ? ' · Revoked' : ''}</p><DeviceSecurityStatus pinSet={device.pinSet} lastUnlockAt={device.lastUnlockAt}/></div><button type="button" disabled={busy || !!device.revokedAt} onClick={() => void revoke(device.id)} className="min-h-11 rounded-md px-3 text-sm text-red-700 disabled:opacity-50">Revoke</button></li>)}</ul>
  </div>;
}
