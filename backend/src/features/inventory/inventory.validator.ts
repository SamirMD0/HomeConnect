import { ValidationError } from '../../lib/errors';
import { INVENTORY_QUANTITY_LIMIT } from './inventory.types';
import { StockMovementType } from '@prisma/client';
import { z } from 'zod';
import { databaseUuidSchema } from '../../validators/database-uuid';

const reasonSchema = z.string().trim().min(1, 'Reason is required').max(1000, 'Reason is too long');
const optionalText = z.string().trim().max(2000).optional().nullable();
const expectedBeforeSchema = z.number().int().min(0).optional();
const uuidSchema = databaseUuidSchema();
const wiredMovementSchema = z.enum([
  StockMovementType.MANUAL_ADD,
  StockMovementType.MANUAL_REMOVE,
  StockMovementType.STOCK_COUNT,
  StockMovementType.DAMAGE_LOSS,
  StockMovementType.RETURN_TO_STOCK,
]);

export const inventoryProductParamsSchema = z.object({ productId: uuidSchema });
export const stockMovementSchema = z.object({
  movementType: wiredMovementSchema,
  quantity: z.number().int('Quantity must be a whole number').min(0).max(INVENTORY_QUANTITY_LIMIT),
  expectedBefore: expectedBeforeSchema,
  reason: reasonSchema,
  note: optionalText,
  referenceType: z.string().trim().max(100).optional().nullable(),
  referenceId: uuidSchema.optional().nullable(),
  accountPassword: z.string().min(1, 'Account password is required').optional(),
}).superRefine((input, context) => {
  if (input.movementType !== StockMovementType.STOCK_COUNT && input.quantity === 0) {
    context.addIssue({ code: 'custom', path: ['quantity'], message: 'Quantity must be greater than zero' });
  }
  const guarded: StockMovementType[] = [StockMovementType.MANUAL_REMOVE, StockMovementType.STOCK_COUNT, StockMovementType.DAMAGE_LOSS];
  if (guarded.includes(input.movementType)
      && !input.accountPassword) {
    context.addIssue({ code: 'custom', path: ['accountPassword'], message: 'Account password is required' });
  }
});

export const verifyOpeningCountSchema = z.object({
  verifiedCount: z.number().int('Verified count must be a whole number').min(0, 'Verified count cannot be negative').max(INVENTORY_QUANTITY_LIMIT),
  reason: reasonSchema,
  note: optionalText,
  accountPassword: z.string().min(1, 'Account password is required'),
}).strict();

export const inventoryMovementListSchema = z.object({
  productId: uuidSchema.optional(),
  movementType: z.nativeEnum(StockMovementType).optional(),
  createdById: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export const lowStockListSchema = z.object({
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});

export type InventoryProductParamsInput = z.infer<typeof inventoryProductParamsSchema>;
export type StockMovementInput = z.infer<typeof stockMovementSchema>;
export type VerifyOpeningCountInput = z.infer<typeof verifyOpeningCountSchema>;
export type InventoryMovementListQuery = z.infer<typeof inventoryMovementListSchema>;
export type LowStockListQuery = z.infer<typeof lowStockListSchema>;

export function assertMovementQuantity(quantity: number): void {
  assertInteger(quantity, 'Quantity');
  if (quantity <= 0) throw new ValidationError('Quantity must be greater than zero');
  if (quantity > INVENTORY_QUANTITY_LIMIT) {
    throw new ValidationError(`Quantity must not exceed ${INVENTORY_QUANTITY_LIMIT.toLocaleString('en-US')}`);
  }
}

export function assertStockCountTarget(targetTotal: number): void {
  assertInteger(targetTotal, 'Counted stock total');
  if (targetTotal < 0) throw new ValidationError('Counted stock total cannot be negative');
  if (targetTotal > INVENTORY_QUANTITY_LIMIT) {
    throw new ValidationError(`Counted stock total must not exceed ${INVENTORY_QUANTITY_LIMIT.toLocaleString('en-US')}`);
  }
}

export function assertExpectedBefore(expectedBefore: number | undefined): void {
  if (expectedBefore === undefined) return;
  assertInteger(expectedBefore, 'Expected stock quantity');
  if (expectedBefore < 0) throw new ValidationError('Expected stock quantity cannot be negative');
}

export function normalizeRequiredReason(reason: string): string {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new ValidationError('Reason is required');
  }
  return reason.trim();
}

export function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new ValidationError(`${label} must be a whole number`);
}
