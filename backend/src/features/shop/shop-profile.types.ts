import { CurrencyDisplayMode, PricingCardRolloutMode } from '@prisma/client';

export interface ShopProfileDto {
  id: string;
  name: string;
  tagline: string | null;
  hasLogo: boolean;
  logoMimeType: string | null;
  logoByteSize: number | null;
  logoDataUrl: string | null;
  currencyCode: string;
  currencyDisplay: CurrencyDisplayMode;
  defaultPricingCardTemplateId: string | null;
  defaultCardValidityDays: number;
  snapshotPrintedCards: boolean;
  pricingCardRolloutMode: PricingCardRolloutMode;
}
