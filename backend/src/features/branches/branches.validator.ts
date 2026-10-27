import { z } from 'zod';
import { databaseUuidSchema } from '../../validators/database-uuid';
import { userTextSchema } from '../../validators/user-text';

const lowerUuid = (message: string) => databaseUuidSchema(message).transform((id) => id.toLowerCase());

const values = {
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{0,11}$/, 'Branch code must be 1-12 letters, digits or dashes'),
  name: userTextSchema({ field: 'Branch name', min: 1, max: 120 }),
  address: userTextSchema({ field: 'Branch address', max: 500 }).nullable().optional(),
  phone: userTextSchema({ field: 'Branch phone', max: 40 }).nullable().optional(),
  isActive: z.boolean().optional(),
};

export const createBranchSchema = z.object(values).strict();
export const updateBranchSchema = z
  .object(values)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one branch field is required');
export const branchParamsSchema = z.object({ branchId: lowerUuid('Invalid branch ID') });
export const userBranchParamsSchema = z.object({ userId: lowerUuid('Invalid user ID') });
export const setUserBranchAccessSchema = z
  .object({ branchIds: z.array(lowerUuid('Invalid branch ID')).max(100) })
  .strict();

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type SetUserBranchAccessInput = z.infer<typeof setUserBranchAccessSchema>;
