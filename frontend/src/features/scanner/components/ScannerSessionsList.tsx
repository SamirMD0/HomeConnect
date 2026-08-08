import React from 'react';
import { Smartphone } from 'lucide-react';
import { businessLabels } from '../../../shared/labels/business-labels';
import { ScannerSession } from '../types/scanner.types';
import { describeSession, formatLastSeen } from '../utils/scanner-admin';

const labels = businessLabels.scanner;

export interface ScannerSessionsListProps {
  sessions: ScannerSession[];
  canManage: boolean;
  onRevoke?: (id: string) => void;
  revokingId?: string | null;
  /** Passed in rather than read here, so rendering stays pure and testable. */
  now: number;
}

/**
 * Which phones are paired, and the means to cut one off.
 *
 * Revoked and expired sessions stay listed rather than vanishing: confirming
 * that a phone really was disconnected is the main reason to look here.
 */
export const ScannerSessionsList: React.FC<ScannerSessionsListProps> = ({
  sessions, canManage, onRevoke, revokingId = null, now,
}) => (
  <section className="rounded-lg border border-slate-200 bg-white">
    <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
      <h2 className="text-sm font-semibold text-slate-800">{labels.pairedDevices}</h2>
      <span className="text-xs text-slate-500">{sessions.filter((session) => session.isActive).length}</span>
    </header>

    {sessions.length === 0 ? (
      <p className="px-4 py-3 text-sm text-slate-500">{labels.noPairedDevices}</p>
    ) : (
      <ul className="divide-y divide-slate-100">
        {sessions.map((session) => {
          const state = describeSession(session);
          return (
            <li key={session.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
              <Smartphone className={`h-4 w-4 ${state.tone === 'good' ? 'text-emerald-600' : 'text-slate-300'}`} />
              <span className="font-medium text-slate-800" dir="auto">{session.deviceLabel}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${state.tone === 'good' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                {state.label}
              </span>
              <span className="text-xs text-slate-500">
                {labels.lastSeen}: {formatLastSeen(session.lastSeenAt, now)}
              </span>
              {canManage && session.isActive && onRevoke && (
                <button
                  type="button"
                  onClick={() => onRevoke(session.id)}
                  disabled={revokingId === session.id}
                  className="ml-auto rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 disabled:opacity-50"
                >
                  {labels.revoke}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    )}
  </section>
);
