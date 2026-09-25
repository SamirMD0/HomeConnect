import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PricingCardRolloutMode, ShopProfile } from '../types/pricing-card.types';
import { useRolloutMode } from './useRolloutMode';

const state = vi.hoisted(() => ({ profile: null as ShopProfile | null, isLoading: false }));

vi.mock('./useShopProfile', () => ({
  useShopProfile: () => ({ data: state.profile, isLoading: state.isLoading }),
}));

const profileWith = (mode: PricingCardRolloutMode): ShopProfile => ({
  id: 'shop', name: 'Home Connect', tagline: null, hasLogo: false,
  logoMimeType: null, logoByteSize: null, logoDataUrl: null,
  currencyCode: 'USD', currencyDisplay: 'SYMBOL', defaultPricingCardTemplateId: null,
  defaultCardValidityDays: 30, snapshotPrintedCards: true, pricingCardRolloutMode: mode,
});

describe('useRolloutMode', () => {
  beforeEach(() => { state.profile = null; state.isLoading = false; });

  it('defaults to BOTH while the profile is loading so a surface never blanks mid-render', () => {
    state.profile = null; state.isLoading = true;
    expect(useRolloutMode()).toMatchObject({ mode: 'BOTH', legacyEnabled: true, pricingCardEnabled: true, isLoading: true });
  });

  it('enables both surfaces in BOTH mode', () => {
    state.profile = profileWith('BOTH');
    expect(useRolloutMode()).toMatchObject({ legacyEnabled: true, pricingCardEnabled: true });
  });

  it('hides pricing card in LEGACY_ONLY mode', () => {
    state.profile = profileWith('LEGACY_ONLY');
    expect(useRolloutMode()).toMatchObject({ legacyEnabled: true, pricingCardEnabled: false });
  });

  it('hides legacy in TEMPLATE_ONLY mode', () => {
    state.profile = profileWith('TEMPLATE_ONLY');
    expect(useRolloutMode()).toMatchObject({ legacyEnabled: false, pricingCardEnabled: true });
  });
});
