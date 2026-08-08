import { describe, expect, it } from 'vitest';
import { renderMobileScannerPage } from './mobile-scanner.page';

const html = renderMobileScannerPage('TEST-NONCE-123');

describe('mobile scanner page', () => {
  it('renders a complete document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    expect(html).toContain('<title>HomeConnect Scanner</title>');
  });

  it('applies the nonce to both inline blocks and nowhere else', () => {
    expect(html).toContain('<style nonce="TEST-NONCE-123">');
    expect(html).toContain('<script nonce="TEST-NONCE-123">');
    expect(html.match(/TEST-NONCE-123/g)).toHaveLength(2);
  });

  /**
   * The page is assembled from template literals, so an unescaped `${` would
   * silently interpolate at build time rather than reach the browser.
   */
  it('leaves no unresolved template markers or stray backticks', () => {
    expect(html).not.toContain('${');
    expect(html).not.toContain('`');
  });

  it('loads nothing from off the machine', () => {
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('offers manual entry and pairing', () => {
    expect(html).toContain('id="pair-form"');
    expect(html).toContain('id="scan-form"');
    expect(html).toContain('id="code"');
  });

  /**
   * The camera is an enhancement, never a requirement. Over plain http to a LAN
   * IP the page is not a secure context, `navigator.mediaDevices` is undefined,
   * and the button must stay hidden — leaving exactly the manual-entry page
   * that shipped before the camera existed.
   */
  it('ships the camera hidden and gated on both required APIs', () => {
    expect(html).toContain('id="camera-toggle"');
    expect(html).toContain('<button type="button" id="camera-toggle" class="secondary" hidden>');
    expect(html).toContain('<video id="camera" playsinline muted hidden>');
    expect(html).toMatch(/navigator\.mediaDevices && navigator\.mediaDevices\.getUserMedia && window\.BarcodeDetector/);
    expect(html).toContain('if (cameraSupported)');
  });

  it('never requests the camera unless the gate passed', () => {
    // The only getUserMedia call sits inside startCamera, which is only wired
    // to a listener under the support gate.
    expect(html.match(/getUserMedia\(/g)).toHaveLength(1);
    expect(html).toContain('function startCamera()');
  });

  it('releases the camera when unpairing', () => {
    expect(html).toContain("el('unpair').addEventListener('click', function () { stopCamera(); forget(); })");
    expect(html).toContain('track.stop()');
  });

  it('shows both languages on the states that matter', () => {
    for (const arabic of ['رمز الربط', 'ربط الهاتف', 'الباركود أو رمز المنتج', 'إرسال المسح']) {
      expect(html).toContain(arabic);
    }
  });

  it('closes every section it opens', () => {
    expect(html.match(/<section/g)).toHaveLength((html.match(/<\/section>/g) ?? []).length);
    expect(html.match(/<form/g)).toHaveLength((html.match(/<\/form>/g) ?? []).length);
  });

  it('talks only to the scanner endpoints', () => {
    const paths = [...html.matchAll(/'(\/api\/v1\/[^']+)'/g)].map((match) => match[1]);
    expect([...new Set(paths)].sort()).toEqual([
      '/api/v1/scanner/events',
      '/api/v1/scanner/pair',
      '/api/v1/scanner/session',
    ]);
  });
});
