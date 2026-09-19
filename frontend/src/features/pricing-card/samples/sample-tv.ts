import type { PricingCardSample } from './sample-types';
import { icon, sampleAssets } from './sample-types';

export const sampleTv: PricingCardSample = {
  name: 'TCL 50-inch QLED TV',
  product: {
    id: 'sample-tv', name: 'TCL 50” QLED 4K Smart TV', model: '50C655',
    brand: { canonicalName: 'tcl', displayName: 'TCL', hasLogo: true },
    sku: 'HC-000501', barcodeValue: '5901292512346', barcodeSource: 'MANUFACTURER',
    internalPriceCode: 'P890', staffLabelCode: 'HC-000501-K890Z', cashPrice: '1299.00', templateId: 'tv-large',
    currency: { code: 'USD', display: 'SYMBOL', symbol: '$' }, validUntil: '2026-10-31',
    dimensionsMm: { widthMm: 1112, heightMm: 646, depthMm: 72 },
    resolvedSpecs: [
      { canonicalKey: 'screen_size', label: 'Screen size', value: '50', unit: 'inch' },
      { canonicalKey: 'resolution', label: 'Resolution', value: '3840 × 2160' },
      { canonicalKey: 'refresh_rate', label: 'Refresh rate', value: '60', unit: 'Hz' },
    ],
    features: [
      { iconCode: 'qled', label: 'QLED', position: 0, iconSvg: icon('QLED') },
      { iconCode: '4k', label: '4K UHD', position: 1, iconSvg: icon('4K') },
      { iconCode: 'google-tv', label: 'Google TV', position: 2, iconSvg: icon('Google TV') },
      { iconCode: 'dolby-vision', label: 'Dolby Vision', position: 3, iconSvg: icon('Dolby Vision') },
    ],
  },
  assets: {
    ...sampleAssets,
    brandLogoUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 12"%3E%3Ctext x="1" y="10"%3ETCL%3C/text%3E%3C/svg%3E',
    productImageUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 50"%3E%3Crect x="2" y="2" width="76" height="42" fill="none" stroke="black"/%3E%3C/svg%3E',
  },
};
