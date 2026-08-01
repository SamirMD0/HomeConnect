import { describe, expect, it } from 'vitest';
import {
  assertProductImageBytes,
  assertProductImageMimeType,
  MAX_PRODUCT_IMAGE_BYTES,
  parseProductImageUrl,
} from './product-image';

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (extra = 16) => Buffer.concat([PNG_HEADER, Buffer.alloc(extra)]);
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(16)]);
const webp = () => Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
const gif = () => Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(16)]);

describe('product image mime types', () => {
  it('accepts the supported types and ignores charset parameters', () => {
    expect(assertProductImageMimeType('image/png')).toBe('image/png');
    expect(assertProductImageMimeType('image/JPEG')).toBe('image/jpeg');
    expect(assertProductImageMimeType('image/webp; charset=binary')).toBe('image/webp');
  });

  it('rejects non-image and missing content types', () => {
    expect(() => assertProductImageMimeType('application/pdf')).toThrow(/Image must be one of/);
    expect(() => assertProductImageMimeType('text/html')).toThrow(/Image must be one of/);
    expect(() => assertProductImageMimeType(undefined)).toThrow(/Image must be one of/);
  });
});

describe('product image bytes', () => {
  it('accepts each supported format when the signature matches', () => {
    expect(assertProductImageBytes(png(), 'image/png')).toHaveLength(24);
    expect(assertProductImageBytes(jpeg(), 'image/jpeg')).toHaveLength(19);
    expect(assertProductImageBytes(webp(), 'image/webp')).toHaveLength(20);
    expect(assertProductImageBytes(gif(), 'image/gif')).toHaveLength(22);
  });

  it('rejects a payload whose bytes do not match the declared type', () => {
    expect(() => assertProductImageBytes(Buffer.from('<script>alert(1)</script>'), 'image/png'))
      .toThrow(/does not match the declared image type/);
    expect(() => assertProductImageBytes(jpeg(), 'image/png'))
      .toThrow(/does not match the declared image type/);
  });

  it('rejects empty and oversized payloads', () => {
    expect(() => assertProductImageBytes(Buffer.alloc(0), 'image/png')).toThrow(/empty/);
    expect(() => assertProductImageBytes(undefined, 'image/png')).toThrow(/empty/);
    expect(() => assertProductImageBytes(png(MAX_PRODUCT_IMAGE_BYTES), 'image/png')).toThrow(/2 MB or smaller/);
  });

  it('accepts a payload sitting exactly on the size limit', () => {
    const exact = png(MAX_PRODUCT_IMAGE_BYTES - PNG_HEADER.length);
    expect(exact).toHaveLength(MAX_PRODUCT_IMAGE_BYTES);
    expect(assertProductImageBytes(exact, 'image/png')).toHaveLength(MAX_PRODUCT_IMAGE_BYTES);
  });
});

describe('product image urls', () => {
  it('accepts http and https links', () => {
    expect(parseProductImageUrl(' https://cdn.example.com/ac.png ')).toBe('https://cdn.example.com/ac.png');
    expect(parseProductImageUrl('http://192.168.1.4/photo.jpg')).toBe('http://192.168.1.4/photo.jpg');
  });

  it('rejects script and inline-data schemes', () => {
    expect(() => parseProductImageUrl('javascript:alert(1)')).toThrow(/must start with http/);
    expect(() => parseProductImageUrl('data:image/png;base64,AAAA')).toThrow(/must start with http/);
    expect(() => parseProductImageUrl('file:///C:/Windows/system.ini')).toThrow(/must start with http/);
  });

  it('rejects malformed and overlong urls', () => {
    expect(() => parseProductImageUrl('not a url')).toThrow(/valid http\(s\) URL/);
    expect(() => parseProductImageUrl(`https://example.com/${'a'.repeat(2100)}`)).toThrow(/too long/);
  });
});
