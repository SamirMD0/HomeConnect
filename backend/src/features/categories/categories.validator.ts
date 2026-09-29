import { z } from 'zod';
import { databaseUuidSchema } from '../../validators/database-uuid';
import { userTextSchema } from '../../validators/user-text';

const values = {
  name: userTextSchema({ field: 'Category name', min: 1, max: 120 }),
  parentId: databaseUuidSchema('Invalid parent category ID')
    .transform((id) => id.toLowerCase())
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
};
export const createCategorySchema = z.object(values).strict();
export const updateCategorySchema = z
  .object(values)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one category field is required');
export const categoryParamsSchema = z.object({
  categoryId: databaseUuidSchema('Invalid category ID').transform((id) => id.toLowerCase()),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
