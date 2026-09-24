import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import tvConfig from '../../../../backend/prisma/seed-data/pricing-card-templates/tv-large.json';
import type { PricingCardTemplate } from '../../features/pricing-card/types/pricing-card.types';
import {
  printPricingCardAndSnapshot,
  ProductPricingCardPage,
  resolvePricingCardValidUntil,
  toggleFeatureSelection,
} from './ProductPricingCardPage';

const state = vi.hoisted(() => ({
  role: 'ADMIN',
  card: {} as Record<string, unknown>,
  recordPrint: vi.fn(),
  secretPreview: vi.fn(),
}));

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1', role: state.role } }) }));
vi.mock('../../features/pricing-card/hooks/useShopProfile', () => ({ useShopProfile: () => ({ data: profile, isLoading: false }) }));
vi.mock('../../features/pricing-card/hooks/usePricingCardTemplates', () => ({
  usePricingCardTemplates: () => ({ data: [template], isLoading: false }),
  usePricingCardSpecCatalog: () => ({ data: [
    { key: 'dimensions', label: 'Dimensions', group: 'Physical' },
    { key: 'screen_size', label: 'Screen size', group: 'Display', unit: 'inch' },
  ], isLoading: false }),
}));
vi.mock('../../features/pricing-card/hooks/usePricingCard', () => ({
  usePricingCard: () => state.card,
  useRecordPricingCardPrint: () => ({ mutateAsync: state.recordPrint, isPending: false }),
  usePricingCardSecretPreview: () => ({ mutate: state.secretPreview, reset: vi.fn(), data: undefined, isPending: false }),
}));
vi.mock('../../features/pricing/hooks/usePricingPresets', () => ({
  useLabelSecretConfiguration: () => ({ data: secretConfiguration }),
}));
vi.mock('../../features/products/components/LabelSecretPrintControls', () => ({
  LabelSecretPrintControls: () => <div>SECRET PRICE PANEL</div>,
}));
vi.mock('../../features/products/hooks/useProducts', () => ({
  useProduct: () => ({ data: undefined, isLoading: true, isError: false }),
  useUpdateProduct: () => ({ mutate: vi.fn(), isPending: false }),
}));

const template: PricingCardTemplate = {
  id: 'template-tv', name: 'TV Large Card', description: null, paperMode: 'SINGLE_STICKER', paperSize: null,
  cardWidthMm: '148', cardHeightMm: '105', configVersion: 1,
  config: tvConfig as PricingCardTemplate['config'], featureMax: 6,
  specKeyOrder: ['screen_size'], defaultValidityDays: 10, isActive: true, archivedAt: null, archivedReason: null,
};
const profile = {
  id: 'shop', name: 'Home Connect', tagline: 'Connected living', hasLogo: false, logoMimeType: null, logoByteSize: null,
  currencyCode: 'USD', currencyDisplay: 'SYMBOL' as const, defaultPricingCardTemplateId: template.id,
  defaultCardValidityDays: 30, snapshotPrintedCards: true, pricingCardRolloutMode: 'BOTH' as const,
};
const payload = {
  id: 'product-1', name: 'TCL QLED TV', model: '50C655',
  brand: { canonicalName: 'tcl', displayName: 'TCL', hasLogo: false },
  sku: 'HC-000001', barcodeValue: 'HC-000001', barcodeSource: 'SKU' as const,
  cashPrice: '1299.00', currency: { code: 'USD', display: 'SYMBOL' as const, symbol: '$' },
  validUntil: '2026-09-29',
  features: [
    { iconCode: 'qled', label: 'QLED', position: 0, iconSvg: '<svg viewBox="0 0 24 24"></svg>' },
    { iconCode: 'wifi', label: 'Wi-Fi', position: 1, iconSvg: '<svg viewBox="0 0 24 24"></svg>' },
  ],
};
const secretConfiguration = {
  settings: { showCodeOnLabel: true, defaultPricingPresetId: 'preset-1', defaultEncodingPresetId: 'encoding-1' },
  allowedPricingPresets: [{ id: 'preset-1', name: 'Staff', isActive: true }],
  encodingPresets: [{ id: 'encoding-1', name: 'Code', mode: 'PRICE', prefix: '', suffix: '', isActive: true }],
};

const renderPage = () => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter initialEntries={['/products/product-1/pricing-card']}>
      <Routes><Route path="/products/:id/pricing-card" element={<ProductPricingCardPage />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>,
);

describe('ProductPricingCardPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-19T12:00:00.000Z'));
    state.role = 'ADMIN';
    state.card = { data: { payload, warnings: [] }, isLoading: false, isError: false };
    state.recordPrint.mockReset().mockResolvedValue({ recorded: true, print: { id: 'print-1' } });
    state.secretPreview.mockReset();
  });

  it('loads the shop default template, bounded copies, validity fallback, features, and preview', () => {
    const html = renderPage();
    expect(html).toContain('TV Large Card');
    expect(html).toContain('max="100"');
    expect(html).toContain('value="2026-09-29"');
    expect(html).toContain('QLED');
    expect(html).toContain('Wi-Fi');
    expect(html).toContain('TCL QLED TV');
    expect(html).not.toContain('disabled=""');
  });

  it('disables printing until the pricing-card binding is ready', () => {
    state.card = { data: undefined, isLoading: true, isError: false };
    const html = renderPage();
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*|disabled=""/);
  });

  it('keeps feature selection stable while toggling and resetting defaults', () => {
    expect(toggleFeatureSelection(['qled', 'wifi'], 'wifi')).toEqual(['qled']);
    expect(toggleFeatureSelection(['qled'], 'wifi')).toEqual(['qled', 'wifi']);
  });

  it('resolves validity as user override, then template days, then shop days', () => {
    const today = new Date('2026-09-19T12:00:00.000Z');
    expect(resolvePricingCardValidUntil('2027-01-02', 10, 30, today)).toBe('2027-01-02');
    expect(resolvePricingCardValidUntil(null, 10, 30, today)).toBe('2026-09-29');
    expect(resolvePricingCardValidUntil(null, null, 30, today)).toBe('2026-10-19');
  });

  it('records the snapshot only after a successful print and never makes snapshot failure fail printing', async () => {
    const events: string[] = [];
    const result = await printPricingCardAndSnapshot({
      print: async () => { events.push('print'); return { printed: true }; },
      snapshot: async () => { events.push('snapshot'); throw new Error('offline'); },
      onSnapshotError: () => events.push('snapshot-warning'),
    });
    expect(result).toEqual({ printed: true });
    expect(events).toEqual(['print', 'snapshot', 'snapshot-warning']);
  });

  it('shows the reused secret controls only to admins', () => {
    expect(renderPage()).toContain('SECRET PRICE PANEL');
    state.role = 'EMPLOYEE';
    expect(renderPage()).not.toContain('SECRET PRICE PANEL');
  });

  it('shows the inline product editor so the operator can fix a spec without leaving the print flow', () => {
    const html = renderPage();
    expect(html).toContain('Edit product data');
    expect(html).toContain('data-testid="inline-product-editor"');
    // The panel body is present in the DOM even when the <details> element is closed.
    expect(html).toContain('Loading product data');
  });

  it('does not warn about thermal print when the template is a color template', () => {
    // TV Large ships with palette 'color', so the amber thermal warning must not fire.
    expect(renderPage()).not.toContain('Thermal template');
  });
});
