import DOMPurify from 'isomorphic-dompurify';
import { ValidationError } from '../../../lib/errors';

export const MAX_FEATURE_ICON_SVG_BYTES = 8 * 1024;

export function sanitizeSvg(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new ValidationError('SVG is required');
  if (Buffer.byteLength(trimmed, 'utf8') > MAX_FEATURE_ICON_SVG_BYTES) throw new ValidationError('SVG must be 8 KB or smaller');
  if (/<\s*script\b/i.test(trimmed)) throw new ValidationError('SVG scripts are not allowed');

  const sanitized = DOMPurify.sanitize(trimmed, {
    USE_PROFILES: { svg: true },
    FORBID_TAGS: ['script', 'foreignObject'],
    FORBID_ATTR: ['style'],
  }).trim();
  if (!/^<svg(?:\s|>)/i.test(sanitized) || !/<\/svg>$/i.test(sanitized)) {
    throw new ValidationError('A well-formed SVG root element is required');
  }
  return sanitized;
}
