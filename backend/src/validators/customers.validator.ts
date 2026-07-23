import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long').max(100, 'Name is too long'),
  phone: z.string().min(5, 'Phone number must be at least 5 characters long').max(20, 'Phone number is too long'),
  address: z.string().max(255, 'Address is too long').optional(),
  notes: z.string().optional(),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters long').max(100, 'Name is too long').optional(),
  phone: z.string().min(5, 'Phone number must be at least 5 characters long').max(20, 'Phone number is too long').optional(),
  address: z.string().max(255, 'Address is too long').optional().nullable(),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export const customerQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  limit: z.string().regex(/^\d+$/).transform(Number).optional().default('10'),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CustomerQueryInput = z.infer<typeof customerQuerySchema>;
