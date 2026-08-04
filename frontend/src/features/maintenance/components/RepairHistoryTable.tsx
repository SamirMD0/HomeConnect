import React from 'react';
import { RepairHistoryRow, RepairStatus } from '../types/maintenance.types';

const TONE: Record<RepairStatus, string> = {
  APPLIED: 'bg-emerald-100 text-emerald-800',
  SKIPPED_NOT_NEEDED: 'bg-slate-100 text-slate-600',
  FAILED: 'bg-red-100 text-red-800',
  BLOCKED_NO_BACKUP: 'bg-amber-100 text-amber-900',
  VERIFY_FAILED: 'bg-red-100 text-red-800',
};

const LABEL: Record<RepairStatus, string> = {
  APPLIED: 'Applied',
  SKIPPED_NOT_NEEDED: 'Not needed',
  FAILED: 'Failed',
  BLOCKED_NO_BACKUP: 'Blocked',
  VERIFY_FAILED: 'Verify failed',
};

/** The last 20 outcomes, so an operator can see what happened and when. */
export const RepairHistoryTable: React.FC<{ rows: RepairHistoryRow[] }> = ({ rows }) => {
  if (!rows.length) {
    return <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No repairs have been applied yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-150 text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
          <tr>
            <th scope="col" className="px-3 py-2">When</th>
            <th scope="col" className="px-3 py-2">Repair</th>
            <th scope="col" className="px-3 py-2">Result</th>
            <th scope="col" className="px-3 py-2">By</th>
            <th scope="col" className="px-3 py-2">Backup</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{new Date(row.appliedAt).toLocaleString()}</td>
              <td className="px-3 py-2">
                <span className="font-medium text-slate-900">{row.repairId}</span>
                <span className="ml-2 font-mono text-xs text-slate-500">v{row.version}</span>
                {row.errorMessage && <p className="mt-0.5 text-xs text-red-700">{row.errorMessage}</p>}
              </td>
              <td className="px-3 py-2">
                <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TONE[row.status]}`}>{LABEL[row.status]}</span>
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">{row.appliedByName}</td>
              <td className="max-w-64 truncate px-3 py-2 font-mono text-xs text-slate-500" title={row.backupPath ?? ''}>
                {row.backupPath ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
