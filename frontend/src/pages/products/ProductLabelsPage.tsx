import React, { useMemo, useState } from 'react';
import { ArrowLeft, Printer } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ExportPdfButton } from '../../features/products/components/ExportPdfButton';
import { LabelSheetLayoutControls } from '../../features/products/components/LabelSheetLayoutControls';
import { ProductLabelSheet } from '../../features/products/components/ProductLabelSheet';
import { ProductLabelWarnings } from '../../features/products/components/ProductLabelWarnings';
import { useProductLabels } from '../../features/products/hooks/useProducts';
import { MAX_LABEL_SELECTION, parseLabelIds } from '../../features/products/utils/label-selection';
import { calculateLabelSheetLayout } from '../../features/products/utils/label-sheet-layout';
import { loadProductLabelSheetSettings } from '../../features/products/utils/product-label-settings';

export const ProductLabelsPage: React.FC = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ids = useMemo(() => parseLabelIds(params.get('ids')), [params]);

  const [settings, setSettings] = useState(loadProductLabelSheetSettings);
  const [showPrice, setShowPrice] = useState(true);
  const [showPriceCode, setShowPriceCode] = useState(true);

  const labels = useProductLabels(ids, showPriceCode, showPrice);
  const items = labels.data?.labels ?? [];
  const layout = calculateLabelSheetLayout(settings, items.length);
  const canOutput = items.length > 0 && !labels.isLoading && (settings.mode === 'STICKER' || layout.canPrint);

  return (
    <div className="product-label-page space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/products')}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
        >
          <ArrowLeft className="h-4 w-4" /> Products / المنتجات
        </button>

        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-600">{items.length} labels / ملصقات</span>
          <ExportPdfButton disabled={!canOutput} paper={settings.paper} labelCount={items.length} />
          <button
            type="button"
            disabled={!canOutput}
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Print / طباعة
          </button>
        </div>
      </div>

      <LabelSheetLayoutControls
        settings={settings}
        onChange={setSettings}
        layout={layout}
        showPrice={showPrice}
        onShowPriceChange={setShowPrice}
        showPriceCode={showPriceCode}
        onShowPriceCodeChange={setShowPriceCode}
      />

      {ids.length >= MAX_LABEL_SELECTION && (
        <p role="status" className="no-print rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          A print run is limited to {MAX_LABEL_SELECTION} labels / الحد الأقصى {MAX_LABEL_SELECTION} ملصق.
        </p>
      )}

      {labels.isLoading && <p className="no-print p-8 text-center text-slate-500">Loading labels… / جارٍ التحميل…</p>}

      {labels.isError && (
        <p role="alert" className="no-print rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          Unable to load labels / تعذر تحميل الملصقات.
        </p>
      )}

      {!labels.isLoading && !labels.isError && !items.length && (
        <div className="no-print rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <p className="font-medium">No printable labels were found / لم يتم العثور على ملصقات صالحة.</p>
          <button type="button" onClick={() => navigate('/products')} className="mt-2 text-sm font-semibold underline">
            Back to Products / العودة إلى المنتجات
          </button>
        </div>
      )}

      <ProductLabelWarnings warnings={labels.data?.warnings ?? []} />

      <ProductLabelSheet labels={items} settings={settings} layout={layout} />
    </div>
  );
};
