/** Mirrors the server limits in backend/src/features/service/products/product-image.ts. */
export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

export const PRODUCT_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export const PRODUCT_IMAGE_ACCEPT = PRODUCT_IMAGE_MIME_TYPES.join(',');

/** Returns a bilingual message when the file is not acceptable, otherwise null. */
export function productImageError(file: File): string | null {
  if (!PRODUCT_IMAGE_MIME_TYPES.includes(file.type)) {
    return 'Use a PNG, JPEG, WebP or GIF image / استخدم صورة بصيغة PNG أو JPEG أو WebP أو GIF';
  }
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    return 'Image must be 2 MB or smaller / يجب ألا تتجاوز الصورة 2 ميغابايت';
  }
  if (file.size === 0) {
    return 'Image file is empty / ملف الصورة فارغ';
  }
  return null;
}
