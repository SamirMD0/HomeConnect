import { describe, expect, it } from 'vitest';
import { ALL_PRODUCT_IMPORT_BRANDS, DEFAULT_PRODUCT_BRANDS, detectProductBrand, productImportRowBrand } from './product-catalog-defaults';

describe('CSV catalog brands', () => {
  it('matches longest brand prefixes and normalizes case and whitespace', () => {
    expect(detectProductBrand(' general   gold cooker')).toBe('GENERAL GOLD');
    expect(detectProductBrand('GENERAL OCEAN fridge')).toBe('GENERAL OCEAN');
    expect(detectProductBrand('TCL TV')).toBe('TCL');
    expect(detectProductBrand('Fakir vacuum')).toBe('FAKIR');
    expect(detectProductBrand('MAC STYLER HAIR STRAIGHTENER')).toBe('MAC STYLER');
    expect(detectProductBrand('SUPERCHEF HOOD')).toBe('SUPER CHEF');
    expect(detectProductBrand('DORCSH KNIVES')).toBe('DORSCH');
  });

  it('leaves generic descriptions and partial-word matches unbranded', () => {
    expect(detectProductBrand('MILK POT 12OZ')).toBeNull();
    expect(detectProductBrand('TV WALL MOUNT')).toBeNull();
    expect(detectProductBrand('TCLONE TV')).toBeNull();
    expect(detectProductBrand('REMOTE CONTROL FOR SAMSUNG')).toBeNull();
  });

  it('never saves the all-brands selection as a product brand', () => {
    expect(productImportRowBrand({ description: 'TCL TV' }, ALL_PRODUCT_IMPORT_BRANDS)).toBe('TCL');
    expect(productImportRowBrand({ description: 'GENERIC TV' }, ALL_PRODUCT_IMPORT_BRANDS)).toBeNull();
    expect(productImportRowBrand({ description: 'TCL TV', brand: null }, ALL_PRODUCT_IMPORT_BRANDS)).toBeNull();
    expect(productImportRowBrand({ description: 'TV' }, 'TCL')).toBe('TCL');
    expect(new Set(DEFAULT_PRODUCT_BRANDS).size).toBe(DEFAULT_PRODUCT_BRANDS.length);
  });
});
