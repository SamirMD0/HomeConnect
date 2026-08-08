import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, Smartphone } from 'lucide-react';
import { businessLabels } from '../../../shared/labels/business-labels';
import { LanStatus, PairingCode } from '../types/scanner.types';
import { defaultUrl, describeLanMode, formatCountdown, PAIRING_CODE_EXPIRED, secondsRemaining } from '../utils/scanner-admin';

const labels = businessLabels.scanner;

export interface MobileScannerPanelProps {
  status: LanStatus | undefined;
  isLoading: boolean;
  canManage: boolean;
  pairingCode: PairingCode | null;
  isEnabling: boolean;
  isGeneratingCode: boolean;
  onEnable: () => void;
  onRequestDisable: () => void;
  onGenerateCode: () => void;
  /** Passed in rather than read here, so rendering stays pure and testable. */
  now: number;
}

const toneClasses: Record<string, string> = {
  good: 'bg-emerald-100 text-emerald-800',
  bad: 'bg-red-100 text-red-800',
  busy: 'bg-amber-100 text-amber-900',
  muted: 'bg-slate-200 text-slate-700',
};

/**
 * Everything needed to get a phone scanning, in the order it is needed:
 * turn it on, open the address, type the code.
 */
export const MobileScannerPanel: React.FC<MobileScannerPanelProps> = ({
  status, isLoading, canManage, pairingCode, isEnabling, isGeneratingCode,
  onEnable, onRequestDisable, onGenerateCode, now,
}) => {
  const mode = describeLanMode(status?.mode);
  const [copied, setCopied] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);

  const urls = status?.urls ?? [];
  const url = selectedUrl && urls.includes(selectedUrl) ? selectedUrl : defaultUrl(urls);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    if (!url) return;
    void navigator.clipboard?.writeText(url).then(() => setCopied(true)).catch(() => setCopied(false));
  };

  const remaining = pairingCode ? secondsRemaining(pairingCode.expiresAt, now) : 0;
  const countdown = formatCountdown(remaining);

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Smartphone className="h-4 w-4 text-emerald-600" /> {labels.lanMode}
        </h2>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${toneClasses[mode.tone]}`}>{mode.label}</span>
          {canManage && (mode.reachable ? (
            <button type="button" onClick={onRequestDisable} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">
              {labels.disableLan}
            </button>
          ) : (
            <button type="button" onClick={onEnable} disabled={isEnabling || isLoading} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {isEnabling && <Loader2 className="h-3 w-3 animate-spin" />}{labels.enableLan}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-4 p-4">
        {!canManage && <p className="text-xs text-slate-500">{labels.adminOnly}</p>}

        {status?.error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{status.error}
          </p>
        )}

        {mode.reachable && url && (
          <div>
            <p className="text-xs font-semibold text-slate-600">{labels.phoneUrl}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800">{url}</code>
              <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? labels.copied : labels.copyUrl}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">{labels.addressHint}</p>

            {urls.length > 1 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-semibold text-slate-500">{labels.otherAddresses}</summary>
                <ul className="mt-1 space-y-1">
                  {urls.map((candidate) => (
                    <li key={candidate}>
                      <button type="button" onClick={() => setSelectedUrl(candidate)} className={`w-full truncate rounded px-2 py-1 text-left font-mono text-xs ${candidate === url ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50'}`}>
                        {candidate}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}

        {mode.reachable && canManage && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-600">{labels.pairingCode}</p>
              <button type="button" onClick={onGenerateCode} disabled={isGeneratingCode} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                {isGeneratingCode && <Loader2 className="h-3 w-3 animate-spin" />}{labels.generateCode}
              </button>
            </div>
            {pairingCode && (
              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <span className="font-mono text-3xl font-bold tracking-widest text-slate-900">{pairingCode.code}</span>
                {countdown === PAIRING_CODE_EXPIRED
                  ? <span className="text-xs font-semibold text-amber-700">{labels.codeExpired}</span>
                  : <span className="text-xs text-slate-500">{labels.codeExpiresIn} <span className="font-mono font-semibold tabular-nums">{countdown}</span></span>}
              </div>
            )}
          </div>
        )}

        {status?.firewall && (
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-slate-500">{labels.firewallTitle}</summary>
            <p className="mt-2 text-xs text-slate-600">{status.firewall.note}</p>
            <code className="mt-1 block overflow-x-auto whitespace-pre rounded-lg border border-slate-200 bg-slate-900 p-2 text-[11px] text-slate-100">{status.firewall.command}</code>
          </details>
        )}
      </div>
    </section>
  );
};
