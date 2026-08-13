import React from 'react';
import { useServiceAudit } from '../hooks/useServiceJobs';

export const ServiceJobAuditList: React.FC<{ serviceJobId: string }> = ({ serviceJobId }) => {
  const audit = useServiceAudit(serviceJobId, true);
  if (audit.isLoading) return <p className="text-sm text-slate-500">Loading history...</p>;
  if (!audit.data?.length) return <p className="text-sm text-slate-500">No history entries.</p>;
  return <ol className="space-y-3">{audit.data.map((entry) => <li key={entry.id} className="border-l-2 border-emerald-300 pl-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-800">{entry.action.replaceAll('_',' ')}</p><time className="text-xs text-slate-500">{new Date(entry.changedAt).toLocaleString('en-GB')}</time></div><p className="user-text text-sm text-slate-600" dir="auto"><span className="font-medium">Reason / السبب:</span> {entry.reason}</p><p className="text-xs text-slate-500">{entry.changedByName} ({entry.changedByUsername})</p><div className="mt-2 grid gap-1 text-xs">{Object.keys(entry.afterValues).map((field) => <p key={field}><span className="font-medium">{field}:</span> {String(entry.beforeValues[field] ?? '—')} → {String(entry.afterValues[field] ?? '—')}</p>)}</div></li>)}</ol>;
};
