import { describe, expect, it, vi } from 'vitest';
import { labelPrintOptions, printLabels } from './label-print';

describe('label printing from the main process', () => {
  it('prints exactly one label-sized page with no margin, header, footer or scaling', () => {
    const options = labelPrintOptions({ widthMm: 72, heightMm: 50 });
    expect(options.pageSize).toEqual({ width: 72000, height: 50000 });
    expect(options.margins).toEqual({ marginType: 'none' });
    expect(options.scaleFactor).toBe(100);
    expect(options).not.toHaveProperty('header');
    expect(options).not.toHaveProperty('footer');
  });

  it('rejects sizes the label settings would never produce', () => {
    for (const bad of [null, {}, { widthMm: 72 }, { widthMm: 5, heightMm: 50 }, { widthMm: 72, heightMm: 500 }, { widthMm: '72', heightMm: 50 }]) {
      expect(() => labelPrintOptions(bad)).toThrow();
    }
  });

  it('accepts large pricing cards up to 210 mm while preserving the 20 mm floor', () => {
    expect(labelPrintOptions({ widthMm: 200, heightMm: 105 }).pageSize).toEqual({ width: 200000, height: 105000 });
    expect(() => labelPrintOptions({ widthMm: 19.9, heightMm: 105 })).toThrow('between 20 and 210 mm');
  });

  it('reports success, treats a cancelled dialog as no error, and surfaces real failures', async () => {
    const contents = (success: boolean, reason: string) => ({ print: vi.fn((_options, callback) => callback(success, reason)) });
    await expect(printLabels(contents(true, ''), { widthMm: 58, heightMm: 40 })).resolves.toEqual({ printed: true });
    await expect(printLabels(contents(false, 'cancelled'), { widthMm: 58, heightMm: 40 })).resolves.toEqual({ printed: false });
    await expect(printLabels(contents(false, 'Printer offline'), { widthMm: 58, heightMm: 40 })).resolves.toEqual({ printed: false, error: 'Printer offline' });
  });

  it('never calls the printer for an invalid request', async () => {
    const print = vi.fn();
    await expect(printLabels({ print }, { widthMm: 0, heightMm: 0 })).resolves.toMatchObject({ printed: false });
    expect(print).not.toHaveBeenCalled();
  });
});
