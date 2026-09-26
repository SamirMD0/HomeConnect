import type { PricingCardSample } from './sample-types';
import { icon, sampleAssets } from './sample-types';

export const sampleFridge: PricingCardSample = {
  name: 'Hisense 600 L fridge',
  product: {
    id: 'sample-fridge', name: 'Hisense 600 L Side-by-Side Refrigerator', model: 'RS694N4TIE',
    brand: { canonicalName: 'hisense', displayName: 'Hisense', hasLogo: false },
    sku: 'HC-000600', barcodeValue: '6942147483647', barcodeSource: 'MANUFACTURER', cashPrice: '1599.00',
    currency: { code: 'USD', display: 'CODE', symbol: '$' }, validUntil: '2026-12-01',
    dimensionsMm: { widthMm: 910, heightMm: 1786, depthMm: 743 },
    resolvedSpecs: [
      { canonicalKey: 'capacity_l', label: 'Capacity', value: '600', unit: 'L' },
      { canonicalKey: 'energy_rating', label: 'Energy class', value: 'A+' },
    ],
    features: [
      { iconCode: 'no-frost', label: 'Total No Frost', position: 0, iconSvg: icon('No frost') },
      { iconCode: 'inverter', label: 'Inverter', position: 1, iconSvg: icon('Inverter') },
      { iconCode: 'water-dispenser', label: 'Water dispenser', position: 2, iconSvg: icon('Water') },
    ],
  },
  assets: sampleAssets,
};
