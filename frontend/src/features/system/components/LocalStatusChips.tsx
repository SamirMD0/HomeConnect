import React from 'react';
import { businessLabels } from '../../../shared/labels/business-labels';
import { DatabaseSignal, LanScannerMode } from '../types/system.types';

const labels = businessLabels.system;

export interface LocalStatusChipsProps {
  backendConnected: boolean;
  database: DatabaseSignal;
  lanScanner: LanScannerMode | null;
  internetOnline: boolean;
}

type Tone = 'good' | 'bad' | 'muted';

const toneDot: Record<Tone, string> = {
  good: 'bg-emerald-500',
  bad: 'bg-red-500',
  muted: 'bg-slate-300',
};

/**
 * One signal. The short word is what fits in the header; the full bilingual
 * label is carried in `title` and in screen-reader text, so nothing is lost to
 * abbreviation.
 */
const Chip: React.FC<{ short: string; label: string; tone: Tone }> = ({ short, label, tone }) => (
  <span title={label} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
    <span className={`h-1.5 w-1.5 rounded-full ${toneDot[tone]}`} aria-hidden="true" />
    <span aria-hidden="true">{short}</span>
    <span className="sr-only">{label}</span>
  </span>
);

/**
 * Local health at a glance.
 *
 * Internet is deliberately never red: HomeConnect runs on the business PC, so
 * an offline connection is a fact about the shop's ISP, not a fault in the app.
 * It renders muted, and nothing about it disables anything.
 */
export const LocalStatusChips: React.FC<LocalStatusChipsProps> = ({ backendConnected, database, lanScanner, internetOnline }) => (
  <span role="status" className="inline-flex items-center gap-1.5">
    <Chip
      short="App"
      tone={backendConnected ? 'good' : 'bad'}
      label={backendConnected ? labels.backendConnected : labels.backendDisconnected}
    />
    <Chip
      short="DB"
      tone={database === 'CONNECTED' ? 'good' : database === 'UNAVAILABLE' ? 'bad' : 'muted'}
      label={database === 'CONNECTED' ? labels.databaseConnected : database === 'UNAVAILABLE' ? labels.databaseUnavailable : labels.databaseUnknown}
    />
    <Chip
      short="LAN"
      tone={lanScanner && lanScanner !== 'DISABLED' ? 'good' : 'muted'}
      label={lanScanner && lanScanner !== 'DISABLED' ? labels.lanScannerAvailable : labels.lanScannerOff}
    />
    <Chip
      short="Net"
      tone={internetOnline ? 'good' : 'muted'}
      label={internetOnline ? labels.internetOnline : `${labels.internetOffline} — ${labels.localSystemUnaffected}`}
    />
  </span>
);
