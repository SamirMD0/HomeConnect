export interface ProductLabelDimensions { widthMm: number; heightMm: number }

export const DEFAULT_PRODUCT_LABEL_DIMENSIONS: ProductLabelDimensions = { widthMm: 50, heightMm: 30 };
const STORAGE_KEY = 'homeconnect.product-label-dimensions';

export function loadProductLabelDimensions(): ProductLabelDimensions {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<ProductLabelDimensions>;
    if (valid(value.widthMm) && valid(value.heightMm)) return { widthMm: value.widthMm!, heightMm: value.heightMm! };
  } catch { /* Use the printer-safe default when preferences are malformed. */ }
  return DEFAULT_PRODUCT_LABEL_DIMENSIONS;
}

export function saveProductLabelDimensions(value: ProductLabelDimensions): void {
  if (!valid(value.widthMm) || !valid(value.heightMm)) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 20 && value <= 150;
