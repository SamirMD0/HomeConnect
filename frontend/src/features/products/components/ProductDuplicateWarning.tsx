import React from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { ProductDuplicateMatch } from '../types/product.types';
import { businessLabels } from '../../../shared/labels/business-labels';

interface ProductDuplicateWarningProps {
  matches: ProductDuplicateMatch[];
  onContinue: () => void;
  onView: (id: string) => void;
}

export const ProductDuplicateWarning: React.FC<ProductDuplicateWarningProps> = ({ matches, onContinue, onView }) => {
  const warnings = matches.filter((match) => match.reason === 'SAME_NAME_MODEL' || match.reason === 'SAME_MODEL_BRAND');
  if (!warnings.length) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{businessLabels.product.duplicateWarning}</p>
          <ul className="mt-2 space-y-1">
            {warnings.map((match) => (
              <li key={match.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0"><span className="user-text" dir="auto">{match.name} · {match.model}{match.brand ? ` · ${match.brand}` : ''}{!match.isActive ? ' (Archived / مؤرشف)' : ''}</span><span className="block text-xs text-amber-700">{duplicateReasonLabel(match)}</span></span>
                <button type="button" onClick={() => onView(match.id)} className="inline-flex items-center gap-1 font-medium text-amber-900 underline">
                  View / عرض <ExternalLink className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onContinue} className="mt-3 rounded-md border border-amber-400 bg-white px-3 py-1.5 font-semibold">
            Continue Anyway / المتابعة على أي حال
          </button>
        </div>
      </div>
    </div>
  );
};

export const ProductDuplicateInlineError: React.FC<{
  field: 'Barcode' | 'SKU';
  matches: ProductDuplicateMatch[];
  onView: (id: string) => void;
}> = ({ field, matches, onView }) => {
  const reason = field === 'Barcode' ? 'BARCODE_TAKEN' : 'SKU_TAKEN';
  const blocking = matches.filter((match) => match.reason === reason);
  if (!blocking.length) return null;
  return <div role="alert" className="mt-1 space-y-1 text-xs font-medium text-red-700">
    {blocking.map((match) => <p key={match.id} className="flex flex-wrap items-center gap-1">
      <span>{field} already used by: / {field === 'Barcode' ? 'الباركود مستخدم بالفعل لدى' : 'رمز المنتج مستخدم بالفعل لدى'}:</span>
      <span className="user-text font-semibold" dir="auto">{match.name}</span>
      <button type="button" onClick={() => onView(match.id)} className="inline-flex items-center gap-1 underline">Open / فتح <ExternalLink className="h-3 w-3" /></button>
    </p>)}
  </div>;
};

const duplicateReasonLabel = (match: ProductDuplicateMatch) => match.reason === 'SAME_NAME_MODEL'
  ? 'Same name and model / نفس الاسم والموديل'
  : 'Same model and brand / نفس الموديل والماركة';
