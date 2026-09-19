import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Sparkles } from 'lucide-react';
import { BackupRestorePanel } from '../../features/backup/components/BackupRestorePanel';
import { DiagnosticsPanel } from '../../features/diagnostics/components/DiagnosticsPanel';
import { MaintenancePanel } from '../../features/maintenance/components/MaintenancePanel';
import { useAuth } from '../../hooks/useAuth';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();

  if (user?.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-900">
        <h1 className="text-xl font-semibold">Settings are admin-only</h1>
        <p className="mt-2 text-sm">Backup and restore controls are restricted to admins.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Local backup, restore, and operational safety controls.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-6 w-6 text-slate-500" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Shop profile & pricing cards</h2>
              <p className="text-sm text-slate-500">Logo, currency, default template, rollout mode, and snapshot policy.</p>
            </div>
          </div>
          <Link to="/settings/pricing-cards/shop-profile" className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Open</Link>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-6 w-6 text-slate-500" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Feature icons</h2>
              <p className="text-sm text-slate-500">Manage the SVG icon catalog shown in the Features block of every card.</p>
            </div>
          </div>
          <Link to="/settings/pricing-cards/feature-icons" className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Open</Link>
        </div>
      </section>

      <BackupRestorePanel />

      <div className="mt-8">
        <MaintenancePanel />
      </div>

      <div className="mt-8">
        <DiagnosticsPanel />
      </div>
    </div>
  );
};
