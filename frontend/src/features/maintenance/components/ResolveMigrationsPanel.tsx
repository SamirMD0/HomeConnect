import React, { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, HelpCircle, Loader2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useResolveMigrations } from '../hooks/useMaintenance';
import { PendingMigration, PresenceVerdict } from '../types/maintenance.types';

/**
 * For a database whose schema was brought up to date by hand.
 *
 * Those updates were never recorded, so "Apply pending updates" dies on the first
 * one re-creating a table that already exists — and never reaches the repairs
 * queued behind it. Recording them here runs none of their SQL; it only writes
 * the history rows the manual work skipped.
 *
 * Anything the database is demonstrably missing is refused by the server, so this
 * cannot be used to hide a genuinely missing table.
 */
export const ResolveMigrationsPanel: React.FC<{ migrations: PendingMigration[] }> = ({ migrations }) => {
  const resolve = useResolveMigrations();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const resolvable = useMemo(() => migrations.filter((entry) => entry.verdict !== 'MISSING'), [migrations]);
  const alreadyPresent = useMemo(() => migrations.filter((entry) => entry.verdict === 'PRESENT'), [migrations]);

  if (migrations.length === 0) return null;

  const toggle = (name: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const canSubmit = selected.size > 0 && confirmation === 'RESOLVE' && password.length > 0 && !resolve.isPending;

  const submit = async () => {
    try {
      const outcomes = await resolve.mutateAsync({ accountPassword: password, migrationNames: [...selected] });
      setPassword('');
      setConfirmation('');
      setSelected(new Set());
      const resolved = outcomes.filter((outcome) => outcome.status === 'RESOLVED');
      const rejected = outcomes.filter((outcome) => outcome.status !== 'RESOLVED');
      if (rejected.length) toast.error(rejected[0].message);
      if (resolved.length) toast.success(`${resolved.length} update${resolved.length === 1 ? '' : 's'} recorded / تم التسجيل`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <ClipboardCheck className="h-4 w-4" /> Already updated by hand? / تم التحديث يدوياً؟
      </h3>
      <p className="mt-1 text-xs text-slate-600">
        If these updates were applied with a repair script, record them here. This writes only the
        history entry — none of the update&apos;s own SQL runs. Items the database is missing cannot be recorded.
      </p>

      <ul className="mt-3 space-y-1.5">
        {migrations.map((entry) => {
          const blocked = entry.verdict === 'MISSING';
          return (
            <li key={entry.name}>
              <label className={`flex items-start gap-2.5 rounded-md border p-2.5 ${
                blocked ? 'cursor-not-allowed border-red-200 bg-red-50' : 'cursor-pointer border-slate-200 hover:bg-slate-50'
              }`}>
                <input
                  type="checkbox"
                  disabled={blocked}
                  checked={selected.has(entry.name)}
                  onChange={() => toggle(entry.name)}
                  aria-label={`Record ${entry.name} as already applied`}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 disabled:opacity-40"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs text-slate-800">{entry.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-2">
                    <VerdictBadge verdict={entry.verdict} />
                    <span className="text-[11px] text-slate-500">{entry.reason}</span>
                  </span>
                  {entry.missing.length > 0 && (
                    <span className="mt-1 block font-mono text-[11px] text-red-700">
                      {entry.missing.slice(0, 6).join(', ')}{entry.missing.length > 6 ? ` +${entry.missing.length - 6} more` : ''}
                    </span>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {resolvable.length > 0 && (
        <button
          type="button"
          onClick={() => setSelected(new Set(alreadyPresent.map((entry) => entry.name)))}
          disabled={alreadyPresent.length === 0}
          className="mt-3 text-xs font-semibold text-emerald-700 hover:underline disabled:text-slate-400 disabled:no-underline"
        >
          Select the {alreadyPresent.length} already in the database
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
        <label className="text-xs font-medium text-slate-600">
          Account password / كلمة المرور
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 block h-9 w-56 rounded-md border border-slate-300 px-2 text-sm"
          />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Type RESOLVE to confirm
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value.toUpperCase())}
            placeholder="RESOLVE"
            className="mt-1 block h-9 w-40 rounded-md border border-slate-300 px-2 font-mono text-sm"
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-700 disabled:opacity-50"
        >
          {resolve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Record as applied ({selected.size}) / تسجيل
        </button>
      </div>
    </div>
  );
};

const VerdictBadge: React.FC<{ verdict: PresenceVerdict }> = ({ verdict }) => {
  const style = verdict === 'PRESENT'
    ? { className: 'bg-emerald-50 text-emerald-700', icon: <CheckCircle2 className="h-3 w-3" />, label: 'In database' }
    : verdict === 'MISSING'
      ? { className: 'bg-red-100 text-red-700', icon: <XCircle className="h-3 w-3" />, label: 'Not in database' }
      : { className: 'bg-slate-100 text-slate-600', icon: <HelpCircle className="h-3 w-3" />, label: 'Cannot check' };

  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${style.className}`}>
      {style.icon}{style.label}
    </span>
  );
};

function errorMessage(error: unknown): string {
  const response = (error as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response;
  return response?.data?.error?.message ?? response?.data?.message ?? 'Could not record the updates.';
}
