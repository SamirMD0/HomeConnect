export const MAX_PRODUCT_SPECIFICATIONS = 40;
export const MAX_PRODUCT_SPECIFICATIONS_BYTES = 8 * 1024;

export interface ProductSpecification {
  label: string;
  value: string;
}

export function normalizeProductSpecifications(entries: ProductSpecification[]): ProductSpecification[] {
  return entries
    .map((entry) => ({ label: entry.label.trim(), value: entry.value.trim() }))
    .filter((entry) => entry.label.length > 0 && entry.value.length > 0);
}

export function serializedSpecificationsSize(entries: ProductSpecification[]): number {
  return Buffer.byteLength(JSON.stringify(entries), 'utf8');
}
