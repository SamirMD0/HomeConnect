import { z } from 'zod';
import { userTextSchema } from '../../validators/user-text';
import { MAX_LOGO_BYTES } from '../shop/shop-profile.validator';

const logoShape = {
  displayName: userTextSchema({ field: 'Brand display name', min: 1, max: 120 }),
  canonicalName: z.string().trim().min(1).max(120).optional(),
  dataBase64: z.string().min(1),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
};

export const brandLogoListQuerySchema = z.object({
  activeOnly: z.enum(['true', 'false']).transform((value) => value === 'true').default(false),
}).strict();
export const brandLogoParamsSchema = z.object({ brandLogoId: z.string().uuid() });
export const createBrandLogoSchema = z.object(logoShape).strict().superRefine(validateByteSize);
export const updateBrandLogoSchema = z.object(logoShape).strict().superRefine(validateByteSize);
export const archiveBrandLogoSchema = z.object({}).strict();

function validateByteSize(value: { dataBase64: string }, context: z.RefinementCtx) {
  const size = Buffer.from(value.dataBase64, 'base64').length;
  if (size === 0 || size > MAX_LOGO_BYTES) context.addIssue({ code: 'custom', path: ['dataBase64'], message: `Logo must be between 1 and ${MAX_LOGO_BYTES} bytes` });
}

export type BrandLogoInput = z.infer<typeof createBrandLogoSchema>;
export type ArchiveBrandLogoInput = z.infer<typeof archiveBrandLogoSchema>;
