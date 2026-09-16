import { z } from 'zod';
import { userTextSchema } from '../../../validators/user-text';

export const creditLimitOverrideFields = {
  overrideCreditLimit: z.boolean().optional(),
  creditLimitOverrideReason: userTextSchema({ field: 'Credit-limit override reason', min: 5, max: 1000 }).optional().nullable(),
  accountPassword: z.string().min(1).optional(),
};
