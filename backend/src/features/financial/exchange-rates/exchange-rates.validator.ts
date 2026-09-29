import { z } from 'zod';
import { userTextSchema } from '../../../validators/user-text';

export const createExchangeRateSchema = z.object({
  rate: z.string().trim().regex(
    /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/,
    'Rate must be a decimal string with up to 6 decimal places'
  ).refine(
    (rate) => !/^0(?:\.0{1,6})?$/.test(rate),
    'Rate must be greater than zero'
  ),
  effectiveFrom: z.string().datetime({ offset: true }),
  note: userTextSchema({ field: 'Note', max: 1000 }).optional().nullable(),
}).strict();

export type CreateExchangeRateInput = z.infer<typeof createExchangeRateSchema>;
