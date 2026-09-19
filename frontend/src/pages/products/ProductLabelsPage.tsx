import React, { useEffect, useMemo, useState } from 'react';
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
import { BrowserPrintHint } from '../../features/products/components/BrowserPrintHint';
import { printProductLabels } from '../../features/products/utils/print-labels';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import { useLabelSecretConfiguration } from '../../features/pricing/hooks/usePricingPresets';
import { LabelSecretPrintControls } from '../../features/products/components/LabelSecretPrintControls';
import { useProductLabelsSecretPreview } from '../../features/products/hooks/useProducts';
import { parseManualDiscountStages } from '../../features/products/utils/discount-stages';

export const ProductLabelsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const ids = useMemo(() => parseLabelIds(params.get('ids')), [params]);

  const [settings, setSettings] = useState(loadProductLabelSheetSettings);
  const [showPrice, setShowPrice] = useState(true);
  const [showPriceCode, setShowPriceCode] = useState(true);
  const [pricingPresetId, setPricingPresetId] = useState('');
  const [encodingPresetId, setEncodingPresetId] = useState('');
  const [password, setPassword] = useState('');
  const [manualStages, setManualStages] = useState('');
  const [manualStagesEnabled, setManualStagesEnabled] = useState(false);

  const labels = useProductLabels(ids, showPriceCode, showPrice);
  const config = useLabelSecretConfiguration();
  const override = useProductLabelsSecretPreview();
  const resetOverride = override.reset;
  useEffect(() => {
    if (!config.data) return;
    setPricingPresetId(config.data.settings?.defaultPricingPresetId ?? '');
    setEncodingPresetId(config.data.settings?.defaultEncodingPresetId ?? '');
  }, [config.data]);
  useEffect(() => { resetOverride(); }, [showPriceCode, showPrice, pricingPresetId, encodingPresetId, manualStages, manualStagesEnabled, resetOverride]);
  useEffect(() => { setManualStagesEnabled(false); setManualStages(''); }, [encodingPresetId]);
  const result = override.data ?? labels.data;
  const items = result?.labels ?? [];
  const layout = calculateLabelSheetLayout(settings, items.length);
  const canOutput = items.length > 0 && !labels.isLoading && (settings.mode === 'STICKER' || layout.canPrint);
  const applyOverride = () => override.mutate({
    ids, includeArchived: false, includePriceCode: showPriceCode, includePrice: showPrice, hiddenPricingPresetId: pricingPresetId, encodingPresetId,
    ...(manualStagesEnabled ? { manualDiscountStages: parseManualDiscountStages(manualStages) ?? undefined } : {}),
    accountPassword: password,
  }, { onSuccess: (data) => {
    setPassword('');
    if (data.labels.some((label) => label.staffLabelCode)) toast.success('Staff price code updated for this print run');
    else toast('Applied, but no staff code was generated. See the warning below.', { icon: '⚠️' });
  }, onError: () => toast.error('Unable to apply the staff price selection') });

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
            onClick={() => {
              // Sticker stock prints one exact-size label per page; A4 sheets use the dialog.
              const size = settings.mode === 'STICKER' ? { widthMm: settings.labelWidthMm, heightMm: settings.labelHeightMm } : null;
              void printProductLabels(size).then((result) => { if (result.error) toast.error(`Printing failed: ${result.error} / فشلت الطباعة`); });
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
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

      {user?.role === 'ADMIN' && showPriceCode && config.data && config.data.settings?.showCodeOnLabel && <LabelSecretPrintControls config={config.data} pricingPresetId={pricingPresetId} encodingPresetId={encodingPresetId} password={password} manualStages={manualStages} manualStagesEnabled={manualStagesEnabled} onPricingPresetChange={setPricingPresetId} onEncodingPresetChange={setEncodingPresetId} onPasswordChange={setPassword} onManualStagesChange={setManualStages} onManualStagesEnabledChange={setManualStagesEnabled} onApply={applyOverride} pending={override.isPending} preview={items[0]} />}

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

      <BrowserPrintHint />

      <ProductLabelWarnings warnings={result?.warnings ?? []} />

      <ProductLabelSheet labels={items} settings={settings} layout={layout} />
    </div>
  );
};
