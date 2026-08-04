import React from 'react';
import { Printer, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MAX_LABEL_SELECTION } from '../utils/label-selection';

interface ProductBulkActionsBarProps {
  selectedIds: string[];
  /** Ids on the page in view, used to tell the user their selection spans pages. */
  visibleIds: string[];
  onClear: () => void;
}

/**
 * Appears only while a selection exists. It is `.no-print` because it is app
 * chrome, and sticky because a selection built across several pages is easy to
 * lose track of.
 */
export const ProductBulkActionsBar: React.FC<ProductBulkActionsBarProps> = ({ selectedIds, visibleIds, onClear }) => {
  if (!selectedIds.length) return null;

  const visible = new Set(visibleIds);
  const offPage = selectedIds.filter((id) => !visible.has(id)).length;
  const printable = selectedIds.slice(0, MAX_LABEL_SELECTION);
  const dropped = selectedIds.length - printable.length;

  return (
    <div className="no-print sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/95 p-3 shadow-sm backdrop-blur">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-emerald-900">
          {selectedIds.length} selected / محدد
          {offPage > 0 && <span className="ml-2 font-normal text-emerald-700">including {offPage} from other pages</span>}
        </p>
        {dropped > 0 && (
          <p role="status" className="mt-1 text-xs font-medium text-amber-800">
            Only the first {MAX_LABEL_SELECTION} of {selectedIds.length} selected products will be printed.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <X className="h-4 w-4" /> Clear / مسح
        </button>
        <Link
          to={`/products/labels?ids=${encodeURIComponent(printable.join(','))}`}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <Printer className="h-4 w-4" /> Print Labels ({printable.length}) / طباعة الملصقات
        </Link>
      </div>
    </div>
  );
};
