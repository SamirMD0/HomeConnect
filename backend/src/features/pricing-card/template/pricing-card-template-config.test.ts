import { describe, expect, it } from 'vitest';
import { parseTemplateConfig, PricingCardTemplateConfigZ } from './pricing-card-template-config.z';
import { minimumTemplateConfig } from './pricing-card-template-config.fixture';

describe('pricing card template config', () => {
  it('parses the minimum version-one config', () => {
    expect(parseTemplateConfig(minimumTemplateConfig)).toEqual(minimumTemplateConfig);
  });

  it('rejects missing version, invalid currency display, and oversized JSON', () => {
    const { configVersion: _version, ...withoutVersion } = minimumTemplateConfig;
    expect(PricingCardTemplateConfigZ.safeParse(withoutVersion).success).toBe(false);
    expect(PricingCardTemplateConfigZ.safeParse({ ...minimumTemplateConfig, price: { ...minimumTemplateConfig.price, currencyDisplay: 'BTC' } }).success).toBe(false);
    expect(PricingCardTemplateConfigZ.safeParse({ ...minimumTemplateConfig, specKeyAliases: { huge: ['x'.repeat(17 * 1024)] } }).success).toBe(false);
  });

  it('reads a config stored before price prominence existed as the normal tier', () => {
    // Every template saved before v2.1.0 is this shape. It must keep parsing,
    // and it must land on the 6 mm base those cards were drawn against.
    const { prominence: _prominence, ...priceWithoutProminence } = minimumTemplateConfig.price;

    const parsed = parseTemplateConfig({ ...minimumTemplateConfig, price: priceWithoutProminence });

    expect(parsed.price.prominence).toBe('normal');
  });

  it('keeps older configs compatible by defaulting the details and specs font size', () => {
    const { detailsFontScale: _detailsFontScale, ...bodyWithoutDetailsFontScale } = minimumTemplateConfig.body;

    const parsed = parseTemplateConfig({ ...minimumTemplateConfig, body: bodyWithoutDetailsFontScale });

    expect(parsed.body.detailsFontScale).toBe(1);
  });

  it('keeps older configs muted unless bold black details are selected', () => {
    const { detailsBoldBlack: _detailsBoldBlack, ...bodyWithoutDetailsBoldBlack } = minimumTemplateConfig.body;

    const parsed = parseTemplateConfig({ ...minimumTemplateConfig, body: bodyWithoutDetailsBoldBlack });

    expect(parsed.body.detailsBoldBlack).toBe(false);
  });

  it('rejects a price prominence outside the three tiers', () => {
    expect(PricingCardTemplateConfigZ.safeParse({
      ...minimumTemplateConfig,
      price: { ...minimumTemplateConfig.price, prominence: 'huge' },
    }).success).toBe(false);
  });

  it('supports only the row and grid-chip feature layouts', () => {
    expect(PricingCardTemplateConfigZ.safeParse({
      ...minimumTemplateConfig,
      features: { ...minimumTemplateConfig.features, layout: 'grid-chip' },
    }).success).toBe(true);
    expect(PricingCardTemplateConfigZ.safeParse({
      ...minimumTemplateConfig,
      features: { ...minimumTemplateConfig.features, layout: 'grid-2x3' },
    }).success).toBe(false);
  });
});
