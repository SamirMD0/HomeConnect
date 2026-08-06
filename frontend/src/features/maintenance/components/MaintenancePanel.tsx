import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, FileArchive, FolderOpen, Loader2, ShieldAlert, Stethoscope, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import { maintenanceApi } from '../api/maintenance.api';
import { useApplyRepairs, useMaintenanceOverview, usePreflightReport } from '../hooks/useMaintenance';
import { PreflightReportCard } from './PreflightReportCard';
import { PendingRepairsList } from './PendingRepairsList';
import { ResolveMigrationsPanel } from './ResolveMigrationsPanel';
import { RepairHistoryTable } from './RepairHistoryTable';

/**
 * Settings → Maintenance. Admin-only, mirroring the backup panel's shape.
 *
 * Reads are safe. The only write — applying repairs — needs the account
 * password and a typed confirmation, and is disabled with a stated reason
 * whenever a backup could not be taken.
 */
export const MaintenancePanel: React.FC = () => {
  const overview = useMaintenanceOverview();
  const [preflightRequested, setPreflightRequested] = useState(false);
  const preflight = usePreflightReport(preflightRequested);
  const applyRepairs = useApplyRepairs();

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const data = overview.data;
  const pendingCount = data?.pendingRepairs.length ?? 0;
  const migrationsPending = (data?.migrations.pending.length ?? 0) + (data?.migrations.failed.length ?? 0);
  // Migrations count too: a release can ship a schema update with no repair.
  const pendingWork = pendingCount + migrationsPending;
  const canApply = Boolean(data?.toolsAvailable) && pendingWork > 0 && confirmation === 'APPLY' && password.length > 0;

  const downloadDiagnostics = async () => {
    try {
      const blob = await maintenanceApi.exportDiagnostics();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `homeconnect-diagnostics-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Diagnostics exported / تم التصدير');
    } catch {
      toast.error('Could not export diagnostics / تعذر التصدير');
    }
  };

  const submit = async () => {
    try {
      const outcomes = await applyRepairs.mutateAsync(password);
      setPassword('');
      setConfirmation('');
      const failed = outcomes.filter((outcome) => outcome.status !== 'APPLIED');
      if (!outcomes.length) toast.success('Nothing needed applying / لا يوجد ما يلزم تطبيقه');
      else if (failed.length) toast.error(failed[0].message);
      else toast.success(`${outcomes.length} repair${outcomes.length === 1 ? '' : 's'} applied / تم التطبيق`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-start gap-3">
          <Wrench className="mt-0.5 h-6 w-6 text-emerald-600" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Maintenance / الصيانة</h2>
            <p className="mt-1 text-sm text-slate-500">
              Database updates and repairs. A verified backup is always taken first.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setPreflightRequested(true); preflight.refetch(); }}
          disabled={preflight.isFetching}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {preflight.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />}
          Run Preflight Check / فحص النظام
        </button>
      </header>

      {overview.isLoading && <p className="py-6 text-center text-sm text-slate-500">Loading…</p>}

      {overview.isError && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Unable to read maintenance status / تعذر قراءة حالة الصيانة.
        </p>
      )}

      {data && (
        <div className="mt-4 space-y-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="App version" value={data.appVersion} />
            <Stat label="Pending updates" value={String(migrationsPending)} warn={migrationsPending > 0} />
            <Stat label="Pending repairs" value={String(pendingCount)} warn={pendingCount > 0} />
            <Stat label="Backup tools" value={data.toolsAvailable ? 'Found' : 'Missing'} warn={!data.toolsAvailable} />
          </dl>

          {data.blockedReason && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {data.blockedReason}
            </p>
          )}

          {data.migrations.databaseIsNewer && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              This database was updated by a newer HomeConnect. Install the newer version before making changes.
            </p>
          )}

          {data.migrations.failed.length > 0 && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              A previous database update did not finish ({data.migrations.failed.join(', ')}). Maintenance can repair it safely; a backup is taken first.
            </p>
          )}

          {data.registryProblems.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {data.registryProblems.map((problem) => <li key={`${problem.code}-${problem.file}`}>{problem.message}</li>)}
            </ul>
          )}

          {preflightRequested && <PreflightReportCard report={preflight.data} loading={preflight.isFetching} />}

          <PendingRepairsList repairs={data.pendingRepairs} />

          <ResolveMigrationsPanel migrations={data.pendingMigrations ?? []} />

          {pendingWork > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Database className="h-4 w-4" /> Apply pending updates / تطبيق التحديثات
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                A verified backup is taken before anything changes. Nothing is applied if the backup fails.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
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
                  Type APPLY to confirm
                  <input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value.toUpperCase())}
                    placeholder="APPLY"
                    className="mt-1 block h-9 w-40 rounded-md border border-slate-300 px-2 font-mono text-sm"
                  />
                </label>
                <button
                  type="button"
                  onClick={submit}
                  disabled={!canApply || applyRepairs.isPending}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {applyRepairs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Apply / تطبيق
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadDiagnostics}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <FileArchive className="h-4 w-4" /> Export Diagnostics / تصدير التشخيص
            </button>
            <button
              type="button"
              onClick={() => window.electronAPI?.openLogsFolder?.()}
              disabled={!window.electronAPI?.openLogsFolder}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <FolderOpen className="h-4 w-4" /> Open Logs Folder / سجل الأخطاء
            </button>
          </div>

          <RepairHistoryTable rows={data.history} />
        </div>
      )}
    </section>
  );
};

const Stat: React.FC<{ label: string; value: string; warn?: boolean }> = ({ label, value, warn }) => (
  <div className={`rounded-lg border p-3 ${warn ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
    <dt className="text-xs font-medium text-slate-500">{label}</dt>
    <dd className={`mt-1 text-sm font-semibold ${warn ? 'text-amber-900' : 'text-slate-900'}`}>{value}</dd>
  </div>
);

function errorMessage(error: unknown): string {
  const response = (error as { response?: { data?: { error?: { message?: string }; message?: string } } })?.response;
  return response?.data?.error?.message ?? response?.data?.message ?? 'Could not apply repairs.';
}
