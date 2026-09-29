import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  barcodeEncodings, barcodeFormat, barcodeLayout, countModules, DOTS_PER_MM, FALLBACK_MODULE_MM, MODULE_MM, QUIET_ZONE_MODULES,
} from './barcode-geometry';
import { LABEL_PRESETS, matchLabelPreset } from './product-label-settings';

const LABEL_PADDING_MM = 4;

describe('barcode geometry', () => {
  it('uses a whole number of 203 dpi printer dots per module', () => {
    expect(MODULE_MM * DOTS_PER_MM).toBe(3);
    expect(FALLBACK_MODULE_MM * DOTS_PER_MM).toBe(2);
  });

  it('counts modules including the blank blocks JsBarcode reserves for outside digits', () => {
    expect(countModules('6222048413923', 'EAN13')).toBe(107);
    expect(countModules('HC-000288', 'CODE128')).toBe(112);
    expect(countModules('123456789012', 'UPC')).toBe(111);
    expect(countModules('12345670', 'EAN8')).toBe(67);
  });

  it('meets the minimum quiet zones for every format', () => {
    // Outside-digit blocks drawn by JsBarcode count towards the quiet zone.
    expect(QUIET_ZONE_MODULES.CODE128).toEqual({ left: 10, right: 10 });
    expect(12 + QUIET_ZONE_MODULES.EAN13.left).toBeGreaterThanOrEqual(11);
    expect(QUIET_ZONE_MODULES.EAN13.right).toBeGreaterThanOrEqual(7);
    expect(8 + QUIET_ZONE_MODULES.UPC.left).toBeGreaterThanOrEqual(9);
    expect(QUIET_ZONE_MODULES.EAN8).toEqual({ left: 7, right: 7 });
  });

  it('sizes the symbol as whole modules plus quiet zones', () => {
    const layout = barcodeLayout('6222048413923', 68);
    expect(layout.format).toBe('EAN13');
    expect(layout.moduleMm).toBe(MODULE_MM);
    expect(layout.widthMm).toBe((107 + 0 + 7) * MODULE_MM);
    expect(layout.fits).toBe(true);
  });

  it('falls back to the 2-dot module only when the 3-dot one does not fit', () => {
    const value = 'ABCDEFGHIJKLMNOP';
    const modules = countModules(value, 'CODE128') + 20;
    const layout = barcodeLayout(value, modules * MODULE_MM - 1);
    expect(layout.moduleMm).toBe(FALLBACK_MODULE_MM);
    expect(layout.fits).toBe(true);
  });

  it('reports a barcode that cannot fit instead of squeezing it', () => {
    expect(barcodeLayout('X'.repeat(60), 54).fits).toBe(false);
  });

  it('never overrides the printed text, so the digits equal the encoded value', () => {
    const { options } = barcodeLayout('HC-000288', 68);
    expect(options).not.toHaveProperty('text');
    expect(options.displayValue).toBe(true);
    expect(options.width).toBe(1);
    expect(barcodeEncodings('HC-000288', 'CODE128').map((encoding) => encoding.text ?? '').join('')).toBe('HC-000288');
    expect(barcodeEncodings('6222048413923', 'EAN13').map((encoding) => encoding.text ?? '').join('')).toBe('6222048413923');
  });

  it('falls back to CODE128 for a value a retail format rejects', () => {
    expect(barcodeFormat('6291041500214')).toBe('CODE128');
    expect(barcodeLayout('6291041500214', 68).format).toBe('CODE128');
  });
});

describe('label presets', () => {
  it('prints the price on Large and not on Small', () => {
    expect(LABEL_PRESETS.LARGE.showPrice).toBe(true);
    expect(LABEL_PRESETS.SMALL.showPrice).toBe(false);
  });

  it('fits the 72mm printable width of the thermal roll', () => {
    for (const preset of Object.values(LABEL_PRESETS)) expect(preset.widthMm).toBeLessThanOrEqual(72);
  });

  it('fits typical SKU and EAN-13 barcodes at the 3-dot module on both presets', () => {
    for (const preset of Object.values(LABEL_PRESETS)) {
      for (const value of ['HC-000288', '6222048413923', '2000000000015']) {
        const layout = barcodeLayout(value, preset.widthMm - LABEL_PADDING_MM);
        expect(layout.fits).toBe(true);
        expect(layout.moduleMm).toBe(MODULE_MM);
      }
    }
  });

  it('recognises a preset from its stored fields', () => {
    expect(matchLabelPreset(72, 50, true)).toBe('LARGE');
    expect(matchLabelPreset(58, 40, false)).toBe('SMALL');
    expect(matchLabelPreset(72, 50, false)).toBe('CUSTOM');
    expect(matchLabelPreset(50, 30, true)).toBe('CUSTOM');
  });
});

describe('barcode print CSS', () => {
  it('never fits or scales the barcode to its box', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../styles/index.css'), 'utf8');
    const rule = css.match(/\.product-label-barcode\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    for (const forbidden of [/width:\s*100%/, /max-height/, /max-width/, /transform/, /zoom/, /object-fit/]) {
      expect(rule![1]).not.toMatch(forbidden);
    }
  });
});
