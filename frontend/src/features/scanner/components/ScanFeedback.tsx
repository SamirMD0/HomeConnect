import React from 'react';
import { AlertTriangle, Archive, CheckCircle2, Loader2, ScanLine, XCircle } from 'lucide-react';
import { businessLabels } from '../../../shared/labels/business-labels';
import { ScanLookupResult } from '../types/scanner.types';

interface ScanFeedbackProps {
  result: ScanLookupResult | null;
  isLooking: boolean;
  isError: boolean;
  onOpenProduct?: (productId: string) => void;
  onManualSearch?: () => void;
}

const labels = businessLabels.scanner;

/**
 * The one place a scan reports itself. Every state is announced with
 * `role="status"` so the result is spoken as well as coloured — the counter is
 * often looking at the product, not the screen.
 */
export const ScanFeedback: React.FC<ScanFeedbackProps> = ({ result, isLooking, isError, onOpenProduct, onManualSearch }) => {
  if (isLooking) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-700">
        <Loader2 className="h-4 w-4 animate-spin" /> {labels.searching}…
      </p>
    );
  }

  if (isError) {
    return (
      <p role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
        <XCircle className="h-4 w-4" /> {labels.lookupFailed}
      </p>
    );
  }

  if (!result) return null;

  if (result.status === 'INVALID_CODE') {
    return (
      <p role="status" className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
        <AlertTriangle className="h-4 w-4" /> {labels.invalidCode}
      </p>
    );
  }

  if (result.status === 'NOT_FOUND') {
    return (
      <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
        <ScanLine className="h-4 w-4" />
        {labels.productNotFound} — <span className="font-mono">{result.normalizedCode}</span>
        {onManualSearch && <button type="button" onClick={onManualSearch} className="ml-auto rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs">Manual search / بحث يدوي</button>}
      </div>
    );
  }

  const product = result.product;
  if (!product) return null;

  return (
    <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-900">
          <CheckCircle2 className="h-4 w-4" /> {labels.productFound}
        </span>
        <span className="text-sm font-medium text-slate-800" dir="auto">{product.name}</span>
        <span className="text-sm text-slate-600">{product.model}</span>
        <span className="font-mono text-xs text-slate-600">{product.sku}</span>
        {product.brand && <span className="text-xs text-slate-500">{product.brand}</span>}
        {!product.isActive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
            <Archive className="h-3 w-3" /> {labels.archivedProduct}
          </span>
        )}
        {onOpenProduct && (
          <button type="button" onClick={() => onOpenProduct(product.id)} className="ml-auto rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white">
            {labels.openProduct}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {result.matchedBy === 'BARCODE' ? labels.matchedByBarcode : labels.matchedBySku}
        {result.alsoMatchedSku ? ` — ${labels.alsoMatchedSku}` : ''}
      </p>
    </div>
  );
};
