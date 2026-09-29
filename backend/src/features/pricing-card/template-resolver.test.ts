import { describe, expect, it } from 'vitest';
import { resolvePricingCardTemplate } from './template-resolver';

const productTemplateId = '10000000-0000-4000-8000-000000000001';
const categoryTemplateId = '20000000-0000-4000-8000-000000000002';
const shopTemplateId = '30000000-0000-4000-8000-000000000003';

describe('pricing-card template resolver', () => {
  it('uses the product assignment before every fallback', () => {
    expect(resolvePricingCardTemplate({
      productTemplateId,
      productCategory: 'TV',
      categoryDefaultTemplates: { tv: categoryTemplateId },
      shopDefaultTemplateId: shopTemplateId,
    })).toEqual({ resolvedTemplateId: productTemplateId, missingTemplate: false, source: 'PRODUCT' });
  });

  it('uses a case-insensitive category assignment when the product has no assignment', () => {
    expect(resolvePricingCardTemplate({
      productCategory: ' TV ',
      categoryDefaultTemplates: { tv: categoryTemplateId },
      shopDefaultTemplateId: shopTemplateId,
    })).toEqual({ resolvedTemplateId: categoryTemplateId, missingTemplate: false, source: 'CATEGORY' });
  });

  it('prefers the real category, then honors a legacy preset type mapping', () => {
    expect(resolvePricingCardTemplate({
      productCategory: 'Appliances', legacyProductType: 'TV',
      categoryDefaultTemplates: { appliances: categoryTemplateId, tv: shopTemplateId },
    }).resolvedTemplateId).toBe(categoryTemplateId);
    expect(resolvePricingCardTemplate({
      productCategory: 'Unmapped', legacyProductType: 'TV',
      categoryDefaultTemplates: { tv: categoryTemplateId },
    }).resolvedTemplateId).toBe(categoryTemplateId);
  });

  it('uses the shop default when product and category assignments are absent', () => {
    expect(resolvePricingCardTemplate({
      productCategory: 'appliance',
      categoryDefaultTemplates: { tv: categoryTemplateId },
      shopDefaultTemplateId: shopTemplateId,
    })).toEqual({ resolvedTemplateId: shopTemplateId, missingTemplate: false, source: 'SHOP_DEFAULT' });
  });

  it('reports a missing template when no fallback can resolve one', () => {
    expect(resolvePricingCardTemplate({
      productCategory: 'appliance',
      categoryDefaultTemplates: { tv: categoryTemplateId },
    })).toEqual({ resolvedTemplateId: null, missingTemplate: true, source: 'MISSING' });
  });
});
