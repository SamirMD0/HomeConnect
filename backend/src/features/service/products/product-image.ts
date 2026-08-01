import { ValidationError } from '../../../lib/errors';

export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

export const PRODUCT_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type ProductImageMimeType = (typeof PRODUCT_IMAGE_MIME_TYPES)[number];

/**
 * Content-Type is client supplied, so the declared type is only accepted when the
 * bytes themselves start with the matching signature.
 */
const SIGNATURES: Record<ProductImageMimeType, (buffer: Buffer) => boolean> = {
  'image/png': (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/webp': (buffer) => buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  'image/gif': (buffer) => ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii')),
};

export function assertProductImageMimeType(value: string | undefined): ProductImageMimeType {
  const mimeType = (value ?? '').split(';')[0].trim().toLowerCase();
  if (!PRODUCT_IMAGE_MIME_TYPES.includes(mimeType as ProductImageMimeType)) {
    throw new ValidationError(
      `Image must be one of: ${PRODUCT_IMAGE_MIME_TYPES.join(', ')}`,
      { field: 'image' }
    );
  }
  return mimeType as ProductImageMimeType;
}

export function assertProductImageBytes(buffer: Buffer | undefined, mimeType: ProductImageMimeType): Buffer {
  if (!buffer || buffer.length === 0) {
    throw new ValidationError('Image file is empty', { field: 'image' });
  }
  if (buffer.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw new ValidationError('Image must be 2 MB or smaller', { field: 'image' });
  }
  if (!SIGNATURES[mimeType](buffer)) {
    throw new ValidationError('File content does not match the declared image type', { field: 'image' });
  }
  return buffer;
}

/**
 * External image links only. `javascript:` and `data:` are rejected so a stored
 * value can never become a script or an unbounded inline payload in the browser.
 */
export function parseProductImageUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 2048) {
    throw new ValidationError('Image URL is too long', { field: 'imageUrl' });
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ValidationError('Image URL must be a valid http(s) URL', { field: 'imageUrl' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Image URL must start with http:// or https://', { field: 'imageUrl' });
  }
  return parsed.toString();
}
