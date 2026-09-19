import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PricingCardTemplate, ShopProfile } from '../../features/pricing-card/types/pricing-card.types';
import compactConfig from '../../../../backend/prisma/seed-data/pricing-card-templates/compact-legacy.json';
import { fromTemplate, parseSpecKeys, PricingCardTemplateEditorPage } from './PricingCardTemplateEditorPage';

const state = vi.hoisted(() => ({
  role: 'ADMIN' as 'ADMIN' | 'EMPLOYEE',
  template: null as PricingCardTemplate | null,
}));

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1', role: state.role } }) }));
vi.mock('../../features/pricing-card/hooks/useShopProfile', () => ({ useShopProfile: () => ({ data: profile }) }));
vi.mock('../../features/pricing-card/hooks/usePricingCardTemplates', () => ({
  usePricingCardTemplate: () => ({ data: state.template, isLoading: false }),
  useCreatePricingCardTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePricingCardTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useArchivePricingCardTemplate: () => ({ mutate: vi.fn(), isPending: false }),
}));

const profile: ShopProfile = {
  id: 'shop', name: 'Home Connect', tagline: 'Connected living', hasLogo: false,
  logoMimeType: null, logoByteSize: null, logoDataUrl: null,
  currencyCode: 'USD', currencyDisplay: 'SYMBOL', defaultPricingCardTemplateId: null,
  defaultCardValidityDays: 30, snapshotPrintedCards: true, pricingCardRolloutMode: 'BOTH',
};

const seededTemplate: PricingCardTemplate = {
  id: 'template-1', name: 'Compact Legacy', description: 'Legacy 58 × 40',
  paperMode: 'SINGLE_STICKER', paperSize: null,
  cardWidthMm: '58', cardHeightMm: '40', configVersion: 1,
  config: compactConfig as PricingCardTemplate['config'], featureMax: 0,
  specKeyOrder: ['screen_size', 'capacity_kg'],
  defaultValidityDays: 30, isActive: true, archivedAt: null, archivedReason: null,
};

describe('PricingCardTemplateEditorPage', () => {
  beforeEach(() => {
    state.role = 'ADMIN';
    state.template = seededTemplate;
  });

  it('gates the editor behind an admin-only screen for non-admins', () => {
    state.role = 'EMPLOYEE';
    expect(renderPage('template-1')).toContain('admin-only');
  });

  it('renders every controls section for an existing template', () => {
    const html = renderPage('template-1');
    expect(html).toContain('Compact Legacy');
    expect(html).toContain('Identity');
    expect(html).toContain('Paper');
    expect(html).toContain('Header');
    expect(html).toContain('Body');
    expect(html).toContain('Features');
    expect(html).toContain('Price');
    expect(html).toContain('SKU');
    expect(html).toContain('Barcode');
    expect(html).toContain('Appearance');
    expect(html).toContain('Spec keys (ordered)');
    expect(html).toContain('screen_size, capacity_kg');
  });

  it('renders the new-template form when the id is "new"', () => {
    const html = renderPage('new');
    expect(html).toContain('New pricing card template');
    expect(html).not.toContain('Archive template');
  });

  it('shows the preview panel with the sample product picker', () => {
    const html = renderPage('template-1');
    expect(html).toContain('Preview product');
  });

  describe('fromTemplate / parseSpecKeys', () => {
    it('copies the template into an editable form state without sharing references', () => {
      const form = fromTemplate(seededTemplate);
      form.specKeyOrder.push('resolution');
      expect(seededTemplate.specKeyOrder).toEqual(['screen_size', 'capacity_kg']);
      form.config.header.brand.display = 'logo';
      expect(seededTemplate.config.header.brand.display).toBe('text');
    });

    it('parses spec keys into a lowercase, filtered list', () => {
      expect(parseSpecKeys('Screen_Size, resolution, 4-K, valid_key')).toEqual(['screen_size', 'resolution', 'valid_key']);
      expect(parseSpecKeys('   ')).toEqual([]);
    });
  });
});

function renderPage(templateId: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/settings/pricing-cards/templates/${templateId}`]}>
      <Routes><Route path="/settings/pricing-cards/templates/:templateId" element={<PricingCardTemplateEditorPage />} /></Routes>
    </MemoryRouter>,
  );
}
