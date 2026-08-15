import React from 'react';
import { Monitor, Smartphone } from 'lucide-react';
import { businessLabels } from '../../../shared/labels/business-labels';
import { RecentScan } from '../types/scanner.types';

interface RecentScansListProps {
  scans: RecentScan[];
  /** Re-opens the preview for an earlier scan without rescanning the item. */
  onPreview?: (productId: string) => void;
  onOpenProduct?: (productId: string) => void;
  onClear?: () => void;
}

const labels = businessLabels.scanner;

const statusStyles: Record<RecentScan['status'], string> = {
  FOUND: 'bg-emerald-100 text-emerald-800',
  NOT_FOUND: 'bg-amber-100 text-amber-900',
  INVALID_CODE: 'bg-slate-200 text-slate-700',
};

const statusText: Record<RecentScan['status'], string> = {
  FOUND: labels.productFound,
  NOT_FOUND: labels.productNotFound,
  INVALID_CODE: labels.invalidCode,
};

/** Session history for the counter — what was scanned, what it matched, from where. */
export const RecentScansList: React.FC<RecentScansListProps> = ({ scans, onPreview, onOpenProduct, onClear }) => (
  <section className="rounded-lg border border-slate-200 bg-white">
    <header className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
      <h2 className="text-sm font-semibold text-slate-800">{labels.recentScans}</h2>
      {scans.length > 0 && onClear && (
        <button type="button" onClick={onClear} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
          {labels.clearScans}
        </button>
      )}
    </header>
    {scans.length === 0 ? (
      <p className="px-4 py-3 text-sm text-slate-500">{labels.noRecentScans}</p>
    ) : (
      <ul className="divide-y divide-slate-100">
        {scans.map((scan) => (
          <li key={scan.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
            <span className="inline-flex items-center gap-1.5 text-slate-400" title={scan.source === 'PC_SCANNER' ? labels.pcScanner : labels.phoneScanner}>
              {scan.source === 'PC_SCANNER' ? <Monitor className="h-3.5 w-3.5" /> : <Smartphone className="h-3.5 w-3.5" />}
              <span className="sr-only">{scan.source === 'PC_SCANNER' ? labels.pcScanner : labels.phoneScanner}</span>
            </span>
            <span className="font-mono text-xs text-slate-700">{scan.code}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusStyles[scan.status]}`}>{statusText[scan.status]}</span>
            {scan.productName && <span className="min-w-0 truncate text-slate-700" dir="auto">{scan.productName}</span>}
            <time dateTime={scan.scannedAt} className="ml-auto text-xs text-slate-400">
              {new Date(scan.scannedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </time>
            {scan.productId && onPreview && (
              <button type="button" onClick={() => onPreview(scan.productId!)} className="rounded-lg border border-emerald-600 px-2 py-1 text-xs font-semibold text-emerald-700">
                Preview / معاينة
              </button>
            )}
            {scan.productId && onOpenProduct && (
              <button type="button" onClick={() => onOpenProduct(scan.productId!)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700">
                {labels.openProduct}
              </button>
            )}
          </li>
        ))}
      </ul>
    )}
  </section>
);
