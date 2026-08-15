import { z } from 'zod';
import { compareBusinessDates, parseBusinessDate, todayInBusinessTimezone } from '../../financial/domain/business-date';
import { isPositiveMoney } from '../../financial/domain/money';
import { databaseUuidSchema } from '../../../validators/database-uuid';
import { userTextSchema } from '../../../validators/user-text';
import { INVENTORY_QUANTITY_LIMIT } from '../../inventory/inventory.types';

const uuid = databaseUuidSchema();
const emptyToNull = (value: unknown) => typeof value === 'string' && value.trim() === '' ? null : value;
const optionalText = (field: string, max: number) => z.preprocess(emptyToNull, userTextSchema({ field, max }).optional().nullable());

/** Non-negative money: a bonus line legitimately costs nothing. */
const unitPrice = z.string().trim().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, 'Unit price must be a non-negative decimal string');
/** Strictly positive money, for amounts that must represent a real charge. */
const positiveAmount = unitPrice.refine((value) => isPositiveMoney(value), 'Amount must be greater than zero');
/** Non-negative money for the settled portion of a bill; zero means unpaid. */
const paidAmount = z.string().trim().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, 'Paid amount must be a non-negative decimal string');

const quantity = z.number().int('Quantity must be a whole number').min(1).max(INVENTORY_QUANTITY_LIMIT);

const purchaseDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD').superRefine((value, ctx) => {
  try {
    parseBusinessDate(value);
    if (compareBusinessDates(value, todayInBusinessTimezone()) > 0) ctx.addIssue({ code: 'custom', message: 'Future purchase dates are not allowed' });
  } catch { ctx.addIssue({ code: 'custom', message: 'Invalid purchase date' }); }
});

/**
 * Three line modes, one discriminated union, so an impossible combination —
 * a manual line carrying a product id, a product line missing a quantity —
 * cannot reach the service at all.
 */
const existingProductLine = z.object({
  kind: z.literal('EXISTING_PRODUCT'),
  productId: uuid,
  quantity,
  unitPrice,
}).strict();

const newProductLine = z.object({
  kind: z.literal('NEW_PRODUCT'),
  name: userTextSchema({ field: 'Product name', min: 1, max: 200 }),
  model: userTextSchema({ field: 'Model', min: 1, max: 120 }),
  barcode: z.preprocess(emptyToNull, z.string().trim().min(4, 'Barcode must be at least 4 characters').max(64, 'Barcode is too long')
    .regex(/^[A-Za-z0-9-]+$/, 'Barcode may contain only letters, numbers, and hyphens').optional().nullable()),
  brand: optionalText('Brand', 120),
  /** Optional retail price. Never used as, or derived from, the supplier cost. */
  sellingPrice: z.preprocess(emptyToNull, unitPrice.optional().nullable()),
  quantity,
  unitPrice,
}).strict();

const manualLine = z.object({
  kind: z.literal('MANUAL'),
  description: userTextSchema({ field: 'Description', min: 2, max: 500 }),
  amount: positiveAmount,
}).strict();

const purchaseLine = z.discriminatedUnion('kind', [existingProductLine, newProductLine, manualLine]);

export const createSupplierPurchaseSchema = z.object({
  receiptNumber: optionalText('Receipt number', 200),
  transactionDate: purchaseDate,
  description: userTextSchema({ field: 'Description', min: 3, max: 500 }),
  reference: optionalText('Reference', 200),
  notes: optionalText('Notes', 2000),
  /**
   * Whether product lines actually move stock. False records a priced debt for
   * goods that have not arrived — legitimate, and deliberately explicit rather
   * than inferred.
   */
  receiveStock: z.boolean().default(true),
  amountOverride: z.preprocess(emptyToNull, positiveAmount.optional().nullable()),
  amountOverrideReason: optionalText('Override reason', 1000),
  /**
   * How much of this bill was settled on the spot. Zero or absent leaves the
   * whole bill owed. The debt always records what was billed; this is posted
   * as a separate payment so both figures survive.
   */
  paidAmount: z.preprocess(emptyToNull, paidAmount.optional().nullable()),
  /** How the settled portion was paid, for the payment's ledger description. */
  paymentReference: optionalText('Payment reference', 200),
  /** Required only when a NEW_PRODUCT line is present. */
  accountPassword: z.string().min(1).optional(),
  lines: z.array(purchaseLine).min(1, 'At least one purchase line is required').max(100),
}).strict().superRefine((input, ctx) => {
  const quickAdds = input.lines.filter((line) => line.kind === 'NEW_PRODUCT');

  if (quickAdds.length && !input.accountPassword) {
    ctx.addIssue({ code: 'custom', path: ['accountPassword'], message: 'Your account password is required to add a new product from a purchase' });
  }

  // Onboarding a product means writing its opening count. Doing that for goods
  // that have not arrived would leave a tracked product whose zero baseline was
  // never observed, so quick add is tied to an actual receipt.
  if (quickAdds.length && !input.receiveStock) {
    ctx.addIssue({ code: 'custom', path: ['lines'], message: 'A new product can only be added on a purchase that receives stock' });
  }

  // A quick-added product's opening count is written now, so a backdated
  // receipt would land before its own baseline and be rejected downstream.
  // Saying so here names the fix instead of failing deep in the receiving guard.
  if (quickAdds.length && input.transactionDate && compareBusinessDates(input.transactionDate, todayInBusinessTimezone()) < 0) {
    ctx.addIssue({ code: 'custom', path: ['transactionDate'], message: 'A purchase that adds a new product must be dated today — create the product first to backdate it' });
  }

  const seenProducts = new Set<string>();
  input.lines.forEach((line, index) => {
    if (line.kind !== 'EXISTING_PRODUCT') return;
    // Mirrors the receiving table's one-row-per-product rule, reported here
    // against the line the user can actually see and fix.
    if (seenProducts.has(line.productId)) {
      ctx.addIssue({ code: 'custom', path: ['lines', index, 'productId'], message: 'Each product may appear only once — combine the quantities into one line' });
    }
    seenProducts.add(line.productId);
  });

  if (input.amountOverride && !input.amountOverrideReason) {
    ctx.addIssue({ code: 'custom', path: ['amountOverrideReason'], message: 'A reason is required when the total is set by hand' });
  }
  if (!input.amountOverride && input.amountOverrideReason) {
    ctx.addIssue({ code: 'custom', path: ['amountOverride'], message: 'An override reason was given without an override amount' });
  }
});

export const supplierPurchaseParamsSchema = z.object({ supplierId: uuid });
export const supplierPurchaseIdParamsSchema = z.object({ purchaseId: uuid });
export const supplierPurchaseListSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(25),
});
export const receiptCheckSchema = z.object({
  supplierId: uuid,
  receiptNumber: z.string().trim().min(1).max(200),
}).strict();

export type CreateSupplierPurchaseInput = z.infer<typeof createSupplierPurchaseSchema>;
export type SupplierPurchaseLineInput = z.infer<typeof purchaseLine>;
export type SupplierPurchaseListInput = z.infer<typeof supplierPurchaseListSchema>;
export type ReceiptCheckInput = z.infer<typeof receiptCheckSchema>;
