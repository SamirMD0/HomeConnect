import { z } from 'zod';

const tierEnum = z.enum(['NO_ACTIVITY', 'CURRENT', 'WATCH', 'LATE', 'SEVERE', 'CRITICAL']);

const booleanQuerySchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true');

/** Express exposes a repeated `tier=` param as a string or an array of strings. */
const tierQuerySchema = z
  .union([tierEnum, z.array(tierEnum)])
  .optional()
  .transform((value) => {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  });

export const receivablesQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  /** YYYY-MM. Scopes amounts to obligations due and payments made in that month. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM')
    .optional(),
  tier: tierQuerySchema,
  onlyWithBalance: booleanQuerySchema,
  includeInactive: booleanQuerySchema,
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  sortBy: z.enum(['standing', 'outstanding', 'overdue', 'name', 'lastPayment']).default('standing'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ReceivablesQueryInput = z.infer<typeof receivablesQuerySchema>;
