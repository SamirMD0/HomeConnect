import { z } from 'zod';
import { parseBusinessDate } from '../../financial';

const businessDateSchema = z.string().refine((value) => {
  try {
    parseBusinessDate(value);
    return true;
  } catch {
    return false;
  }
}, 'Must use a valid YYYY-MM-DD business date');

export const monthlyReviewQuerySchema = z
  .object({
    period: z.enum(['thisMonth', 'lastMonth', 'custom', 'thisWeek', 'today']).default('thisMonth'),
    from: businessDateSchema.optional(),
    to: businessDateSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.period === 'custom' && (!value.from || !value.to)) {
      context.addIssue({ code: 'custom', message: 'from and to are required for a custom period' });
    }
    if (value.from && value.to && value.from > value.to) {
      context.addIssue({ code: 'custom', path: ['from'], message: 'from must not be after to' });
    }
  });

export type MonthlyReviewQueryInput = z.infer<typeof monthlyReviewQuerySchema>;
