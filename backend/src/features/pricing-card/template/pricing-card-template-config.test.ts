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
});
