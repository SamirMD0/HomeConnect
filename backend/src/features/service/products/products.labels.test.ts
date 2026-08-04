import { beforeEach, describe, expect, it, vi } from 'vitest';

const { repository, pricing } = vi.hoisted(() => ({
  repository: { findManyForLabels: vi.fn(), findActiveDefaultPricingPreset: vi.fn() },
  pricing: { resolveProductPricing: vi.fn() },
}));

vi.mock('./products.repository', () => ({ ProductsRepository: repository }));
vi.mock('../../pricing/calculator/pricing-resolution', () => pricing);
vi.mock('../../../lib/prisma', () => ({ prisma: {}, transactionModel: {}, activityLogModel: {} }));

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

describe('bulk product labels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.findActiveDefaultPricingPreset.mockResolvedValue(null);
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

    expect(result.labels[0]).toMatchObject({ internalPriceCode: 'P353', staffLabelCode: expect.stringContaining('HC-000001') });
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
});
