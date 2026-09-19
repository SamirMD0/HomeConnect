import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ShopProfile } from '../../features/pricing-card/types/pricing-card.types';
import {
  detailChanges,
  isDirty,
  ShopProfileSettingsPage,
} from './ShopProfileSettingsPage';

const state = vi.hoisted(() => ({
  role: 'ADMIN' as 'ADMIN' | 'EMPLOYEE',
  profile: null as ShopProfile | null,
}));

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-1', role: state.role } }) }));
vi.mock('../../features/pricing-card/hooks/useShopProfile', () => ({
  useShopProfile: () => ({ data: state.profile, isLoading: false, isError: false }),
  useUpdateShopProfile: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateShopProfileLogo: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../features/pricing-card/hooks/usePricingCardTemplates', () => ({
  usePricingCardTemplates: () => ({ data: [{ id: 'template-tv', name: 'TV Large Card' }], isLoading: false }),
}));

const baseProfile = {
  name: 'Home Connect',
  tagline: 'Connected living',
  currencyCode: 'USD',
  currencyDisplay: 'SYMBOL' as const,
  defaultPricingCardTemplateId: 'template-tv',
  defaultCardValidityDays: 30,
  snapshotPrintedCards: true,
  pricingCardRolloutMode: 'BOTH' as const,
};

const seedForm = {
  name: baseProfile.name,
  tagline: baseProfile.tagline ?? '',
  currencyCode: baseProfile.currencyCode,
  currencyDisplay: baseProfile.currencyDisplay,
  defaultPricingCardTemplateId: baseProfile.defaultPricingCardTemplateId ?? '',
  defaultCardValidityDays: String(baseProfile.defaultCardValidityDays),
  snapshotPrintedCards: baseProfile.snapshotPrintedCards,
  pricingCardRolloutMode: baseProfile.pricingCardRolloutMode,
};

describe('ShopProfileSettingsPage', () => {
  beforeEach(() => {
    state.role = 'ADMIN';
    state.profile = fullProfile();
  });

  describe('detailChanges', () => {
    it('returns an empty object when nothing changed', () => {
      expect(detailChanges(seedForm, baseProfile)).toEqual({});
    });

    it('normalizes tagline to null when the user clears the field', () => {
      expect(detailChanges({ ...seedForm, tagline: '   ' }, baseProfile)).toEqual({ tagline: null });
    });

    it('normalizes template id to null when the user picks None', () => {
      expect(detailChanges({ ...seedForm, defaultPricingCardTemplateId: '' }, baseProfile)).toEqual({ defaultPricingCardTemplateId: null });
    });

    it('emits currency, validity, rollout, and snapshot changes independently', () => {
      const changed = detailChanges({
        ...seedForm,
        currencyCode: 'LBP', currencyDisplay: 'CODE',
        defaultCardValidityDays: '45', snapshotPrintedCards: false, pricingCardRolloutMode: 'LEGACY_ONLY',
      }, baseProfile);
      expect(changed).toEqual({
        currencyCode: 'LBP', currencyDisplay: 'CODE',
        defaultCardValidityDays: 45, snapshotPrintedCards: false, pricingCardRolloutMode: 'LEGACY_ONLY',
      });
    });

    it('flags dirty state when the trimmed name differs', () => {
      expect(isDirty({ ...seedForm, name: 'Home Connect Beirut' }, baseProfile)).toBe(true);
      expect(isDirty(seedForm, baseProfile)).toBe(false);
    });
  });

  describe('render gates', () => {
    it('shows an admin-only gate for non-admin viewers', () => {
      state.role = 'EMPLOYEE';
      const html = renderPage();
      expect(html).toContain('admin-only');
    });

    it('renders the details, logo, and rollout controls for admins with a loaded profile', () => {
      const html = renderPage();
      expect(html).toContain('Shop profile');
      expect(html).toContain('Details');
      expect(html).toContain('Logo');
      expect(html).toContain('Default pricing card template');
      expect(html).toContain('Both label and pricing card');
      expect(html).toContain('Snapshot every printed card');
    });

    it('shows the existing logo data URL when present', () => {
      state.profile = fullProfile({ hasLogo: true, logoDataUrl: 'data:image/webp;base64,ABC' });
      const html = renderPage();
      expect(html).toContain('data:image/webp;base64,ABC');
    });

    it('shows the empty state when no logo is stored', () => {
      state.profile = fullProfile({ hasLogo: false, logoDataUrl: null });
      const html = renderPage();
      expect(html).toContain('No logo');
    });
  });
});

function renderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/settings/pricing-cards/shop-profile']}>
      <Routes><Route path="/settings/pricing-cards/shop-profile" element={<ShopProfileSettingsPage />} /></Routes>
    </MemoryRouter>,
  );
}

function fullProfile(overrides: Partial<ShopProfile> = {}): ShopProfile {
  return {
    id: 'shop', name: 'Home Connect', tagline: 'Connected living', hasLogo: false,
    logoMimeType: null, logoByteSize: null, logoDataUrl: null,
    currencyCode: 'USD', currencyDisplay: 'SYMBOL', defaultPricingCardTemplateId: 'template-tv',
    defaultCardValidityDays: 30, snapshotPrintedCards: true, pricingCardRolloutMode: 'BOTH',
    ...overrides,
  };
}
