import { PricingCardPaperMode, PricingCardPaperSize } from '@prisma/client';
import { z } from 'zod';
import { userTextSchema } from '../../../validators/user-text';
import { PricingCardTemplateConfigZ } from './pricing-card-template-config.z';

const accountPassword = z.string().min(1, 'Account password is required');
const shape = {
  name: userTextSchema({ field: 'Template name', min: 1, max: 120 }),
  description: userTextSchema({ field: 'Template description', min: 1, max: 500 }).nullable().optional(),
  paperMode: z.nativeEnum(PricingCardPaperMode),
  paperSize: z.nativeEnum(PricingCardPaperSize).nullable().optional(),
  cardWidthMm: z.coerce.number().min(20).max(210),
  cardHeightMm: z.coerce.number().min(20).max(210),
  config: PricingCardTemplateConfigZ,
  featureMax: z.coerce.number().int().min(0).max(8),
  specKeyOrder: z.array(z.string().trim().regex(/^[a-z0-9_]+$/).max(80)).max(40),
  defaultValidityDays: z.coerce.number().int().min(0).max(3650).nullable().optional(),
  accountPassword,
};

const templateSchema = z.object(shape).strict().superRefine((value, context) => {
  if (value.paperMode === PricingCardPaperMode.SHEET && !value.paperSize) context.addIssue({ code: 'custom', path: ['paperSize'], message: 'Paper size is required for sheet templates' });
  if (value.paperMode === PricingCardPaperMode.SINGLE_STICKER && value.paperSize) context.addIssue({ code: 'custom', path: ['paperSize'], message: 'Paper size is only valid for sheet templates' });
});

export const pricingCardTemplateListQuerySchema = z.object({ activeOnly: z.enum(['true', 'false']).transform((value) => value === 'true').default(false) }).strict();
export const pricingCardTemplateParamsSchema = z.object({ templateId: z.string().uuid() });
export const createPricingCardTemplateSchema = templateSchema;
export const updatePricingCardTemplateSchema = templateSchema;
export const archivePricingCardTemplateSchema = z.object({ reason: userTextSchema({ field: 'Archive reason', min: 5, max: 500 }), accountPassword }).strict();
export type PricingCardTemplateInput = z.infer<typeof createPricingCardTemplateSchema>;
export type ArchivePricingCardTemplateInput = z.infer<typeof archivePricingCardTemplateSchema>;
