import React from 'react';
import { CheckCircle2, ShieldAlert } from 'lucide-react';
import { PendingRepair } from '../types/maintenance.types';

/**
 * What each pending repair fixes and what it touches — stated before the admin
 * approves it, not after.
 */
export const PendingRepairsList: React.FC<{ repairs: PendingRepair[] }> = ({ repairs }) => {
  if (!repairs.length) {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
        <CheckCircle2 className="h-4 w-4" /> The database is up to date / قاعدة البيانات محدثة.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200">
      <h3 className="border-b border-slate-100 px-4 py-2 text-sm font-semibold text-slate-800">
        Pending repairs ({repairs.length}) / إصلاحات معلقة
      </h3>
      <ul className="divide-y divide-slate-100">
        {repairs.map((repair) => (
          <li key={repair.repairId} className="px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-slate-900">{repair.title}</span>
              <span className="font-mono text-xs text-slate-500">v{repair.version}</span>
            </div>
            <p className="mt-1 text-xs text-slate-600">{repair.description}</p>
            {repair.affectedTables.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Affects: <span className="font-mono">{repair.affectedTables.join(', ')}</span>
              </p>
            )}
            {repair.requiresSuperuser && (
              <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-amber-800">
                <ShieldAlert className="h-3.5 w-3.5" />
                Needs a database administrator connection — it installs a PostgreSQL extension.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};
