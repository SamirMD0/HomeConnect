import React from 'react';
import { BackupRestorePanel } from '../../features/backup/components/BackupRestorePanel';
import { DiagnosticsPanel } from '../../features/diagnostics/components/DiagnosticsPanel';
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

      <BackupRestorePanel />
      
      <div className="mt-8">
        <DiagnosticsPanel />
      </div>
    </div>
  );
};
