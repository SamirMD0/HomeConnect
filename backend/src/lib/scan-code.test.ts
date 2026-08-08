import { describe, expect, it } from 'vitest';
import { normalizeScanCode, SCAN_CODE_MAX_LENGTH } from './scan-code';

describe('normalizeScanCode', () => {
  it('strips the terminator a keyboard-wedge scanner appends', () => {
    for (const raw of ['HC-000001\r\n', 'HC-000001\n', 'HC-000001\t', '  HC-000001  ']) {
      expect(normalizeScanCode(raw)).toEqual({ ok: true, code: 'HC-000001' });
    }
  });

  it('preserves leading zeros so EAN-13 and UPC-A codes stay intact', () => {
    expect(normalizeScanCode('0012345678905')).toEqual({ ok: true, code: '0012345678905' });
    expect(normalizeScanCode('00000000')).toEqual({ ok: true, code: '00000000' });
  });

  it('preserves case, because lookup folds case at the query instead', () => {
    expect(normalizeScanCode('hc-000001')).toEqual({ ok: true, code: 'hc-000001' });
  });

  it('removes zero-width characters injected between digits', () => {
    expect(normalizeScanCode('123​4567')).toEqual({ ok: true, code: '1234567' });
    expect(normalizeScanCode('﻿1234567')).toEqual({ ok: true, code: '1234567' });
  });

  it('rejects empty and whitespace-only input', () => {
    for (const raw of ['', '   ', '\r\n', '​']) {
      expect(normalizeScanCode(raw)).toEqual({ ok: false, reason: 'EMPTY' });
    }
  });

  it('rejects codes shorter than any storable barcode or SKU', () => {
    expect(normalizeScanCode('123')).toEqual({ ok: false, reason: 'TOO_SHORT' });
  });

  it('rejects codes longer than the storable maximum', () => {
    expect(normalizeScanCode('1'.repeat(SCAN_CODE_MAX_LENGTH))).toEqual({ ok: true, code: '1'.repeat(SCAN_CODE_MAX_LENGTH) });
    expect(normalizeScanCode('1'.repeat(SCAN_CODE_MAX_LENGTH + 1))).toEqual({ ok: false, reason: 'TOO_LONG' });
    expect(normalizeScanCode('1'.repeat(5000))).toEqual({ ok: false, reason: 'TOO_LONG' });
  });

  it('rejects characters that no stored barcode or SKU can contain', () => {
    for (const raw of ['HC 000001', 'HC_000001', "HC-000001'; DROP TABLE products--", '<script>abcd</script>', 'مسح-1234', 'HC.000001']) {
      expect(normalizeScanCode(raw)).toEqual({ ok: false, reason: 'UNSUPPORTED_CHARACTERS' });
    }
  });
});
