import { z } from 'zod';
import { userTextSchema } from '../../validators/user-text';

const nullableText = (field: string, max: number) =>
  userTextSchema({ field, max }).nullable().transform((value) => value?.trim() || null);

const nullableEmail = z.string().trim().email('Email must be valid').max(254).nullable()
  .transform((value) => value || null);

const nullableLogoUrl = z.string().trim().max(90_000).nullable().superRefine((value, context) => {
  if (!value) return;
  if (/^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(value)) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return;
  } catch {
    // Fall through to the user-facing validation error.
  }
  context.addIssue({ code: 'custom', message: 'Logo must be an http(s) URL or an image data URL' });
}).transform((value) => value || null);

export const updateBusinessSettingsSchema = z.object({
  shopName: nullableText('Shop name', 160),
  address: nullableText('Address', 1000),
  phone: nullableText('Phone', 80),
  taxNumber: nullableText('VAT/tax number', 120),
  logoUrl: nullableLogoUrl,
  email: nullableEmail,
  returnWindowDays: z.coerce.number().int().min(1).max(365).optional(),
}).strict();

export type UpdateBusinessSettingsInput = z.infer<typeof updateBusinessSettingsSchema>;
