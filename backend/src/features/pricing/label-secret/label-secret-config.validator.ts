import { LabelSecretEncodingMode } from '@prisma/client';
import { z } from 'zod';
import { userTextSchema } from '../../../validators/user-text';

const uuid = z.string().uuid();
const codeAffix = z.string().max(6).regex(/^[A-Za-z0-9%+*.#@]*$/, 'Use short printable characters without spaces');
const offset = z.string().trim().regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, 'Offset must be a number with up to 2 decimals');

export const updateLabelSecretSettingsSchema = z.object({
  allowedPricingPresetIds: z.array(uuid).max(100),
  defaultPricingPresetId: uuid.nullable(),
  defaultEncodingPresetId: uuid.nullable(),
  showCodeOnLabel: z.boolean(),
  accountPassword: z.string().min(1, 'Account password is required'),
}).strict().superRefine((value, context) => {
  if (value.defaultPricingPresetId && !value.allowedPricingPresetIds.includes(value.defaultPricingPresetId)) {
    context.addIssue({ code: 'custom', path: ['defaultPricingPresetId'], message: 'The default must be an allowed hidden pricing preset' });
  }
});

const encodingShape = {
  name: userTextSchema({ field: 'Encoding name', min: 1, max: 100 }),
  mode: z.nativeEnum(LabelSecretEncodingMode),
  prefix: codeAffix,
  suffix: codeAffix,
  offset,
  digitMap: z.string().nullable(),
  decimalPlaces: z.coerce.number().int().min(0).max(2),
  isActive: z.boolean().default(true),
  accountPassword: z.string().min(1, 'Account password is required'),
};

const validateEncoding = (value: { mode: LabelSecretEncodingMode; digitMap: string | null }, context: z.RefinementCtx) => {
  if (value.mode !== LabelSecretEncodingMode.DIGIT_MAP_PRICE) return;
  if (!value.digitMap || !/^[A-Za-z0-9]{10}$/.test(value.digitMap) || new Set(value.digitMap).size !== 10) {
    context.addIssue({ code: 'custom', path: ['digitMap'], message: 'Digit mapping must contain exactly ten unique letters or numbers' });
  }
};

export const createLabelSecretEncodingSchema = z.object(encodingShape).strict().superRefine(validateEncoding);
export const updateLabelSecretEncodingSchema = z.object(encodingShape).strict().superRefine(validateEncoding);
export const labelSecretEncodingParamsSchema = z.object({ encodingId: uuid });

export type UpdateLabelSecretSettingsInput = z.infer<typeof updateLabelSecretSettingsSchema>;
export type LabelSecretEncodingInput = z.infer<typeof createLabelSecretEncodingSchema>;
