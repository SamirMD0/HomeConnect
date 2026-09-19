import type { PricingCardSample } from './sample-types';
import { icon, sampleAssets } from './sample-types';

export const sampleWasher: PricingCardSample = {
  name: 'LG 9 kg washer',
  product: {
    id: 'sample-washer', name: 'LG 9 kg Front-Load Washing Machine', model: 'F4V5VYP2T',
    brand: { canonicalName: 'lg', displayName: 'LG', hasLogo: false },
    sku: 'HC-000902', barcodeValue: 'HC-000902', barcodeSource: 'SKU', cashPrice: '849.50',
    currency: { code: 'USD', display: 'SYMBOL_AND_CODE', symbol: '$' }, validUntil: '2026-11-15',
    dimensionsMm: { widthMm: 600, heightMm: 850, depthMm: 565 },
    resolvedSpecs: [
      { canonicalKey: 'capacity_kg', label: 'Capacity', value: '9', unit: 'kg' },
      { canonicalKey: 'spin_speed_rpm', label: 'Spin speed', value: '1400', unit: 'rpm' },
      { canonicalKey: 'energy_rating', label: 'Energy class', value: 'A' },
    ],
    features: [
      { iconCode: 'inverter', label: 'AI Direct Drive', position: 0, iconSvg: icon('Drive') },
      { iconCode: 'steam', label: 'Steam+', position: 1, iconSvg: icon('Steam') },
      { iconCode: 'wifi', label: 'ThinQ Wi-Fi', position: 2, iconSvg: icon('Wi-Fi') },
      { iconCode: 'quiet', label: 'Low noise', value: '53 dB', position: 3, iconSvg: icon('Quiet') },
    ],
  },
  assets: sampleAssets,
};
