import type { PricingCardTemplateConfig } from '../schema/template-config.z';

export type CurrencyDisplayMode = 'SYMBOL' | 'CODE' | 'SYMBOL_AND_CODE';
export type PricingCardRolloutMode = 'LEGACY_ONLY' | 'TEMPLATE_ONLY' | 'BOTH';
export type PricingCardPaperMode = 'SINGLE_STICKER' | 'SHEET';

export interface ShopProfile {
  id: string;
  name: string;
  tagline: string | null;
  hasLogo: boolean;
  logoMimeType: string | null;
  logoByteSize: number | null;
  currencyCode: string;
  currencyDisplay: CurrencyDisplayMode;
  defaultPricingCardTemplateId: string | null;
  defaultCardValidityDays: number;
  snapshotPrintedCards: boolean;
  pricingCardRolloutMode: PricingCardRolloutMode;
}

export interface PricingCardTemplate {
  id: string;
  name: string;
  description: string | null;
  paperMode: PricingCardPaperMode;
  paperSize: 'A4' | 'LETTER' | null;
  cardWidthMm: string;
  cardHeightMm: string;
  configVersion: number;
  config: PricingCardTemplateConfig;
  featureMax: number;
  specKeyOrder: string[];
  defaultValidityDays: number | null;
  isActive: boolean;
  archivedAt: string | null;
  archivedReason: string | null;
}

export interface PricingCardFeatureIcon {
  id: string;
  code: string;
  label: string;
  category: string | null;
  svg: string;
  isActive: boolean;
  sortOrder: number;
}

export interface BrandLogo {
  id: string;
  canonicalName: string;
  displayName: string;
  hasLogo: boolean;
  logoMimeType: string | null;
  logoByteSize: number | null;
  isActive: boolean;
}

export interface PricingCardBrand {
  canonicalName: string;
  displayName: string;
  hasLogo: boolean;
}

export interface PricingCardFeature {
  iconCode: string;
  label: string;
  value?: string;
  position: number;
  iconSvg?: string;
  iconMissing?: boolean;
}

export interface PricingCardResolvedSpec {
  canonicalKey: string;
  label: string;
  value: string;
  unit?: string;
}

export interface PricingCardData {
  id: string;
  name: string;
  model: string;
  brand: PricingCardBrand | string | null;
  sku: string;
  barcodeValue: string;
  barcodeSource: 'MANUFACTURER' | 'SKU';
  internalPriceCode?: string | null;
  staffLabelCode?: string | null;
  secretPrice?: string | null;
  cashPrice?: string | null;
  templateId?: string;
  resolvedSpecs?: PricingCardResolvedSpec[];
  features?: PricingCardFeature[];
  currency?: { code: string; display: CurrencyDisplayMode; symbol: string };
  validUntil?: string;
  dimensionsMm?: { widthMm?: number; heightMm?: number; depthMm?: number };
  imageUrl?: string | null;
}

export interface PricingCardWarning {
  productId: string;
  code: string;
  name?: string;
}

export interface PricingCardResult {
  product: PricingCardData;
  warnings: PricingCardWarning[];
}

export interface PricingCardsResult {
  products: PricingCardData[];
  warnings: PricingCardWarning[];
}

export interface PricingCardQuery {
  templateId: string;
  includePriceCode?: boolean;
  includePrice?: boolean;
  validUntil?: string;
  featureCodes?: string[];
}

export interface RecordPricingCardPrintInput {
  productId: string;
  templateId: string;
  snapshot: Record<string, unknown>;
  validUntil?: string | null;
  currencyCode: string;
  publicPrice: string;
  staffLabelCode?: string | null;
  barcodeValue: string;
  copiesPrinted?: number;
  hiddenPricingPresetId?: string | null;
  encodingPresetId?: string | null;
  accountPassword: string;
}
