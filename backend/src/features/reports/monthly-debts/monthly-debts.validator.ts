import { z } from 'zod';
import { daysInMonth } from '../../financial';

const monthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}$/, 'Month must use YYYY-MM format')
  .refine((value) => {
    const [yearPart, monthPart] = value.split('-');
    const year = Number(yearPart);
    const month = Number(monthPart);
    return Number.isInteger(year) && Number.isInteger(month) && month >= 1 && month <= 12;
  }, 'Month must be a valid calendar month');

const booleanQuerySchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true')
  .default(false);

export const monthlyDebtReportQuerySchema = z.object({
  month: monthSchema,
  mode: z.enum(['SNAPSHOT']).optional().default('SNAPSHOT'),
  includeZero: booleanQuerySchema,
  includeCancelled: booleanQuerySchema,
  overdueOnly: booleanQuerySchema,
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(50),
  sortBy: z.enum(['CUSTOMER', 'OUTSTANDING', 'OVERDUE', 'LAST_PAYMENT']).optional().default('OUTSTANDING'),
  sortOrder: z.enum(['ASC', 'DESC']).optional().default('DESC'),
});

export const monthlyDebtCsvQuerySchema = monthlyDebtReportQuerySchema.extend({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(10000).optional().default(10000),
});

export const monthlyFinancialActivityQuerySchema = z.object({
  month: monthSchema,
  customerId: z.string().uuid('Invalid customer ID').optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(500).default(50),
});

export const monthlyFinancialActivityCsvQuerySchema = monthlyFinancialActivityQuerySchema.extend({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(10000).optional().default(10000),
});

export function monthToBusinessRange(monthValue: string) {
  const [yearPart, monthPart] = monthValue.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const lastDay = daysInMonth(year, month);

  return {
    month: monthValue,
    startDate: `${yearPart}-${monthPart}-01`,
    endDate: `${yearPart}-${monthPart}-${String(lastDay).padStart(2, '0')}`,
  };
}

export type MonthlyDebtReportQueryInput = z.infer<typeof monthlyDebtReportQuerySchema>;
export type MonthlyDebtCsvQueryInput = z.infer<typeof monthlyDebtCsvQuerySchema>;
export type MonthlyFinancialActivityQueryInput = z.infer<typeof monthlyFinancialActivityQuerySchema>;
export type MonthlyFinancialActivityCsvQueryInput = z.infer<typeof monthlyFinancialActivityCsvQuerySchema>;
