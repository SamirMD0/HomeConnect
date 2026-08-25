import { describe, expect, it, vi } from 'vitest';
import {
  MAX_WHATSAPP_URL_LENGTH,
  WHATSAPP_OPEN_CHANNEL,
  isAllowedWhatsAppUrl,
  openWhatsAppUrl,
} from './whatsapp-link';

describe('comm:openWhatsApp allowlist', () => {
  it('uses the namespaced channel name', () => {
    expect(WHATSAPP_OPEN_CHANNEL).toBe('comm:openWhatsApp');
  });

  it('accepts an https wa.me deep link', () => {
    expect(isAllowedWhatsAppUrl('https://wa.me/96170123456')).toBe(true);
    expect(isAllowedWhatsAppUrl('https://wa.me/96170123456?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7')).toBe(true);
  });

  it('rejects unsafe protocols', () => {
    expect(isAllowedWhatsAppUrl('http://wa.me/96170123456')).toBe(false);
    expect(isAllowedWhatsAppUrl('file:///C:/Windows/System32/cmd.exe')).toBe(false);
    expect(isAllowedWhatsAppUrl('javascript:alert(1)')).toBe(false);
    expect(isAllowedWhatsAppUrl('whatsapp://send?phone=96170123456')).toBe(false);
    expect(isAllowedWhatsAppUrl('ms-settings:')).toBe(false);
  });

  it('rejects any other host, including lookalikes', () => {
    expect(isAllowedWhatsAppUrl('https://evil.com/96170123456')).toBe(false);
    expect(isAllowedWhatsAppUrl('https://evil.wa.me/96170123456')).toBe(false);
    expect(isAllowedWhatsAppUrl('https://wa.me.evil.com/96170123456')).toBe(false);
    expect(isAllowedWhatsAppUrl('https://wa.me@evil.com/')).toBe(false);
    expect(isAllowedWhatsAppUrl('https://web.whatsapp.com/send')).toBe(false);
  });

  it('rejects malformed, empty and non-string input', () => {
    expect(isAllowedWhatsAppUrl('')).toBe(false);
    expect(isAllowedWhatsAppUrl('   ')).toBe(false);
    expect(isAllowedWhatsAppUrl('not a url')).toBe(false);
    expect(isAllowedWhatsAppUrl('wa.me/96170123456')).toBe(false);
    expect(isAllowedWhatsAppUrl(undefined)).toBe(false);
    expect(isAllowedWhatsAppUrl(null)).toBe(false);
    expect(isAllowedWhatsAppUrl(42)).toBe(false);
    expect(isAllowedWhatsAppUrl({ url: 'https://wa.me/1' })).toBe(false);
  });

  it('rejects an absurdly long URL', () => {
    const tooLong = `https://wa.me/96170123456?text=${'a'.repeat(MAX_WHATSAPP_URL_LENGTH)}`;
    expect(isAllowedWhatsAppUrl(tooLong)).toBe(false);
  });
});

describe('openWhatsAppUrl', () => {
  it('opens an allowed link exactly once', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);

    const result = await openWhatsAppUrl('https://wa.me/96170123456?text=hi', openExternal);

    expect(result).toEqual({ opened: true });
    expect(openExternal).toHaveBeenCalledTimes(1);
    expect(openExternal).toHaveBeenCalledWith('https://wa.me/96170123456?text=hi');
  });

  it('never calls openExternal for a rejected input', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const rejected = [
      'http://wa.me/1',
      'file:///C:/Windows/System32/cmd.exe',
      'javascript:alert(1)',
      'https://evil.com',
      'https://wa.me@evil.com/',
      'not a url',
      '',
      undefined,
      null,
      42,
    ];

    for (const input of rejected) {
      const result = await openWhatsAppUrl(input, openExternal);
      expect(result.opened).toBe(false);
      expect(result.error).toContain('only https://wa.me');
    }

    expect(openExternal).not.toHaveBeenCalled();
  });

  it('reports a failure from the shell instead of throwing', async () => {
    const openExternal = vi.fn().mockRejectedValue(new Error('no handler registered'));

    const result = await openWhatsAppUrl('https://wa.me/96170123456', openExternal);

    expect(result).toEqual({ opened: false, error: 'no handler registered' });
  });
});
