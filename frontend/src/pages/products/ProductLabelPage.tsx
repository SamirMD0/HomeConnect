import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowLeft, Printer } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useLabelSecretConfiguration } from '../../features/pricing/hooks/usePricingPresets';
import { BrowserPrintHint } from '../../features/products/components/BrowserPrintHint';
import { LabelSecretPrintControls } from '../../features/products/components/LabelSecretPrintControls';
import { ProductLabel } from '../../features/products/components/ProductLabel';
import { ProductLabelPrintSettings } from '../../features/products/components/ProductLabelPrintSettings';
import { ProductLabelWarnings } from '../../features/products/components/ProductLabelWarnings';
import { useProductLabel, useProductLabelSecretPreview } from '../../features/products/hooks/useProducts';
import { loadProductLabelDimensions } from '../../features/products/utils/product-label-settings';
import { printProductLabels } from '../../features/products/utils/print-labels';
import { parseManualDiscountStages } from '../../features/products/utils/discount-stages';

export const ProductLabelPage: React.FC = () => {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showPrice, setShowPrice] = useState(true);
  const [showCode, setShowCode] = useState(true);
  const [copies, setCopies] = useState(1);
  const [dimensions, setDimensions] = useState(loadProductLabelDimensions);
  const [pricingPresetId, setPricingPresetId] = useState('');
  const [encodingPresetId, setEncodingPresetId] = useState('');
  const [password, setPassword] = useState('');
  const [manualStages, setManualStages] = useState('');
  const [manualStagesEnabled, setManualStagesEnabled] = useState(false);
  const label = useProductLabel(id, showCode, showPrice);
  const config = useLabelSecretConfiguration();
  const override = useProductLabelSecretPreview();
  const resetOverride = override.reset;

  useEffect(() => {
    if (!config.data) return;
    setPricingPresetId(config.data.settings?.defaultPricingPresetId ?? '');
    setEncodingPresetId(config.data.settings?.defaultEncodingPresetId ?? '');
  }, [config.data]);
  useEffect(() => { resetOverride(); }, [showCode, showPrice, pricingPresetId, encodingPresetId, manualStages, manualStagesEnabled, resetOverride]);
  useEffect(() => { setManualStagesEnabled(false); setManualStages(''); }, [encodingPresetId]);

  if (label.isLoading) return <div className="p-12 text-center">Loading label...</div>;
  const result = override.data ?? label.data;
  if (!result) return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Product label could not be loaded.</div>;
  const applyOverride = () => override.mutate({ id, input: {
    includePriceCode: showCode, includePrice: showPrice, hiddenPricingPresetId: pricingPresetId, encodingPresetId,
    ...(manualStagesEnabled ? { manualDiscountStages: parseManualDiscountStages(manualStages) ?? undefined } : {}),
    accountPassword: password,
  } }, { onSuccess: (data) => {
    setPassword('');
    if (data.payload.staffLabelCode) toast.success('Staff price code updated for this print run');
    else toast('Applied, but no staff code was generated. See the warning below.', { icon: '⚠️' });
  }, onError: () => toast.error('Unable to apply the staff price selection') });

  return <div className="product-label-page space-y-5">
    <div className="no-print flex flex-wrap items-center justify-between gap-3">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2"><ArrowLeft className="h-4 w-4" /> Back / رجوع</button>
      <div className="flex items-center gap-3"><label className="text-sm">Copies / النسخ <input type="number" min="1" max="40" value={copies} onChange={(event) => setCopies(Math.max(1, Math.min(40, Number(event.target.value))))} className="ml-2 w-20 rounded-lg border border-slate-300 px-2 py-2" /></label><button onClick={() => { void printProductLabels(dimensions.autoFit ? null : dimensions).then((printResult) => { if (printResult.error) toast.error(`Printing failed: ${printResult.error} / فشلت الطباعة`); }); }} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white"><Printer className="h-4 w-4" /> Print / طباعة</button></div>
    </div>
    <ProductLabelPrintSettings dimensions={dimensions} onChange={setDimensions} showPrice={showPrice} onShowPriceChange={setShowPrice} showCode={showCode} onShowCodeChange={setShowCode} />
    {user?.role === 'ADMIN' && showCode && config.data && config.data.settings?.showCodeOnLabel && <LabelSecretPrintControls config={config.data} pricingPresetId={pricingPresetId} encodingPresetId={encodingPresetId} password={password} manualStages={manualStages} manualStagesEnabled={manualStagesEnabled} onPricingPresetChange={setPricingPresetId} onEncodingPresetChange={setEncodingPresetId} onPasswordChange={setPassword} onManualStagesChange={setManualStages} onManualStagesEnabledChange={setManualStagesEnabled} onApply={applyOverride} pending={override.isPending} preview={result.payload} />}
    <BrowserPrintHint />
    <ProductLabelWarnings warnings={result.warnings} />
    <div className={`product-label-grid ${dimensions.autoFit ? 'product-label-grid-auto' : ''}`} style={{ '--label-width': `${dimensions.widthMm}mm` } as React.CSSProperties}>{Array.from({ length: copies }, (_, index) => <ProductLabel key={index} product={result.payload} dimensions={dimensions} />)}</div>
  </div>;
};
