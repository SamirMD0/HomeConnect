import { describe, expect, it } from 'vitest';
import { minimumTemplateConfig } from '../../../../../backend/src/features/pricing-card/template/pricing-card-template-config.fixture';
import { PricingCardTemplateConfigZ as BackendTemplateConfigZ } from '../../../../../backend/src/features/pricing-card/template/pricing-card-template-config.z';
import { PricingCardTemplateConfigZ as FrontendTemplateConfigZ } from './template-config.z';

describe('pricing card template config schema parity', () => {
  it('parses the canonical minimum payload identically in frontend and backend', () => {
    expect(FrontendTemplateConfigZ.parse(minimumTemplateConfig)).toEqual(
      BackendTemplateConfigZ.parse(minimumTemplateConfig),
    );
  });

  it('rejects the same malformed payload in frontend and backend', () => {
    const malformed = { ...minimumTemplateConfig, configVersion: 2 };

    expect(FrontendTemplateConfigZ.safeParse(malformed).success).toBe(
      BackendTemplateConfigZ.safeParse(malformed).success,
    );
  });
});
