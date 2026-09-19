import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository, pricing } = vi.hoisted(() => ({
  repository: { findManyForLabels: vi.fn(), findById: vi.fn(), findActiveDefaultPricingPreset: vi.fn(), findLabelSecretConfiguration: vi.fn() },
  pricing: { resolveProductPricing: vi.fn() },
}));

vi.mock('./products.repository', () => ({ ProductsRepository: repository }));
vi.mock('../../pricing/calculator/pricing-resolution', async (importOriginal) => ({ ...(await importOriginal<object>()), ...pricing }));
vi.mock('../../../lib/prisma', () => ({ prisma: {}, transactionModel: {}, activityLogModel: {} }));

import { PricingCalculationMode, PricingRoundingMode } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { ProductsService } from './products.service';

const idOf = (suffix: string) => `${suffix.repeat(8)}-${suffix.repeat(4)}-4${suffix.repeat(3)}-8${suffix.repeat(3)}-${suffix.repeat(12)}`;
const FAN = idOf('1');
const OVEN = idOf('2');
const GHOST = idOf('3');

const productOf = (overrides: Record<string, unknown> = {}) => ({
  id: FAN,
  name: 'Ceiling Fan',
  model: 'CF-52',
  brand: 'Ariete',
  sku: 'HC-000001',
  barcode: null,
  labelBarcodeSource: 'SKU',
  isActive: true,
  costPrice: '300.00',
  useCustomPricing: false,
  pricingPresetId: null,
  pricingPreset: null,
  // Deliberately present so the test proves they are dropped, not merely absent.
  installmentPrice: '453.38',
  supplierId: 'supplier-1',
  notes: 'internal note',
  ...overrides,
});

const query = { ids: [FAN], includePriceCode: false, includePrice: false, includeArchived: false };

// Cost 300 → 330.00 cash: a "best price" below the stubbed public price of 377.82.
const secretPreset = {
  id: '99999999-9999-4999-8999-999999999999', name: 'Best price', productType: null,
  expensePercent: new Decimal(0), profitPercent: new Decimal(10), discountBufferPercent: new Decimal(0),
  installmentMarkupPercent: new Decimal(0), downPaymentPercent: new Decimal(100), defaultInstallmentMonths: 1,
  calculationMode: PricingCalculationMode.COMPOUND, roundingMode: PricingRoundingMode.NONE,
  isDefault: false, isLabelSecretAllowed: true, isActive: true, archivedAt: null,
};
const encodingPreset = { id: idOf('8'), name: 'Legacy', mode: 'PRICE', prefix: 'K', suffix: 'Z', offset: new Decimal(0), digitMap: null, decimalPlaces: 0, isActive: true };
const secretConfiguration = (pricingPreset: typeof secretPreset | null = null) => ({ settings: { showCodeOnLabel: true }, pricingPreset, encodingPreset });

describe('bulk product labels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findActiveDefaultPricingPreset.mockResolvedValue(null);
    repository.findLabelSecretConfiguration.mockResolvedValue(secretConfiguration());
    pricing.resolveProductPricing.mockReturnValue({ pricingAvailable: true, internalPriceCode: 'P353', cashPrice: '377.82' });
  });

  it('returns labels in the order the products were selected, not the order the database returned them', async () => {
    repository.findManyForLabels.mockResolvedValue([
      productOf({ id: OVEN, name: 'Oven', sku: 'HC-000002' }),
      productOf({ id: FAN }),
    ]);

    const result = await ProductsService.labels({ ...query, ids: [FAN, OVEN] });

    expect(result.labels.map((label) => label.id)).toEqual([FAN, OVEN]);
  });

  it('exposes only label fields — never cost, installment, supplier, or price data', async () => {
    repository.findManyForLabels.mockResolvedValue([productOf()]);

    const result = await ProductsService.labels(query);

    // An exact key set, so a future field added to Product cannot ride along
    // onto a customer-facing sticker unnoticed.
    expect(Object.keys(result.labels[0]).sort()).toEqual(
      ['barcodeSource', 'barcodeValue', 'brand', 'id', 'model', 'name', 'sku'].sort()
    );
  });

  it('adds only the price code fields when the price code is requested, and never the cash price', async () => {
    repository.findManyForLabels.mockResolvedValue([productOf()]);

    const result = await ProductsService.labels({ ...query, includePriceCode: true });

    expect(result.labels[0]).toMatchObject({ internalPriceCode: null, staffLabelCode: null });
    expect(Object.keys(result.labels[0])).not.toContain('cashPrice');
  });

  it('omits the price code keys entirely when it is not requested', async () => {
    repository.findManyForLabels.mockResolvedValue([productOf()]);

    const keys = Object.keys((await ProductsService.labels(query)).labels[0]);

    expect(keys).not.toContain('internalPriceCode');
    expect(keys).not.toContain('staffLabelCode');
  });

  it('skips pricing resolution altogether when no priced field is requested', async () => {
    repository.findManyForLabels.mockResolvedValue([productOf()]);

    await ProductsService.labels(query);

    expect(pricing.resolveProductPricing).not.toHaveBeenCalled();
    expect(repository.findActiveDefaultPricingPreset).not.toHaveBeenCalled();
  });

  it('looks the pricing preset up once for the whole sheet', async () => {
    repository.findManyForLabels.mockResolvedValue([
      productOf({ id: FAN }),
      productOf({ id: OVEN, sku: 'HC-000002' }),
    ]);

    await ProductsService.labels({ ...query, ids: [FAN, OVEN], includePriceCode: true });

    expect(repository.findActiveDefaultPricingPreset).toHaveBeenCalledTimes(1);
  });

  it('excludes archived products by default and says which ones', async () => {
    repository.findManyForLabels.mockResolvedValue([
      productOf({ id: FAN }),
      productOf({ id: OVEN, name: 'Oven', sku: 'HC-000002', isActive: false }),
    ]);

    const result = await ProductsService.labels({ ...query, ids: [FAN, OVEN] });

    expect(result.labels.map((label) => label.id)).toEqual([FAN]);
    expect(result.warnings).toContainEqual({ productId: OVEN, code: 'ARCHIVED_EXCLUDED', name: 'Oven' });
  });

  it('includes archived products when explicitly asked', async () => {
    repository.findManyForLabels.mockResolvedValue([productOf({ isActive: false })]);

    const result = await ProductsService.labels({ ...query, includeArchived: true });

    expect(result.labels).toHaveLength(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('warns about an unknown id without failing the rest of the print run', async () => {
    repository.findManyForLabels.mockResolvedValue([productOf()]);

    const result = await ProductsService.labels({ ...query, ids: [FAN, GHOST] });

    expect(result.labels.map((label) => label.id)).toEqual([FAN]);
    expect(result.warnings).toContainEqual({ productId: GHOST, code: 'NOT_FOUND' });
  });

  it('encodes the SKU by default', async () => {
    repository.findManyForLabels.mockResolvedValue([productOf({ barcode: '8901643123456' })]);

    const label = (await ProductsService.labels(query)).labels[0];

    expect(label).toMatchObject({ barcodeValue: 'HC-000001', barcodeSource: 'SKU' });
  });

  it('encodes the manufacturer barcode when the product is configured for it', async () => {
    repository.findManyForLabels.mockResolvedValue([productOf({ labelBarcodeSource: 'MANUFACTURER', barcode: '8901643123456' })]);

    const label = (await ProductsService.labels(query)).labels[0];

    expect(label).toMatchObject({ barcodeValue: '8901643123456', barcodeSource: 'MANUFACTURER' });
  });

  it('uses a saved barcode automatically', async () => {
    repository.findManyForLabels.mockResolvedValue([productOf({ labelBarcodeSource: 'AUTO', barcode: '6291041500213' })]);

    const result = await ProductsService.labels(query);

    expect(result.labels[0]).toMatchObject({ barcodeValue: '6291041500213', barcodeSource: 'MANUFACTURER' });
    expect(result.warnings).toHaveLength(0);
  });

  it('warns about AUTO fallback on both single and bulk label responses', async () => {
    const product = productOf({ labelBarcodeSource: 'AUTO', barcode: null });
    repository.findManyForLabels.mockResolvedValue([product]);
    repository.findById.mockResolvedValue(product);

    const bulk = await ProductsService.labels(query);
    const single = await ProductsService.label(FAN, { includePriceCode: false, includePrice: false });

    expect(bulk.labels[0]).toMatchObject({ barcodeValue: 'HC-000001', barcodeSource: 'SKU' });
    expect(bulk.warnings).toContainEqual({ productId: FAN, code: 'FALLBACK_TO_SKU', name: 'Ceiling Fan' });
    expect(single.payload).toMatchObject({ barcodeValue: 'HC-000001', barcodeSource: 'SKU' });
    expect(single.warnings).toContainEqual({ productId: FAN, code: 'FALLBACK_TO_SKU', name: 'Ceiling Fan' });
  });

  it('falls back to the SKU when a manufacturer barcode is missing, and warns rather than doing it silently', async () => {
    repository.findManyForLabels.mockResolvedValue([productOf({ labelBarcodeSource: 'MANUFACTURER', barcode: null })]);

    const result = await ProductsService.labels(query);

    expect(result.labels[0]).toMatchObject({ barcodeValue: 'HC-000001', barcodeSource: 'SKU' });
    expect(result.warnings).toContainEqual({ productId: FAN, code: 'MANUFACTURER_BARCODE_MISSING', name: 'Ceiling Fan' });
  });

  it('warns and blanks the price code when pricing cannot be resolved', async () => {
    repository.findManyForLabels.mockResolvedValue([productOf()]);
    pricing.resolveProductPricing.mockReturnValue({ pricingAvailable: false, reason: 'NO_DEFAULT_PRESET' });

    const result = await ProductsService.labels({ ...query, includePriceCode: true });

    expect(result.labels[0]).toMatchObject({ internalPriceCode: null, staffLabelCode: null });
    expect(result.warnings).toContainEqual({ productId: FAN, code: 'NO_PRICING', name: 'Ceiling Fan' });
  });

  it('handles a missing brand without dropping the label', async () => {
    repository.findManyForLabels.mockResolvedValue([productOf({ brand: null })]);

    const result = await ProductsService.labels(query);

    expect(result.labels[0].brand).toBeNull();
    expect(result.labels).toHaveLength(1);
  });
  describe('manually priced products', () => {
    beforeEach(() => {
      pricing.resolveProductPricing.mockReturnValue({ pricingAvailable: false, reason: 'MISSING_COST_PRICE' });
    });

    it('prints the hand-set price less its discount when there is no cost-based price', async () => {
      repository.findManyForLabels.mockResolvedValue([productOf({ costPrice: null, price: '450.00', discount: '20.00' })]);

      const result = await ProductsService.labels({ ...query, includePrice: true });

      expect(result.labels[0]).toMatchObject({ cashPrice: '430.00' });
      expect(result.warnings).toHaveLength(0);
    });

    it('prints the hand-set price as-is when there is no discount', async () => {
      repository.findById.mockResolvedValue(productOf({ costPrice: null, price: '583.00', discount: null }));

      const result = await ProductsService.label(FAN, { includePrice: true, includePriceCode: false });

      expect(result.payload).toMatchObject({ cashPrice: '583.00' });
    });

    it('still warns that the staff code is blank, because a hand-set price has no cost to derive it from', async () => {
      repository.findManyForLabels.mockResolvedValue([productOf({ costPrice: null, price: '450.00', discount: null })]);

      const result = await ProductsService.labels({ ...query, includePrice: true, includePriceCode: true });

      expect(result.labels[0]).toMatchObject({ cashPrice: '450.00', internalPriceCode: null, staffLabelCode: null });
      expect(result.warnings).toContainEqual({ productId: FAN, code: 'NO_PRICING', name: 'Ceiling Fan' });
    });

    it('warns and prints no price when the product has neither a formula nor a hand-set price', async () => {
      repository.findManyForLabels.mockResolvedValue([productOf({ costPrice: null, price: null })]);

      const result = await ProductsService.labels({ ...query, includePrice: true });

      expect(result.labels[0]).toMatchObject({ cashPrice: null });
      expect(result.warnings).toContainEqual({ productId: FAN, code: 'NO_PRICING', name: 'Ceiling Fan' });
    });

    it('prefers the formula price over a stale hand-set price', async () => {
      pricing.resolveProductPricing.mockReturnValue({ pricingAvailable: true, internalPriceCode: 'P353', cashPrice: '377.82' });
      repository.findManyForLabels.mockResolvedValue([productOf({ price: '999.00' })]);

      const result = await ProductsService.labels({ ...query, includePrice: true });

      expect(result.labels[0]).toMatchObject({ cashPrice: '377.82' });
    });
  });

  describe('secret label pricing preset', () => {
    it('prints the staff code from the secret preset while the public price stays the resolved one', async () => {
      repository.findManyForLabels.mockResolvedValue([productOf()]);
      repository.findLabelSecretConfiguration.mockResolvedValue(secretConfiguration(secretPreset));

      const result = await ProductsService.labels({ ...query, includePriceCode: true, includePrice: true });

      expect(result.labels[0]).toMatchObject({ internalPriceCode: 'K330Z', staffLabelCode: 'HC-000001-K330Z', cashPrice: '377.82' });
      expect(result.warnings).toHaveLength(0);
    });

    it('never changes the public price, with or without a secret preset', async () => {
      repository.findManyForLabels.mockResolvedValue([productOf()]);
      const priced = { ...query, includePriceCode: true, includePrice: true };

      const without = (await ProductsService.labels(priced)).labels[0];
      repository.findLabelSecretConfiguration.mockResolvedValue(secretConfiguration(secretPreset));
      const withSecret = (await ProductsService.labels(priced)).labels[0];

      expect(withSecret).toMatchObject({ cashPrice: without.cashPrice });
      expect((withSecret as { cashPrice: string }).cashPrice).not.toBe('330.00');
    });

    it('keeps the barcode payload the plain product identifier', async () => {
      repository.findManyForLabels.mockResolvedValue([productOf(), productOf({ id: OVEN, sku: 'HC-000002', labelBarcodeSource: 'MANUFACTURER', barcode: '6222048413923' })]);
      repository.findLabelSecretConfiguration.mockResolvedValue(secretConfiguration(secretPreset));

      const result = await ProductsService.labels({ ...query, ids: [FAN, OVEN], includePriceCode: true });

      expect(result.labels.map((label) => label.barcodeValue)).toEqual(['HC-000001', '6222048413923']);
      for (const label of result.labels) expect(label.barcodeValue).not.toContain('-K');
    });

    it('prints no code and warns once per print run when no secret preset is chosen', async () => {
      repository.findManyForLabels.mockResolvedValue([productOf(), productOf({ id: OVEN, sku: 'HC-000002' })]);

      const result = await ProductsService.labels({ ...query, ids: [FAN, OVEN], includePriceCode: true });

      expect(result.labels[0]).toMatchObject({ internalPriceCode: null, staffLabelCode: null });
      expect(result.warnings.filter((warning) => warning.code === 'SECRET_PRESET_NOT_SET')).toEqual([{ productId: FAN, code: 'SECRET_PRESET_NOT_SET' }]);
    });

    it('prints no staff code when the secret price would exceed the selling price', async () => {
      repository.findManyForLabels.mockResolvedValue([productOf()]);
      repository.findLabelSecretConfiguration.mockResolvedValue(secretConfiguration({ ...secretPreset, profitPercent: new Decimal(40) }));

      const result = await ProductsService.labels({ ...query, includePriceCode: true });

      expect(result.labels[0]).toMatchObject({ internalPriceCode: null, staffLabelCode: null });
      expect(result.warnings).toContainEqual({ productId: FAN, code: 'SECRET_ABOVE_PUBLIC', name: 'Ceiling Fan' });
    });

    it('prints no staff code when the secret preset cannot be calculated', async () => {
      repository.findById.mockResolvedValue(productOf());
      repository.findLabelSecretConfiguration.mockResolvedValue(secretConfiguration({ ...secretPreset, defaultInstallmentMonths: 0 }));

      const result = await ProductsService.label(FAN, { includePriceCode: true, includePrice: false });

      expect(result.payload).toMatchObject({ internalPriceCode: null, staffLabelCode: null });
      expect(result.warnings).toContainEqual({ productId: FAN, code: 'SECRET_PRICE_FAILED', name: 'Ceiling Fan' });
    });

    it('does not look the secret preset up when no staff code is requested', async () => {
      repository.findManyForLabels.mockResolvedValue([productOf()]);

      await ProductsService.labels({ ...query, includePrice: true });

      expect(repository.findLabelSecretConfiguration).not.toHaveBeenCalled();
    });
  });
});
