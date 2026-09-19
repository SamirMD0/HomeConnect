import { z } from 'zod';
import { userTextSchema } from '../../../validators/user-text';
import { MAX_FEATURE_ICON_SVG_BYTES } from './sanitize-svg';

const accountPassword = z.string().min(1, 'Account password is required');
const svg = z.string().min(1).refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_FEATURE_ICON_SVG_BYTES, 'SVG must be 8 KB or smaller').refine((value) => !/<\s*script\b/i.test(value), 'SVG scripts are not allowed');
const shape = {
  code: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Code must be kebab-case').max(80),
  label: userTextSchema({ field: 'Icon label', min: 1, max: 100 }),
  category: userTextSchema({ field: 'Icon category', min: 1, max: 80 }).nullable().optional(),
  svg,
  sortOrder: z.coerce.number().int().min(0).max(10000).default(0),
  isActive: z.boolean().default(true),
  accountPassword,
};
export const featureIconListQuerySchema = z.object({ activeOnly: z.enum(['true', 'false']).transform((v) => v === 'true').default(false), category: z.string().trim().min(1).max(80).optional() }).strict();
export const featureIconParamsSchema = z.object({ featureIconId: z.string().uuid() });
export const createFeatureIconSchema = z.object(shape).strict();
export const updateFeatureIconSchema = z.object(shape).strict();
export const archiveFeatureIconSchema = z.object({ accountPassword }).strict();
export type FeatureIconInput = z.infer<typeof createFeatureIconSchema>;
export type ArchiveFeatureIconInput = z.infer<typeof archiveFeatureIconSchema>;
