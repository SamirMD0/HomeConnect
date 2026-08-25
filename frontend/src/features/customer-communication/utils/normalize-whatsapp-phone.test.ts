import { describe, expect, it } from 'vitest';
import { normalizeWhatsAppPhone } from './normalize-whatsapp-phone';
import { formatCustomerPhone } from '../../customers/utils/format-customer-phone';

function digitsOf(raw: string): string | null {
  const result = normalizeWhatsAppPhone(raw);
  return result.ok ? result.digits : null;
}

describe('normalizeWhatsAppPhone', () => {
  it('adds the Lebanese country code to an 8-digit mobile number', () => {
    expect(normalizeWhatsAppPhone('70123456')).toEqual({
      ok: true,
      digits: '96170123456',
      display: '+961 70 123 456',
      confidence: 'high',
    });
    expect(digitsOf('03987654')).toBe('96103987654');
    expect(digitsOf('81 234 567')).toBe('96181234567');
    expect(digitsOf('76-123-456')).toBe('96176123456');
  });

  it('strips a leading zero from a 9-digit local number', () => {
    expect(digitsOf('070123456')).toBe('96170123456');
  });

  it('accepts +961, 00961 and bare 961 prefixes', () => {
    expect(digitsOf('+961 70 123 456')).toBe('96170123456');
    expect(digitsOf('0096170123456')).toBe('96170123456');
    expect(digitsOf('96170123456')).toBe('96170123456');
    expect(digitsOf('+961 070123456')).toBe('96170123456');
  });

  it('passes an already-international number through with low confidence', () => {
    const result = normalizeWhatsAppPhone('+49 151 23456789');
    expect(result).toEqual({
      ok: true,
      digits: '4915123456789',
      display: '+4915123456789',
      confidence: 'low',
    });
  });

  it('rejects two numbers in one field rather than mangling them', () => {
    expect(normalizeWhatsAppPhone('70123456 / 03987654')).toEqual({
      ok: false,
      reason: 'MULTIPLE_NUMBERS',
    });
    expect(normalizeWhatsAppPhone('70123456 03987654')).toEqual({
      ok: false,
      reason: 'MULTIPLE_NUMBERS',
    });
  });

  it('rejects empty, lettered, too short and too long input', () => {
    expect(normalizeWhatsAppPhone('')).toEqual({ ok: false, reason: 'EMPTY' });
    expect(normalizeWhatsAppPhone('   ')).toEqual({ ok: false, reason: 'EMPTY' });
    expect(normalizeWhatsAppPhone(null)).toEqual({ ok: false, reason: 'EMPTY' });
    expect(normalizeWhatsAppPhone('call the shop')).toEqual({ ok: false, reason: 'UNPARSEABLE' });
    expect(normalizeWhatsAppPhone('70123456 ext 4')).toEqual({ ok: false, reason: 'UNPARSEABLE' });
    expect(normalizeWhatsAppPhone('1234')).toEqual({ ok: false, reason: 'TOO_SHORT' });
    expect(normalizeWhatsAppPhone('1234567890123456')).toEqual({ ok: false, reason: 'TOO_LONG' });
  });

  it('does not guess at an 8-digit number with no recognised Lebanese prefix', () => {
    expect(normalizeWhatsAppPhone('12345678')).toEqual({ ok: false, reason: 'UNPARSEABLE' });
  });

  it('leaves the display-only customer phone formatter untouched', () => {
    // Guards against anyone "unifying" the two helpers: the display formatter
    // must keep producing the dashed local form.
    expect(formatCustomerPhone('70123456')).toBe('70-123-456');
  });
});
