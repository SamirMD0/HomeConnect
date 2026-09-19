import { z } from 'zod';

export const MAX_TEMPLATE_CONFIG_BYTES = 16 * 1024;

const positiveScale = z.number().positive().max(10);
const position = z.enum(['left', 'right']);

export const PricingCardTemplateConfigZ = z.object({
  configVersion: z.literal(1),
  header: z.object({
    companyLogo: z.object({ show: z.boolean(), sizeMm: z.number().positive().max(100), position }).strict(),
    brand: z.object({ display: z.enum(['text', 'logo', 'logo+text']), position, sizeMm: z.number().positive().max(100) }).strict(),
  }).strict(),
  body: z.object({
    title: z.object({ show: z.boolean(), maxLines: z.union([z.literal(1), z.literal(2), z.literal(3)]), fontScale: positiveScale }).strict(),
    model: z.object({ show: z.boolean(), prefix: z.string().max(40).optional() }).strict(),
    dimensions: z.object({ show: z.boolean() }).strict(),
    specs: z.object({ show: z.boolean(), maxRows: z.number().int().min(0).max(40) }).strict(),
    image: z.object({ show: z.boolean(), columnWidthPct: z.number().min(0).max(80) }).strict(),
  }).strict(),
  features: z.object({ show: z.boolean(), layout: z.enum(['row', 'grid-2x3', 'grid-3x2']), showLabels: z.boolean(), showValues: z.boolean() }).strict(),
  price: z.object({
    show: z.boolean(), fontScale: positiveScale, weight: z.union([z.literal(500), z.literal(700), z.literal(800), z.literal(900)]),
    emphasis: z.enum(['plain', 'boxed', 'underlined']), currencyDisplay: z.enum(['SYMBOL', 'CODE', 'SYMBOL_AND_CODE']).optional(),
    validUntil: z.object({ show: z.boolean(), format: z.enum(['dmy', 'd-mon-y', 'iso']) }).strict(),
  }).strict(),
  sku: z.object({ show: z.boolean(), showSecretCode: z.boolean(), prefix: z.string().max(40) }).strict(),
  barcode: z.object({ show: z.boolean(), showDigits: z.boolean(), targetWidthMm: z.number().min(10).max(210) }).strict(),
  appearance: z.object({
    marginMm: z.number().min(0).max(30), innerGapMm: z.number().min(0).max(30),
    borderPx: z.union([z.literal(0), z.literal(1), z.literal(2)]), sectionDividers: z.boolean(), fontScale: positiveScale,
    orientation: z.enum(['portrait', 'landscape']),
  }).strict(),
  specKeyAliases: z.record(z.string(), z.array(z.string().trim().min(1).max(120)).max(40)).optional(),
}).strict().refine((value) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= MAX_TEMPLATE_CONFIG_BYTES, {
  message: 'Template config must be 16 KB or smaller',
});

export type PricingCardTemplateConfig = z.infer<typeof PricingCardTemplateConfigZ>;
export function parseTemplateConfig(value: unknown): PricingCardTemplateConfig { return PricingCardTemplateConfigZ.parse(value); }
