import { z } from 'zod';
import { userTextSchema } from './user-text';

export const createCustomerSchema = z.object({
  name: userTextSchema({ field: 'Name', min: 2, max: 100 }),
  phone: z.string().min(5, 'Phone number must be at least 5 characters long').max(20, 'Phone number is too long'),
  address: userTextSchema({ field: 'Address', max: 255 }).optional(),
  notes: userTextSchema({ field: 'Notes', max: 1000 }).optional(),
});

export const updateCustomerSchema = z.object({
  name: userTextSchema({ field: 'Name', min: 2, max: 100 }).optional(),
  phone: z.string().min(5, 'Phone number must be at least 5 characters long').max(20, 'Phone number is too long').optional(),
  address: userTextSchema({ field: 'Address', max: 255 }).optional().nullable(),
  notes: userTextSchema({ field: 'Notes', max: 1000 }).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const customerQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // Doubles as the ceiling on how many customers one financial enrichment can
  // cover, since enrichment only ever runs over the page being returned.
  limit: z.coerce.number().int().positive().max(100).default(10),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt', 'outstanding', 'overdue', 'lastPayment']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  /** Opt-in financial figures per customer. Omitted keeps the lean payload. */
  include: z.enum(['financial']).optional(),
  filter: z.enum(['withBalance', 'overdue', 'noDebt', 'inactive']).optional(),
});

export const customerSuggestionsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(3).default(3),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerQueryInput = z.infer<typeof customerQuerySchema>;
