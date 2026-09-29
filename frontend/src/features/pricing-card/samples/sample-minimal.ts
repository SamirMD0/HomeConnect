import type { PricingCardSample } from './sample-types';

export const sampleMinimal: PricingCardSample = {
  name: 'Minimal product',
  product: {
    id: 'sample-minimal', name: 'Basic Product', model: 'BASIC-1', brand: null,
    sku: 'HC-000001', barcodeValue: 'HC-000001', barcodeSource: 'SKU',
    cashPrice: '10.00', currency: { code: 'USD', display: 'SYMBOL', symbol: '$' },
  },
};
