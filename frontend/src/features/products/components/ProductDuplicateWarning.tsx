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
  if (!matches.length) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{businessLabels.product.duplicateWarning}</p>
          <ul className="mt-2 space-y-1">
            {matches.map((match) => (
              <li key={match.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="user-text" dir="auto">{match.name} · {match.model}{match.brand ? ` · ${match.brand}` : ''}{!match.isActive ? ' (Archived / مؤرشف)' : ''}</span>
                <button type="button" onClick={() => onView(match.id)} className="inline-flex items-center gap-1 font-medium text-amber-900 underline">
                  View <ExternalLink className="h-3 w-3" />
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
