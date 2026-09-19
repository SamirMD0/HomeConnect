import { CurrencyDisplayMode, PricingCardRolloutMode } from '@prisma/client';
import { z } from 'zod';
import { userTextSchema } from '../../validators/user-text';

export const MAX_LOGO_BYTES = 512 * 1024;

const accountPassword = z.string().min(1, 'Account password is required');

export const updateShopProfileSchema = z.object({
  name: userTextSchema({ field: 'Shop name', min: 1, max: 120 }).optional(),
  tagline: userTextSchema({ field: 'Tagline', min: 1, max: 240 }).nullable().optional(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/, 'Currency code must be a three-letter ISO-4217 code').optional(),
  currencyDisplay: z.nativeEnum(CurrencyDisplayMode).optional(),
  defaultPricingCardTemplateId: z.string().uuid().nullable().optional(),
  defaultCardValidityDays: z.coerce.number().int().min(0).max(3650).optional(),
  snapshotPrintedCards: z.boolean().optional(),
  pricingCardRolloutMode: z.nativeEnum(PricingCardRolloutMode).optional(),
  accountPassword,
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'accountPassword'), {
  message: 'At least one shop profile field is required',
});

export const updateShopProfileLogoSchema = z.object({
  dataBase64: z.string().min(1),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  accountPassword,
}).strict().superRefine((value, context) => {
  const bytes = Buffer.from(value.dataBase64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) {
    context.addIssue({ code: 'custom', path: ['dataBase64'], message: `Logo must be between 1 and ${MAX_LOGO_BYTES} bytes` });
  }
});

export type UpdateShopProfileInput = z.infer<typeof updateShopProfileSchema>;
export type UpdateShopProfileLogoInput = z.infer<typeof updateShopProfileLogoSchema>;
