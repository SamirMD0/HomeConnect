import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { calculateLabelSheetLayout } from '../../products/utils/label-sheet-layout';
import compactConfig from '../../../../../backend/prisma/seed-data/pricing-card-templates/compact-legacy.json';
import { sampleMinimal } from '../samples';
import type { PricingCardTemplate, ShopProfile } from '../types/pricing-card.types';
import { PricingCardPage } from './PricingCardPage';

const profile: ShopProfile = {
  id: 'shop', name: 'Home Connect', tagline: null, hasLogo: false, logoMimeType: null, logoByteSize: null,
  currencyCode: 'USD', currencyDisplay: 'SYMBOL', defaultPricingCardTemplateId: null,
  defaultCardValidityDays: 30, snapshotPrintedCards: true, pricingCardRolloutMode: 'BOTH',
};

const baseTemplate: PricingCardTemplate = {
  id: 'compact', name: 'Compact', description: null, paperMode: 'SINGLE_STICKER', paperSize: null,
  cardWidthMm: '58', cardHeightMm: '40', configVersion: 1,
  config: compactConfig as PricingCardTemplate['config'], featureMax: 0, specKeyOrder: [],
  defaultValidityDays: null, isActive: true, archivedAt: null, archivedReason: null,
};

const cards = Array.from({ length: 19 }, (_, index) => ({
  product: { ...sampleMinimal.product, id: `product-${index}`, sku: `HC-${index}`, barcodeValue: `HC-${index}` },
}));

describe('PricingCardPage', () => {
  it('renders one physical page per card for single-sticker templates', () => {
    const html = renderToStaticMarkup(<PricingCardPage cards={cards.slice(0, 2)} template={baseTemplate} shopProfile={profile} />);
    expect((html.match(/class="pricing-card-page pricing-card-page-fixed"/g) ?? []).length).toBe(2);
    expect(html).toContain('@page { size: 58mm 40mm; margin: 0; }');
  });

  it('chunks sheet templates with the unchanged label sheet geometry', () => {
    const sheetTemplate = { ...baseTemplate, paperMode: 'SHEET' as const, paperSize: 'A4' as const };
    const input = { paper: 'A4' as const, labelWidthMm: 58, labelHeightMm: 40, pageMarginMm: 8, labelGapMm: 3, columns: 'AUTO' as const };
    const layout = calculateLabelSheetLayout(input, cards.length);
    const html = renderToStaticMarkup(
      <PricingCardPage cards={cards} template={sheetTemplate} shopProfile={profile} layout={layout} pageMarginMm={8} cardGapMm={3} />,
    );
    expect((html.match(/class="pricing-card-page pricing-card-page-sheet"/g) ?? []).length).toBe(2);
    expect(html).toContain('--pricing-card-columns:3');
    expect(html).toContain('@page { size: A4; margin: 0; }');
  });
});
