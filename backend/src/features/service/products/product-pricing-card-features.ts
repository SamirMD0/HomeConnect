export const MAX_PRODUCT_FEATURES = 8;

export interface ProductPricingCardFeatureInput {
  iconCode: string;
  label?: string | null;
  value?: string | null;
  position: number;
}

export interface NormalizedProductPricingCardFeature {
  iconCode: string;
  label: string | null;
  value: string | null;
  position: number;
}

const optionalText = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
};

/** Produces the one canonical, gap-free order persisted for a product. */
export function normalizeProductPricingCardFeatures(
  entries: readonly ProductPricingCardFeatureInput[]
): NormalizedProductPricingCardFeature[] {
  const seenCodes = new Set<string>();
  const unique = entries.flatMap((entry, inputOrder) => {
    const iconCode = entry.iconCode.trim().toLowerCase();
    if (!iconCode || seenCodes.has(iconCode)) return [];
    seenCodes.add(iconCode);
    return [{
      iconCode,
      label: optionalText(entry.label),
      value: optionalText(entry.value),
      position: entry.position,
      inputOrder,
    }];
  });
  if (unique.length > MAX_PRODUCT_FEATURES) {
    throw new Error(`A product may have at most ${MAX_PRODUCT_FEATURES} pricing-card features`);
  }
  return unique
    .sort((left, right) => left.position - right.position || left.inputOrder - right.inputOrder)
    .map(({ inputOrder: _inputOrder, ...entry }, index) => ({ ...entry, position: index + 1 }));
}
