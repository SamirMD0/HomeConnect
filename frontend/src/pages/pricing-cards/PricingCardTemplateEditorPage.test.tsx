import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PricingCardTemplate, ShopProfile } from '../../features/pricing-card/types/pricing-card.types';
import compactConfig from '../../../../backend/prisma/seed-data/pricing-card-templates/compact-legacy.json';
import { fromTemplate, PricingCardTemplateEditorPage } from './PricingCardTemplateEditorPage';

const state = vi.hoisted(() => ({
  role: 'ADMIN' as 'ADMIN' | 'EMPLOYEE',
  template: null as PricingCardTemplate | null,
}));

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1', role: state.role } }) }));
vi.mock('../../features/pricing-card/hooks/useShopProfile', () => ({ useShopProfile: () => ({ data: profile }) }));
vi.mock('../../features/pricing-card/hooks/usePricingCardTemplates', () => ({
  usePricingCardTemplate: () => ({ data: state.template, isLoading: false }),
  usePricingCardSpecCatalog: () => ({
    data: [
      { key: 'screen_size', label: 'Screen size', group: 'Display', unit: 'inch' },
      { key: 'resolution', label: 'Resolution', group: 'Display' },
      { key: 'capacity_kg', label: 'Capacity (kg)', group: 'Capacity', unit: 'kg' },
    ],
    isLoading: false,
    isError: false,
  }),
  useCreatePricingCardTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdatePricingCardTemplate: () => ({ mutate: vi.fn(), isPending: false }),
  useArchivePricingCardTemplate: () => ({ mutate: vi.fn(), isPending: false }),
}));

const profile: ShopProfile = {
  id: 'shop', name: 'Home Connect', tagline: 'Connected living', hasLogo: false,
  logoMimeType: null, logoByteSize: null, logoDataUrl: null,
  currencyCode: 'USD', currencyDisplay: 'SYMBOL', defaultPricingCardTemplateId: null, categoryDefaultTemplates: {},
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

  it('renders every controls group for an existing template', () => {
    const html = renderPage('template-1');
    expect(html).toContain('Compact Legacy');
    expect(html).toContain('Layout');
    expect(html).toContain('Header');
    expect(html).toContain('Product info');
    expect(html).toContain('Features');
    expect(html).toContain('Grid chips');
    expect(html).toContain('Price');
    expect(html).toContain('Barcode &amp; SKU');
    expect(html).toContain('Validity');
    expect(html).toContain('Appearance');
    expect(html).toContain('Advanced');
    expect(html).toContain('Available specification keys');
    expect(html).toContain('Selected order');
    expect(html).toContain('Screen size');
    expect(html).toContain('Capacity (kg)');
    expect(html).toContain('Move Screen size up');
    expect(html).not.toContain('Comma-separated canonical keys');
    expect(html).not.toContain('placeholder="screen_size, resolution, refresh_rate"');
  });

  it('makes the preview column sticky at xl and keeps it in the DOM after every group', () => {
    const html = renderPage('template-1');
    expect(html).toContain('xl:sticky');
    expect(html).toContain('data-testid="template-editor-preview"');
    const previewIndex = html.indexOf('data-testid="template-editor-preview"');
    const advancedIndex = html.indexOf('Advanced');
    expect(previewIndex).toBeGreaterThan(-1);
    expect(advancedIndex).toBeGreaterThan(-1);
    // The preview lives in the aside that follows the form; asserting order proves the
    // sticky container is emitted alongside every group, not before them.
    expect(previewIndex).toBeGreaterThan(advancedIndex);
  });

  it('opens the Advanced group collapsed by default and other groups open', () => {
    const html = renderPage('template-1');
    const layoutTag = html.match(/<details([^>]*)\bdata-group-id="layout"([^>]*)>/);
    const advancedTag = html.match(/<details([^>]*)\bdata-group-id="advanced"([^>]*)>/);
    expect(layoutTag).not.toBeNull();
    expect(advancedTag).not.toBeNull();
    const layoutAttrs = `${layoutTag?.[1] ?? ''}${layoutTag?.[2] ?? ''}`;
    const advancedAttrs = `${advancedTag?.[1] ?? ''}${advancedTag?.[2] ?? ''}`;
    expect(layoutAttrs).toMatch(/\bopen(=|\s|$)/);
    expect(advancedAttrs).not.toMatch(/\bopen(=|\s|$)/);
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

  describe('fromTemplate', () => {
    it('copies the template into an editable form state without sharing references', () => {
      const form = fromTemplate(seededTemplate);
      form.specKeyOrder.push('resolution');
      expect(seededTemplate.specKeyOrder).toEqual(['screen_size', 'capacity_kg']);
      form.config.header.brand.display = 'logo';
      expect(seededTemplate.config.header.brand.display).toBe('text');
    });
  });
});

function renderPage(templateId: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[`/pricing-cards/templates/${templateId}`]}>
      <Routes><Route path="/pricing-cards/templates/:templateId" element={<PricingCardTemplateEditorPage />} /></Routes>
    </MemoryRouter>,
  );
}
