import type { PricingCardAssets } from '../components/PricingCard';
import type { PricingCardData } from '../types/pricing-card.types';

export interface PricingCardSample {
  name: string;
  product: PricingCardData;
  assets?: PricingCardAssets;
}

export const sampleAssets: PricingCardAssets = {
  companyLogoUrl: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 12"%3E%3Crect width="40" height="12" fill="%231d4ed8"/%3E%3C/svg%3E',
};

const sampleMarkPaths: Record<string, string> = {
  QLED: 'M7.5 7a4.5 4.5 0 1 0 2.7 8.1l2 1.9 1.4-1.4-1.9-1.9A4.5 4.5 0 0 0 7.5 7ZM15 8h2v6h4v2h-6V8Z',
  '4K': 'M4 8h3v4h2V8h2v8H9v-2H4V8Zm9 0h2v3l3-3h2.6l-3.8 3.8L21 16h-2.8L15 12.8V16h-2V8Z',
  'Google TV': 'm9 8 7 4-7 4V8Zm-3 11h12v2H6z',
  'Dolby Vision': 'M5 7h4a5 5 0 0 1 0 10H5V7Zm10 0h4v10h-4a5 5 0 0 1 0-10Z',
  Drive: 'M3.5 13h4.1l2.3-6.2 4.3 10.1 2.1-4.9h4.2v-2h-5.6l-.7 1.7L9.7 1.3 6.2 11H3.5v2Z',
  Steam: 'M5.5 18c-2.3-2.5 2.2-4.1.2-6.5C3.8 9.2 6.6 7.3 7.4 5l2.3.8c-1 2.9-2.6 3.7-1.5 5.1 3.3 4-2.8 5.7-.9 7.7L5.5 18Zm7 0c-2.3-2.5 2.2-4.1.2-6.5-1.9-2.3.9-4.2 1.7-6.5l2.3.8c-1 2.9-2.6 3.7-1.5 5.1 3.3 4-2.8 5.7-.9 7.7l-1.8-.6Z',
  'Wi-Fi': 'M2 8.8a15.7 15.7 0 0 1 20 0l-2.1 2.4a12.5 12.5 0 0 0-15.8 0L2 8.8ZM6 13a9.4 9.4 0 0 1 12 0l-2.2 2.4a6.2 6.2 0 0 0-7.6 0L6 13Zm4 4.4a3.2 3.2 0 0 1 4 0L12 20l-2-2.6Z',
  Quiet: 'M3 10h4l5-4v12l-5-4H3v-4Zm12.5-2.5a6 6 0 0 1 0 9l-1.4-1.4a4 4 0 0 0 0-6.2l1.4-1.4Z',
  Cordless: 'M7 2h10v14H7V2Zm3 13h4v6h-4v-6ZM5 6h2v7H5V6Zm12 0h2v7h-2V6Z',
  'USB-C': 'M6 5h12a6 6 0 0 1 0 12H6A6 6 0 0 1 6 5Zm5-4h3l-2 4h3l-5 7 1-5H8l3-6Z',
  Runtime: 'M12 2a10 10 0 1 1-7.1 2.9A10 10 0 0 1 12 2Zm-1 4v7l5 3 1-1.7-4-2.3V6h-2Z',
  Professional: 'M8 4V2h8v2h5v16H3V4h5Zm2 0h4V3h-4v1Zm1 5v2H7v2h4v2h2v-2h4v-2h-4V9h-2Z',
  'No frost': 'M11 2h2v7.3l6.3-3.7 1 1.8L14 11l6.3 3.6-1 1.8-6.3-3.7V20h-2v-7.3l-6.3 3.7-1-1.8L10 11 3.7 7.4l1-1.8L11 9.3V2Z',
  Inverter: 'M3.5 13h4.1l2.3-6.2 4.3 10.1 2.1-4.9h4.2v-2h-5.6l-.7 1.7L9.7 1.3 6.2 11H3.5v2Z',
  Water: 'M12 1S4 10 4 16a8 8 0 1 0 16 0c0-6-8-15-8-15Zm-4 14.5 2-.5c.6 2.3 2 3.5 4.4 3.5v2.1c-3.5 0-5.7-1.8-6.4-5.1Z',
};

export const icon = (label: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${label}</title><path fill="currentColor" d="${sampleMarkPaths[label] ?? 'M5 5h14v14H5z'}"/></svg>`;
