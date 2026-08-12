import { describe, expect, it } from 'vitest';
import { DEFAULT_SCANNER_PORT, parseConnection, scannerBaseUrl } from './scanner-url';

describe('scanner connection settings', () => {
  it('accepts a valid IPv4 address and the default scanner port', () => {
    const result = parseConnection(' 192.168.1.20 ', String(DEFAULT_SCANNER_PORT));
    expect(result).toEqual({ ok: true, value: { host: '192.168.1.20', port: 3011 } });
    if (result.ok) expect(scannerBaseUrl(result.value)).toBe('http://192.168.1.20:3011');
  });

  it('rejects hostnames, URLs, malformed addresses, and invalid ports', () => {
    expect(parseConnection('shop-pc', '3011').ok).toBe(false);
    expect(parseConnection('http://192.168.1.20', '3011').ok).toBe(false);
    expect(parseConnection('192.168.1.999', '3011').ok).toBe(false);
    expect(parseConnection('192.168.1.20', '0').ok).toBe(false);
    expect(parseConnection('192.168.1.20', 'abc').ok).toBe(false);
  });
});
