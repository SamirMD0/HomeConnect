import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BrowserPrintHint } from '../../features/products/components/BrowserPrintHint';
import { ProductLabelWarnings } from '../../features/products/components/ProductLabelWarnings';
import { MAX_LABEL_SELECTION, parseLabelIds } from '../../features/products/utils/label-selection';
import { calculateLabelSheetLayout } from '../../features/products/utils/label-sheet-layout';
import { PricingCardControls } from '../../features/pricing-card/components/PricingCardControls';
import { PricingCardPage } from '../../features/pricing-card/components/PricingCardPage';
import { usePricingCards } from '../../features/pricing-card/hooks/usePricingCard';
import { usePricingCardTemplates } from '../../features/pricing-card/hooks/usePricingCardTemplates';
import { useShopProfile } from '../../features/pricing-card/hooks/useShopProfile';
import { printPricingCards } from '../../features/pricing-card/utils/print-pricing-cards';
import { resolvePricingCardValidUntil } from './ProductPricingCardPage';

export function ProductPricingCardsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ids = useMemo(() => parseLabelIds(params.get('ids')), [params]);
  const profile = useShopProfile();
  const templates = usePricingCardTemplates(true);
  const activeTemplates = templates.data ?? [];
  const [templateOverride, setTemplateOverride] = useState<string | null>(null);
  const selectedTemplateId = templateOverride ?? defaultTemplateId(activeTemplates, profile.data?.defaultPricingCardTemplateId);
  const selectedTemplate = activeTemplates.find(({ id }) => id === selectedTemplateId);
  const [copies, setCopies] = useState(1);
  const [validUntilOverride, setValidUntilOverride] = useState<string | null>(null);
  const validUntil = resolvePricingCardValidUntil(validUntilOverride, selectedTemplate?.defaultValidityDays, profile.data?.defaultCardValidityDays);
  const cardsQuery = usePricingCards(ids, { templateId: selectedTemplateId, validUntil, includePriceCode: true });
  const labels = cardsQuery.data?.labels ?? [];
  const cards = useMemo(() => Array.from({ length: copies }, () => labels).flat().map((product) => ({ product })), [copies, labels]);
  const sheetTemplate = selectedTemplate ? { ...selectedTemplate, paperMode: 'SHEET' as const, paperSize: 'A4' as const } : null;
  const widthMm = Number(selectedTemplate?.cardWidthMm ?? 0);
  const heightMm = Number(selectedTemplate?.cardHeightMm ?? 0);
  const layout = calculateLabelSheetLayout({ paper: 'A4', labelWidthMm: widthMm, labelHeightMm: heightMm, pageMarginMm: 8, labelGapMm: 3, columns: 'AUTO' }, cards.length);
  const ready = Boolean(sheetTemplate && profile.data && labels.length && !cardsQuery.isLoading && layout.canPrint);

  const print = () => {
    void printPricingCards(null).then((result) => {
      if (result.error) toast.error(`Printing failed: ${result.error}`);
    });
  };

  return <div className="product-label-page space-y-5">
    <button type="button" onClick={() => navigate('/products')} className="no-print inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2"><ArrowLeft className="h-4 w-4" /> Products</button>
    <PricingCardControls
      templates={activeTemplates}
      selectedTemplateId={selectedTemplateId}
      copies={copies}
      validUntil={validUntil}
      disabled={!ready}
      cardCount={cards.length}
      onTemplateChange={(id) => { setTemplateOverride(id); setValidUntilOverride(null); }}
      onCopiesChange={setCopies}
      onValidUntilChange={setValidUntilOverride}
      onPrint={print}
    />
    <div className="no-print flex flex-wrap gap-3 text-sm font-medium text-slate-600">
      <span>{cards.length} pricing cards</span>
      <span>{layout.pages} page{layout.pages === 1 ? '' : 's'}</span>
    </div>
    {ids.length >= MAX_LABEL_SELECTION && <p role="status" className="no-print rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A print run is limited to {MAX_LABEL_SELECTION} products.</p>}
    {cardsQuery.isLoading && <p className="p-8 text-center text-slate-500">Loading pricing cards…</p>}
    {cardsQuery.isError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">Pricing cards could not be loaded.</p>}
    {!cardsQuery.isLoading && !cardsQuery.isError && !labels.length && <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-800">No printable products were found.</p>}
    <BrowserPrintHint />
    <ProductLabelWarnings warnings={(cardsQuery.data?.warnings ?? []) as never[]} />
    {sheetTemplate && profile.data && <PricingCardPage cards={cards} template={sheetTemplate} shopProfile={profile.data} layout={layout} pageMarginMm={8} cardGapMm={3} showCutGuides />}
  </div>;
}

function defaultTemplateId(templates: Array<{ id: string }>, preferred?: string | null) {
  return templates.some(({ id }) => id === preferred) ? preferred! : templates[0]?.id ?? '';
}
