import { CurrencyDisplayMode, PricingCardRolloutMode } from '@prisma/client';
import { z } from 'zod';
import { userTextSchema } from '../../validators/user-text';

export const MAX_LOGO_BYTES = 512 * 1024;

export const updateShopProfileSchema = z.object({
  name: userTextSchema({ field: 'Shop name', min: 1, max: 120 }).optional(),
  tagline: userTextSchema({ field: 'Tagline', min: 1, max: 240 }).nullable().optional(),
  currencyCode: z.string().regex(/^[A-Z]{3}$/, 'Currency code must be a three-letter ISO-4217 code').optional(),
  currencyDisplay: z.nativeEnum(CurrencyDisplayMode).optional(),
  defaultPricingCardTemplateId: z.string().uuid().nullable().optional(),
  categoryDefaultTemplates: z.record(
    z.string().trim().min(1, 'Category is required').max(120),
    z.string().uuid('Category template must be a valid template ID').nullable()
  ).optional(),
  defaultCardValidityDays: z.coerce.number().int().min(0).max(3650).optional(),
  snapshotPrintedCards: z.boolean().optional(),
  pricingCardRolloutMode: z.nativeEnum(PricingCardRolloutMode).optional(),
  accountPassword: z.string().min(1, 'Account password is required').optional(),
}).strict().superRefine((value, context) => {
  const fields = Object.keys(value).filter((field) => field !== 'accountPassword');
  if (fields.length === 0) context.addIssue({ code: 'custom', message: 'At least one shop profile field is required' });
  if (value.categoryDefaultTemplates !== undefined && !value.accountPassword) {
    context.addIssue({ code: 'custom', path: ['accountPassword'], message: 'Account password is required for template assignments' });
  }
  if (value.categoryDefaultTemplates === undefined && value.accountPassword !== undefined) {
    context.addIssue({ code: 'custom', path: ['accountPassword'], message: 'Account password is only accepted with category template assignments' });
  }
});

export const updateShopProfileLogoSchema = z.object({
  dataBase64: z.string().min(1),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
}).strict().superRefine((value, context) => {
  const bytes = Buffer.from(value.dataBase64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_LOGO_BYTES) {
    context.addIssue({ code: 'custom', path: ['dataBase64'], message: `Logo must be between 1 and ${MAX_LOGO_BYTES} bytes` });
  }
});

export type UpdateShopProfileInput = z.infer<typeof updateShopProfileSchema>;
export type UpdateShopProfileLogoInput = z.infer<typeof updateShopProfileLogoSchema>;
