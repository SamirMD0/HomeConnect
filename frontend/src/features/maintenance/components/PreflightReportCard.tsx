import React from 'react';
import { PreflightReport, PreflightStatus } from '../types/maintenance.types';

const TONE: Record<PreflightStatus, string> = {
  PASS: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  WARN: 'border-amber-200 bg-amber-50 text-amber-900',
  FAIL: 'border-red-200 bg-red-50 text-red-800',
  SKIPPED: 'border-slate-200 bg-slate-50 text-slate-600',
};

const LABEL: Record<PreflightStatus, string> = {
  PASS: 'OK', WARN: 'Check', FAIL: 'Problem', SKIPPED: 'Skipped',
};

/**
 * The preflight checklist. Every non-passing row shows its fix, because a red
 * row with no stated next step is the jargon this feature exists to replace.
 */
export const PreflightReportCard: React.FC<{ report?: PreflightReport; loading: boolean }> = ({ report, loading }) => {
  if (loading) return <p className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">Running checks…</p>;
  if (!report) return null;

  return (
    <div className="rounded-lg border border-slate-200">
      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-t-lg border-b px-4 py-2 ${TONE[report.status]}`}>
        <h3 className="text-sm font-semibold">System check — {LABEL[report.status]}</h3>
        <span className="text-xs">{new Date(report.checkedAt).toLocaleString()}</span>
      </div>
      <ul className="divide-y divide-slate-100">
        {report.checks.map((check) => (
          <li key={check.id} className="px-4 py-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-slate-800">{check.title}</span>
              <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TONE[check.status]}`}>{LABEL[check.status]}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-600">{check.detail}</p>
            {check.fix && <p className="mt-1 text-xs font-medium text-slate-800">→ {check.fix}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
};
