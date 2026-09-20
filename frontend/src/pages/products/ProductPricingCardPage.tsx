import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router-dom';
import { BrowserPrintHint } from '../../features/products/components/BrowserPrintHint';
import { LabelSecretPrintControls } from '../../features/products/components/LabelSecretPrintControls';
import { ProductLabelWarnings } from '../../features/products/components/ProductLabelWarnings';
import { canPrintLabelsDirectly } from '../../features/products/utils/print-labels';
import { parseManualDiscountStages } from '../../features/products/utils/discount-stages';
import { FeatureHighlightPicker } from '../../features/pricing-card/components/FeatureHighlightPicker';
import { PricingCardControls } from '../../features/pricing-card/components/PricingCardControls';
import { PricingCardPage } from '../../features/pricing-card/components/PricingCardPage';
import { usePricingCard, usePricingCardSecretPreview, useRecordPricingCardPrint } from '../../features/pricing-card/hooks/usePricingCard';
import { usePricingCardTemplates } from '../../features/pricing-card/hooks/usePricingCardTemplates';
import { useShopProfile } from '../../features/pricing-card/hooks/useShopProfile';
import type { PricingCardData, RecordPricingCardPrintInput } from '../../features/pricing-card/types/pricing-card.types';
import { printPricingCards } from '../../features/pricing-card/utils/print-pricing-cards';
import { useLabelSecretConfiguration } from '../../features/pricing/hooks/usePricingPresets';
import { useAuth } from '../../hooks/useAuth';

export function ProductPricingCardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const profile = useShopProfile();
  const templates = usePricingCardTemplates(true);
  const activeTemplates = templates.data ?? [];
  const [templateOverride, setTemplateOverride] = useState<string | null>(null);
  const selectedTemplateId = templateOverride ?? activeDefaultTemplateId(activeTemplates, profile.data?.defaultPricingCardTemplateId);
  const selectedTemplate = activeTemplates.find(({ id: templateId }) => templateId === selectedTemplateId);
  const [copies, setCopies] = useState(1);
  const [validUntilOverride, setValidUntilOverride] = useState<string | null>(null);
  const validUntil = resolvePricingCardValidUntil(validUntilOverride, selectedTemplate?.defaultValidityDays, profile.data?.defaultCardValidityDays);
  const [selectedFeatures, setSelectedFeatures] = useState<string[] | null>(null);
  const [featureChoices, setFeatureChoices] = useState<NonNullable<PricingCardData['features']>>([]);
  const card = usePricingCard(id, { templateId: selectedTemplateId, validUntil, includePriceCode: true, featureCodes: selectedFeatures ?? undefined });
  const secret = usePricingCardSecretPreview();
  const recordPrint = useRecordPricingCardPrint();
  const secretConfig = useLabelSecretConfiguration();
  const [pricingPresetId, setPricingPresetId] = useState('');
  const [encodingPresetId, setEncodingPresetId] = useState('');
  const [password, setPassword] = useState('');
  const [manualStages, setManualStages] = useState('');
  const [manualStagesEnabled, setManualStagesEnabled] = useState(false);

  useEffect(() => {
    if (!card.data?.payload.features || featureChoices.length) return;
    setFeatureChoices(card.data.payload.features);
  }, [card.data?.payload.features, featureChoices.length]);
  useEffect(() => {
    if (!secretConfig.data) return;
    setPricingPresetId(secretConfig.data.settings?.defaultPricingPresetId ?? '');
    setEncodingPresetId(secretConfig.data.settings?.defaultEncodingPresetId ?? '');
  }, [secretConfig.data]);
  const resetSecret = secret.reset;
  useEffect(() => { resetSecret(); }, [encodingPresetId, manualStages, manualStagesEnabled, pricingPresetId, resetSecret, selectedFeatures, selectedTemplateId, validUntil]);

  const result = secret.data ?? card.data;
  const payload = result?.payload;
  const features = featureChoices.length ? featureChoices : card.data?.payload.features ?? [];
  const selectedCodes = selectedFeatures ?? features.map(({ iconCode }) => iconCode);
  const cards = useMemo(() => payload ? Array.from({ length: copies }, () => ({ product: payload, assets: { companyLogoUrl: profile.data?.logoDataUrl ?? null } })) : [], [copies, payload, profile.data?.logoDataUrl]);
  const ready = Boolean(selectedTemplate && profile.data && payload && validUntil && !card.isLoading);

  const changeTemplate = (templateId: string) => {
    setTemplateOverride(templateId); setSelectedFeatures(null); setFeatureChoices([]); setValidUntilOverride(null);
  };
  const applySecret = () => secret.mutate({ productId: id, input: {
    templateId: selectedTemplateId, validUntil, featureCodes: selectedFeatures ?? undefined,
    includePriceCode: true, includePrice: true, hiddenPricingPresetId: pricingPresetId, encodingPresetId,
    ...(manualStagesEnabled ? { manualDiscountStages: parseManualDiscountStages(manualStages) ?? undefined } : {}),
    accountPassword: password,
  } }, {
    onSuccess: () => { setPassword(''); toast.success('Staff price code updated for this print run'); },
    onError: () => toast.error('Unable to apply the staff price selection'),
  });
  const print = () => {
    if (!selectedTemplate || !payload || !profile.data) return;
    if (Number(selectedTemplate.cardWidthMm) > 100 && !canPrintLabelsDirectly()) {
      toast('Cards larger than 100 mm print best from the desktop app — the browser may scale the page.');
    }
    const size = selectedTemplate.paperMode === 'SINGLE_STICKER'
      ? { widthMm: Number(selectedTemplate.cardWidthMm), heightMm: Number(selectedTemplate.cardHeightMm) }
      : null;
    void printPricingCardAndSnapshot({
      print: () => printPricingCards(size),
      snapshot: profile.data.snapshotPrintedCards && user?.role === 'ADMIN'
        ? () => recordPrint.mutateAsync(snapshotInput(payload, selectedTemplate.id, copies, pricingPresetId, encodingPresetId))
        : undefined,
      onSnapshotError: () => toast.error('Snapshot failed — the print still went out.'),
    }).then((printed) => { if (printed.error) toast.error(`Printing failed: ${printed.error}`); });
  };

  return <div className="product-label-page space-y-5">
    <button type="button" onClick={() => navigate(-1)} className="no-print inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2"><ArrowLeft className="h-4 w-4" /> Back</button>
    <PricingCardControls templates={activeTemplates} selectedTemplateId={selectedTemplateId} copies={copies} validUntil={validUntil} disabled={!ready} cardCount={cards.length} onTemplateChange={changeTemplate} onCopiesChange={setCopies} onValidUntilChange={setValidUntilOverride} onPrint={print} />
    <FeatureHighlightPicker features={features} selectedCodes={selectedCodes} max={selectedTemplate?.featureMax ?? 0} onToggle={(code) => setSelectedFeatures(toggleFeatureSelection(selectedCodes, code))} onReset={() => setSelectedFeatures(null)} />
    {user?.role === 'ADMIN' && secretConfig.data?.settings?.showCodeOnLabel && <LabelSecretPrintControls config={secretConfig.data} pricingPresetId={pricingPresetId} encodingPresetId={encodingPresetId} password={password} manualStages={manualStages} manualStagesEnabled={manualStagesEnabled} onPricingPresetChange={setPricingPresetId} onEncodingPresetChange={setEncodingPresetId} onPasswordChange={setPassword} onManualStagesChange={setManualStages} onManualStagesEnabledChange={setManualStagesEnabled} onApply={applySecret} pending={secret.isPending} preview={payload ? secretControlsPreview(payload) : undefined} />}
    <BrowserPrintHint />
    <ProductLabelWarnings warnings={(result?.warnings ?? []) as never[]} />
    {card.isLoading && <p className="p-8 text-center text-slate-500">Loading pricing card…</p>}
    {card.isError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Pricing card could not be loaded.</p>}
    {selectedTemplate && profile.data && <PricingCardPage cards={cards} template={selectedTemplate} shopProfile={profile.data} />}
  </div>;
}

export function toggleFeatureSelection(selected: string[], code: string) {
  return selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code];
}

export function resolvePricingCardValidUntil(override: string | null, templateDays?: number | null, shopDays?: number, today = new Date()) {
  if (override) return override;
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + (templateDays ?? shopDays ?? 0));
  return date.toISOString().slice(0, 10);
}

export async function printPricingCardAndSnapshot(options: { print: () => Promise<{ printed: boolean; error?: string }>; snapshot?: () => Promise<unknown>; onSnapshotError: () => void }) {
  const result = await options.print();
  if (result.printed && options.snapshot) {
    try { await options.snapshot(); } catch { options.onSnapshotError(); }
  }
  return result;
}

function activeDefaultTemplateId(templates: Array<{ id: string }>, preferred?: string | null) {
  return templates.some(({ id }) => id === preferred) ? preferred! : templates[0]?.id ?? '';
}

function snapshotInput(payload: PricingCardData, templateId: string, copies: number, hiddenPricingPresetId: string, encodingPresetId: string): RecordPricingCardPrintInput {
  const { internalPriceCode: _internal, secretPrice: _secret, features, ...publicFields } = payload;
  return { productId: payload.id, templateId, snapshot: { ...publicFields, features: features?.map(({ iconSvg: _svg, ...feature }) => feature) }, validUntil: payload.validUntil, currencyCode: payload.currency?.code ?? 'USD', publicPrice: payload.cashPrice ?? '0.00', staffLabelCode: payload.staffLabelCode, barcodeValue: payload.barcodeValue, copiesPrinted: copies, hiddenPricingPresetId: hiddenPricingPresetId || null, encodingPresetId: encodingPresetId || null };
}

function secretControlsPreview(payload: PricingCardData) {
  return { ...payload, brand: typeof payload.brand === 'string' ? payload.brand : payload.brand?.displayName ?? null };
}
