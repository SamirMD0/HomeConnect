import { z } from 'zod';

const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must use YYYY-MM-DD');
const booleanQuerySchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true')
  .default(false);

export const dashboardQuerySchema = z
  .object({
    range: z.enum(['today', 'week', 'month', 'quarter', 'year', 'custom']).default('month'),
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
    includeArchived: booleanQuerySchema,
    granularity: z.enum(['day', 'week', 'month']).optional(),
  })
  .superRefine((value, context) => {
    if (value.range === 'custom' && (!value.from || !value.to)) {
      context.addIssue({ code: 'custom', message: 'from and to are required for a custom range' });
    }
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({ code: 'custom', message: 'from must not be after to', path: ['from'] });
    }
  });

export const dashboardMonthEndQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must use YYYY-MM format'),
});

export const dashboardActivityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

export type DashboardQueryInput = z.infer<typeof dashboardQuerySchema>;
export type DashboardMonthEndQueryInput = z.infer<typeof dashboardMonthEndQuerySchema>;
export type DashboardActivityQueryInput = z.infer<typeof dashboardActivityQuerySchema>;

