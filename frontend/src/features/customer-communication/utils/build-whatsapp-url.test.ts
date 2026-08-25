import { describe, expect, it } from 'vitest';
import { buildWhatsAppUrl, MAX_WHATSAPP_URL_LENGTH } from './build-whatsapp-url';
import { MAX_MESSAGE_LENGTH } from './message-templates';

describe('buildWhatsAppUrl', () => {
  it('builds a wa.me link with digits only and an encoded body', () => {
    const result = buildWhatsAppUrl('96170123456', 'Hello there');
    expect(result).toEqual({ ok: true, url: 'https://wa.me/96170123456?text=Hello%20there' });
  });

  it('encodes newlines as %0A', () => {
    const result = buildWhatsAppUrl('96170123456', 'line one\nline two');
    expect(result.ok && result.url).toContain('line%20one%0Aline%20two');
  });

  it('round-trips Arabic text through encodeURIComponent', () => {
    const body = 'مرحباً محمد، معك HomeConnect.';
    const result = buildWhatsAppUrl('96170123456', body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const text = new URL(result.url).searchParams.get('text');
    expect(text).toBe(body);
  });

  it('always targets https://wa.me', () => {
    const result = buildWhatsAppUrl('96170123456', 'hi');
    expect(result.ok && result.url.startsWith('https://wa.me/')).toBe(true);
  });

  it('rejects a phone that is not 8-15 digits', () => {
    expect(buildWhatsAppUrl('', 'hi')).toEqual({ ok: false, reason: 'INVALID_PHONE' });
    expect(buildWhatsAppUrl('+96170123456', 'hi')).toEqual({ ok: false, reason: 'INVALID_PHONE' });
    expect(buildWhatsAppUrl('123', 'hi')).toEqual({ ok: false, reason: 'INVALID_PHONE' });
    expect(buildWhatsAppUrl('1234567890123456', 'hi')).toEqual({ ok: false, reason: 'INVALID_PHONE' });
  });

  it('rejects an empty message', () => {
    expect(buildWhatsAppUrl('96170123456', '   \n  ')).toEqual({ ok: false, reason: 'EMPTY_MESSAGE' });
  });

  it('rejects a body past the length cap so the employee copies instead', () => {
    const tooLong = 'a'.repeat(MAX_MESSAGE_LENGTH + 1);
    expect(buildWhatsAppUrl('96170123456', tooLong)).toEqual({
      ok: false,
      reason: 'MESSAGE_TOO_LONG',
    });
    expect(buildWhatsAppUrl('96170123456', 'a'.repeat(MAX_MESSAGE_LENGTH)).ok).toBe(true);
  });

  it('keeps the built URL inside the hard backstop', () => {
    const result = buildWhatsAppUrl('96170123456', 'ب'.repeat(MAX_MESSAGE_LENGTH));
    expect(result.ok && result.url.length).toBeLessThanOrEqual(MAX_WHATSAPP_URL_LENGTH);
  });
});
