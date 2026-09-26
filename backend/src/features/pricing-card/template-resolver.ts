import { Prisma } from '@prisma/client';

export type TemplateResolutionSource = 'PRODUCT' | 'CATEGORY' | 'SHOP_DEFAULT' | 'MISSING';

export interface TemplateResolution {
  resolvedTemplateId: string | null;
  missingTemplate: boolean;
  source: TemplateResolutionSource;
}

export interface TemplateResolutionInput {
  productTemplateId?: string | null;
  productCategory?: string | null;
  categoryDefaultTemplates?: Prisma.JsonValue | null;
  shopDefaultTemplateId?: string | null;
}

/**
 * Resolves persisted pricing-card assignments. A request-scoped template
 * override is intentionally handled by the caller before this fallback chain.
 */
export function resolvePricingCardTemplate(input: TemplateResolutionInput): TemplateResolution {
  if (input.productTemplateId) return resolved(input.productTemplateId, 'PRODUCT');

  const categoryTemplateId = templateForCategory(input.categoryDefaultTemplates, input.productCategory);
  if (categoryTemplateId) return resolved(categoryTemplateId, 'CATEGORY');

  if (input.shopDefaultTemplateId) return resolved(input.shopDefaultTemplateId, 'SHOP_DEFAULT');

  return { resolvedTemplateId: null, missingTemplate: true, source: 'MISSING' };
}

function resolved(resolvedTemplateId: string, source: Exclude<TemplateResolutionSource, 'MISSING'>): TemplateResolution {
  return { resolvedTemplateId, missingTemplate: false, source };
}

function templateForCategory(value: Prisma.JsonValue | null | undefined, category: string | null | undefined): string | null {
  const normalizedCategory = category?.trim().toLocaleLowerCase();
  if (!normalizedCategory || !value || typeof value !== 'object' || Array.isArray(value)) return null;

  for (const [key, templateId] of Object.entries(value)) {
    if (key.trim().toLocaleLowerCase() === normalizedCategory && typeof templateId === 'string' && templateId) {
      return templateId;
    }
  }
  return null;
}
