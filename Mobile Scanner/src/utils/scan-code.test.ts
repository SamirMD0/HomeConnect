import { describe, expect, it } from 'vitest';
import { eventPayload, MAX_SCAN_CODE_LENGTH, prepareScanCode } from './scan-code';

describe('scan code submission', () => {
  it('trims the scanned value without changing its case', () => {
    expect(prepareScanCode('  hc-Ab12  ')).toEqual({ ok: true, code: 'hc-Ab12' });
  });

  it('rejects empty and oversized codes before making a request', () => {
    expect(prepareScanCode('   ').ok).toBe(false);
    expect(prepareScanCode('x'.repeat(MAX_SCAN_CODE_LENGTH + 1)).ok).toBe(false);
  });

  it('builds an event body containing code and nothing else', () => {
    const payload = eventPayload('HC-000001');
    expect(payload).toEqual({ code: 'HC-000001' });
    expect(Object.keys(payload)).toEqual(['code']);
  });
});
