import { describe, expect, it } from 'vitest';
import { sanitizeSvg } from './sanitize-svg';

describe('sanitizeSvg', () => {
  it('rejects empty, malformed, and script-bearing SVG', () => {
    expect(() => sanitizeSvg('')).toThrow();
    expect(() => sanitizeSvg('<div>not svg</div>')).toThrow();
    expect(() => sanitizeSvg('<svg><script>alert(1)</script></svg>')).toThrow();
  });

  it('keeps safe SVG geometry and strips event handlers', () => {
    const clean = sanitizeSvg('<svg viewBox="0 0 24 24" onclick="alert(1)"><g onload="x"><path fill="currentColor" d="M1 1h2v2z"/></g></svg>');
    expect(clean).toContain('<svg');
    expect(clean).toContain('<g>');
    expect(clean).toContain('<path');
    expect(clean).toContain('currentColor');
    expect(clean).not.toMatch(/onclick|onload/i);
  });

  it('rejects payloads larger than 8 KiB', () => {
    expect(() => sanitizeSvg(`<svg><desc>${'x'.repeat(8192)}</desc></svg>`)).toThrow(/8 KB/);
  });
});
