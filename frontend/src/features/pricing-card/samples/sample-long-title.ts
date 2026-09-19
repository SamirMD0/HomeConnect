import type { PricingCardSample } from './sample-types';
import { sampleAssets } from './sample-types';

export const sampleLongTitle: PricingCardSample = {
  name: 'Long title and model',
  product: {
    id: 'sample-long-title',
    name: 'Premium Multi-Function Smart Connected Home Entertainment System with Immersive Audio and Ultra High Definition Display',
    model: 'HC-ULTIMATE-CONNECTED-ENTERTAINMENT-SYSTEM-2026-INTERNATIONAL-EDITION',
    brand: { canonicalName: 'home-connect', displayName: 'Home Connect Signature', hasLogo: false },
    sku: 'HC-009999', barcodeValue: 'HC-009999', barcodeSource: 'SKU', cashPrice: '9999.95',
    currency: { code: 'USD', display: 'SYMBOL_AND_CODE', symbol: '$' }, validUntil: '2027-01-01',
  },
  assets: sampleAssets,
};
