import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import compactConfig from '../../../../backend/prisma/seed-data/pricing-card-templates/compact-legacy.json';
import type { PricingCardTemplate } from '../../features/pricing-card/types/pricing-card.types';
import { ProductPricingCardsPage } from './ProductPricingCardsPage';

const state = vi.hoisted(() => ({ cards: {} as Record<string, unknown> }));

vi.mock('../../features/pricing-card/hooks/useShopProfile', () => ({ useShopProfile: () => ({ data: profile, isLoading: false }) }));
vi.mock('../../features/pricing-card/hooks/usePricingCardTemplates', () => ({
  usePricingCardTemplates: () => ({ data: [template], isLoading: false }),
}));
vi.mock('../../features/pricing-card/hooks/usePricingCard', () => ({ usePricingCards: () => state.cards }));

const template: PricingCardTemplate = {
  id: 'template-compact', name: 'Compact Legacy', description: null, paperMode: 'SINGLE_STICKER', paperSize: null,
  cardWidthMm: '58', cardHeightMm: '40', configVersion: 1,
  config: compactConfig as PricingCardTemplate['config'], featureMax: 0, specKeyOrder: [],
  defaultValidityDays: null, isActive: true, archivedAt: null, archivedReason: null,
};
const profile = {
  id: 'shop', name: 'Home Connect', tagline: null, hasLogo: false, logoMimeType: null, logoByteSize: null,
  currencyCode: 'USD', currencyDisplay: 'SYMBOL' as const, defaultPricingCardTemplateId: template.id,
  defaultCardValidityDays: 30, snapshotPrintedCards: true, pricingCardRolloutMode: 'BOTH' as const,
};
const labels = ['a', 'b', 'c'].map((id, index) => ({
  id, name: `Product ${index + 1}`, model: `M-${index + 1}`, brand: 'TCL', sku: `HC-${id}`,
  barcodeValue: `HC-${id}`, barcodeSource: 'SKU' as const, cashPrice: `${index + 1}00.00`,
  currency: { code: 'USD', display: 'SYMBOL' as const, symbol: '$' },
}));

const renderPage = () => renderToStaticMarkup(
  <MemoryRouter initialEntries={['/products/pricing-cards?ids=a,b,c']}>
    <Routes><Route path="/products/pricing-cards" element={<ProductPricingCardsPage />} /></Routes>
  </MemoryRouter>,
);

describe('ProductPricingCardsPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T12:00:00.000Z'));
    state.cards = { data: { labels, warnings: [] }, isLoading: false, isError: false };
  });

  it('renders three selected products in one A4 sheet with a visible page marker', () => {
    const html = renderPage();
    expect(html).toContain('3 pricing cards');
    expect(html).toContain('1 page');
    expect(html).toContain('pricing-card-page-sheet');
    expect(html).toContain('--pricing-card-paper-width:210mm');
    for (const label of labels) expect(html).toContain(label.name);
  });

  it('disables output until all card data is ready', () => {
    state.cards = { data: undefined, isLoading: true, isError: false };
    expect(renderPage()).toContain('disabled=""');
  });
});
