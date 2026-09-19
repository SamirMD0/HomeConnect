import type { PricingCardSample } from './sample-types';
import { icon, sampleAssets } from './sample-types';

export const sampleTrimmer: PricingCardSample = {
  name: 'VGR professional trimmer',
  product: {
    id: 'sample-trimmer', name: 'VGR Professional Cordless Hair Trimmer', model: 'V-937',
    brand: { canonicalName: 'vgr', displayName: 'VGR', hasLogo: false },
    sku: 'HC-000937', barcodeValue: 'HC-000937', barcodeSource: 'SKU', cashPrice: '49.99',
    currency: { code: 'USD', display: 'SYMBOL', symbol: '$' }, validUntil: '2026-09-30',
    resolvedSpecs: [
      { canonicalKey: 'battery_runtime', label: 'Runtime', value: '180', unit: 'min' },
      { canonicalKey: 'charging', label: 'Charging', value: 'USB-C' },
      { canonicalKey: 'blade_type', label: 'Blade', value: 'DLC steel' },
    ],
    features: [
      { iconCode: 'cordless', label: 'Cordless', position: 0, iconSvg: icon('Cordless') },
      { iconCode: 'usb-c', label: 'USB-C', position: 1, iconSvg: icon('USB-C') },
      { iconCode: 'runtime', label: 'Long runtime', value: '180 min', position: 2, iconSvg: icon('Runtime') },
      { iconCode: 'professional', label: 'Professional', position: 3, iconSvg: icon('Professional') },
    ],
  },
  assets: sampleAssets,
};
