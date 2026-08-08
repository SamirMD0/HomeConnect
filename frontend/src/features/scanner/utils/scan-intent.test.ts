import { describe, expect, it } from 'vitest';
import { RecentScan, ScanLookupResult } from '../types/scanner.types';
import { appendRecentScan, RECENT_SCAN_LIMIT, resolveScanIntent, shouldRefocusScanInput, toRecentScan } from './scan-intent';

describe('resolveScanIntent', () => {
  it('treats a barcode or SKU as a scan', () => {
    expect(resolveScanIntent('HC-000001')).toEqual({ kind: 'SCAN', code: 'HC-000001' });
    expect(resolveScanIntent('0012345678905')).toEqual({ kind: 'SCAN', code: '0012345678905' });
  });

  it('strips the scanner terminator before deciding', () => {
    expect(resolveScanIntent('HC-000001\r\n')).toEqual({ kind: 'SCAN', code: 'HC-000001' });
  });

  it('sends typed words to search instead of reporting a failed scan', () => {
    expect(resolveScanIntent('fan')).toEqual({ kind: 'SEARCH', term: 'fan' });
    expect(resolveScanIntent('مروحة سقف')).toEqual({ kind: 'SEARCH', term: 'مروحة سقف' });
    expect(resolveScanIntent('ceiling fan 52')).toEqual({ kind: 'SEARCH', term: 'ceiling fan 52' });
  });

  it('ignores an empty submission', () => {
    expect(resolveScanIntent('')).toEqual({ kind: 'IGNORE' });
    expect(resolveScanIntent('   ')).toEqual({ kind: 'IGNORE' });
  });
});

const found: ScanLookupResult = {
  status: 'FOUND',
  normalizedCode: 'HC-000001',
  matchedBy: 'SKU',
  product: { id: 'product-1', name: 'Ceiling Fan', model: 'CF-52', sku: 'HC-000001', barcode: null, brand: 'Toshiba', isActive: true },
};

describe('recent scans', () => {
  const at = new Date('2026-08-07T10:15:00.000Z');

  it('records the matched product for a found scan', () => {
    expect(toRecentScan(found, 'HC-000001', 'PC_SCANNER', at)).toMatchObject({
      code: 'HC-000001', status: 'FOUND', source: 'PC_SCANNER', productId: 'product-1', productName: 'Ceiling Fan',
    });
  });

  it('falls back to the submitted code when the scan was unreadable', () => {
    const invalid: ScanLookupResult = { status: 'INVALID_CODE', normalizedCode: null, matchedBy: null, product: null };
    expect(toRecentScan(invalid, 'HC 000001', 'PC_SCANNER', at)).toMatchObject({
      code: 'HC 000001', status: 'INVALID_CODE', productId: null, productName: null,
    });
  });

  const foundAs = (code: string): ScanLookupResult => ({ ...found, normalizedCode: code });

  it('prefers the code the server normalized over the raw submission', () => {
    expect(toRecentScan(found, 'hc-000001\r\n', 'PC_SCANNER', at).code).toBe('HC-000001');
  });

  it('keeps the newest scan first', () => {
    const older = toRecentScan(foundAs('HC-000001'), 'HC-000001', 'PC_SCANNER', at);
    const newer = toRecentScan(foundAs('HC-000002'), 'HC-000002', 'PHONE_SCANNER', new Date('2026-08-07T10:16:00.000Z'));
    expect(appendRecentScan([older], newer).map((scan) => scan.code)).toEqual(['HC-000002', 'HC-000001']);
  });

  /**
   * Phone scans arrive by polling, so a redelivered response must not add a
   * second copy of a scan already in the list.
   */
  it('ignores a scan it already holds', () => {
    const scan = toRecentScan(foundAs('HC-000001'), 'HC-000001', 'PHONE_SCANNER', at);
    const once = appendRecentScan([], scan);
    expect(appendRecentScan(once, scan)).toBe(once);
    expect(appendRecentScan(once, scan)).toHaveLength(1);
  });

  it('caps the list so a long shift cannot grow it without bound', () => {
    let scans: RecentScan[] = [];
    for (let index = 0; index < RECENT_SCAN_LIMIT + 10; index += 1) {
      scans = appendRecentScan(scans, toRecentScan(foundAs(`HC-${index}`), `HC-${index}`, 'PC_SCANNER', new Date(at.getTime() + index)));
    }
    expect(scans).toHaveLength(RECENT_SCAN_LIMIT);
    expect(scans[0].code).toBe(`HC-${RECENT_SCAN_LIMIT + 9}`);
    expect(scans[RECENT_SCAN_LIMIT - 1].code).toBe(`HC-${10}`);
  });
});

describe('shouldRefocusScanInput', () => {
  it('pulls focus back for a bare printable character', () => {
    expect(shouldRefocusScanInput({ key: '0', targetTagName: 'BODY' })).toBe(true);
    expect(shouldRefocusScanInput({ key: 'H', targetTagName: 'DIV' })).toBe(true);
  });

  it('leaves other fields alone so real editing still works', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(shouldRefocusScanInput({ key: '0', targetTagName: tag })).toBe(false);
    }
    expect(shouldRefocusScanInput({ key: '0', targetTagName: 'DIV', targetIsContentEditable: true })).toBe(false);
  });

  it('never steals a shortcut or a control key', () => {
    expect(shouldRefocusScanInput({ key: 'c', ctrlKey: true, targetTagName: 'BODY' })).toBe(false);
    expect(shouldRefocusScanInput({ key: 'v', metaKey: true, targetTagName: 'BODY' })).toBe(false);
    expect(shouldRefocusScanInput({ key: 'Tab', targetTagName: 'BODY' })).toBe(false);
    expect(shouldRefocusScanInput({ key: 'Escape', targetTagName: 'BODY' })).toBe(false);
    expect(shouldRefocusScanInput({ key: 'F5', targetTagName: 'BODY' })).toBe(false);
    expect(shouldRefocusScanInput({ key: 'ArrowDown', targetTagName: 'BODY' })).toBe(false);
  });

  it('stands down while a dialog is open', () => {
    expect(shouldRefocusScanInput({ key: '0', targetTagName: 'BODY' }, true)).toBe(false);
  });
});
