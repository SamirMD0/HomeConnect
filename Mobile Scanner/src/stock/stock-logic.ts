/**
 * Pure rules for the Phase 4 stock screens. They mirror the desktop:
 * - frontend/src/features/inventory/utils/stock-movement.ts (movement types, guards)
 * - backend inventory.validator.ts / inventory.service.ts (quantity limits, admin-only
 *   corrections, expectedBefore compare-and-set)
 * - frontend receiving SupplierReceivingForm (receiving payload)
 * Stock is one shared quantity per product; nothing here is per-branch.
 */

export type MovementType =
  | 'MANUAL_ADD'
  | 'MANUAL_REMOVE'
  | 'STOCK_COUNT'
  | 'DAMAGE_LOSS'
  | 'RETURN_TO_STOCK';

/** backend/src/features/inventory/inventory.types.ts */
export const INVENTORY_QUANTITY_LIMIT = 100_000;

export const movementLabels: Record<MovementType, string> = {
  MANUAL_ADD: 'Add stock',
  MANUAL_REMOVE: 'Remove stock',
  STOCK_COUNT: 'Correct stock count',
  DAMAGE_LOSS: 'Damage or loss',
  RETURN_TO_STOCK: 'Return to stock',
};

/** Need ADMIN and the account password on the server. */
export const guardedMovementTypes: MovementType[] = ['MANUAL_REMOVE', 'STOCK_COUNT', 'DAMAGE_LOSS'];

export function movementTypesFor(role: string | undefined): MovementType[] {
  const open: MovementType[] = ['MANUAL_ADD', 'RETURN_TO_STOCK'];
  return role === 'ADMIN' ? [...open, ...guardedMovementTypes] : open;
}

export function movementAfter(type: MovementType, before: number, quantity: number): number {
  if (type === 'STOCK_COUNT') return quantity;
  if (type === 'MANUAL_REMOVE' || type === 'DAMAGE_LOSS') return before - quantity;
  return before + quantity;
}

export interface MovementPayload {
  movementType: MovementType;
  quantity: number;
  expectedBefore: number;
  reason: string;
  note: string | null;
  accountPassword?: string;
}

export function parseWholeQuantity(value: string, allowZero: boolean): number {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) throw new Error('Enter a whole number.');
  const quantity = Number(trimmed);
  if (!Number.isSafeInteger(quantity) || quantity > INVENTORY_QUANTITY_LIMIT)
    throw new Error(`Quantity must not exceed ${INVENTORY_QUANTITY_LIMIT.toLocaleString('en-US')}.`);
  if (!allowZero && quantity === 0) throw new Error('Quantity must be greater than zero.');
  return quantity;
}

/**
 * expectedBefore is always sent. The server compares it before writing, so a
 * retry after a lost response is rejected as "stock changed" instead of being
 * applied twice.
 */
export function buildMovementPayload(input: {
  type: MovementType;
  quantity: string;
  expectedBefore: number;
  reason: string;
  note: string;
  password: string;
}): MovementPayload {
  const quantity = parseWholeQuantity(input.quantity, input.type === 'STOCK_COUNT');
  const reason = input.reason.trim();
  if (!reason) throw new Error('Reason is required.');
  if (reason.length > 1000) throw new Error('Reason is too long.');
  const guarded = guardedMovementTypes.includes(input.type);
  if (guarded && !input.password) throw new Error('Enter your account password.');
  const after = movementAfter(input.type, input.expectedBefore, quantity);
  if (after < 0)
    throw new Error(`Cannot remove ${quantity}; only ${input.expectedBefore} in stock.`);
  if (input.type === 'STOCK_COUNT' && after === input.expectedBefore)
    throw new Error('The count matches the current stock. Nothing to change.');
  return {
    movementType: input.type,
    quantity,
    expectedBefore: input.expectedBefore,
    reason,
    note: input.note.trim() || null,
    ...(guarded ? { accountPassword: input.password } : {}),
  };
}

/** Server messages are bilingual ("English / Arabic"); the app is English-only. */
export function englishMessage(message: string): string {
  return (message.split(' / ')[0] ?? message).trim();
}

export function isStaleStockMessage(message: string): boolean {
  return /^Stock changed from expected/i.test(message);
}

export function isAccountPasswordMessage(message: string): boolean {
  return /^(Account password|Too many failed correction password)/i.test(message);
}

// ---------------------------------------------------------------- stock count

export type CountLineStatus = 'pending' | 'done' | 'matched' | 'conflict' | 'error';

export interface CountLine {
  productId: string;
  name: string;
  sku: string;
  /** Shared stock when the product was first counted; sent as expectedBefore. */
  expected: number;
  counted: number;
  status: CountLineStatus;
  message: string | null;
}

export interface CountForm {
  reason: string;
  note: string;
  lines: CountLine[];
}

export const MAX_COUNT_LINES = 200;

export function initialCount(): CountForm {
  return { reason: 'Stock count', note: '', lines: [] };
}

/** A scan of a new product adds it with count 1; a repeat scan adds 1. */
export function addCountScan(
  form: CountForm,
  product: { id: string; name: string; sku: string; stockQuantity: number; trackStock: boolean }
): CountForm {
  if (!product.trackStock) throw new Error(`${product.name} does not track stock.`);
  const existing = form.lines.find((line) => line.productId === product.id);
  if (existing) {
    if (existing.status === 'done' || existing.status === 'matched')
      throw new Error(`${product.name} was already submitted in this count.`);
    return setCounted(form, product.id, existing.counted + 1);
  }
  if (form.lines.length >= MAX_COUNT_LINES)
    throw new Error(`A count can hold at most ${MAX_COUNT_LINES} products. Submit this one first.`);
  return {
    ...form,
    lines: [
      {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        expected: product.stockQuantity,
        counted: 1,
        status: 'pending',
        message: null,
      },
      ...form.lines,
    ],
  };
}

export function setCounted(form: CountForm, productId: string, counted: number): CountForm {
  if (!Number.isSafeInteger(counted) || counted < 0 || counted > INVENTORY_QUANTITY_LIMIT)
    throw new Error('Counted quantity must be a whole number from 0.');
  return {
    ...form,
    lines: form.lines.map((line) =>
      line.productId === productId
        ? { ...line, counted, status: line.status === 'conflict' ? 'conflict' : 'pending' }
        : line
    ),
  };
}

export function removeCountLine(form: CountForm, productId: string): CountForm {
  return { ...form, lines: form.lines.filter((line) => line.productId !== productId) };
}

/** After a conflict the operator accepts the PC's current stock as the new baseline. */
export function rebaseCountLine(form: CountForm, productId: string, current: number): CountForm {
  return {
    ...form,
    lines: form.lines.map((line) =>
      line.productId === productId
        ? { ...line, expected: current, status: 'pending', message: null }
        : line
    ),
  };
}

export function countDifference(line: CountLine): number {
  return line.counted - line.expected;
}

export function countSummary(form: CountForm) {
  const open = form.lines.filter((line) => line.status !== 'done' && line.status !== 'matched');
  return {
    total: form.lines.length,
    changed: open.filter((line) => countDifference(line) !== 0).length,
    matching: open.filter((line) => countDifference(line) === 0).length,
    submitted: form.lines.length - open.length,
    conflicts: form.lines.filter((line) => line.status === 'conflict').length,
  };
}

/** Lines still to send: anything not finished whose count differs from the baseline. */
export function linesToSubmit(form: CountForm): CountLine[] {
  return form.lines.filter(
    (line) =>
      (line.status === 'pending' || line.status === 'error') && countDifference(line) !== 0
  );
}

export function countPayload(form: CountForm, line: CountLine, password: string): MovementPayload {
  const reason = form.reason.trim();
  if (!reason) throw new Error('Reason is required.');
  if (!password) throw new Error('Enter your account password.');
  return {
    movementType: 'STOCK_COUNT',
    quantity: line.counted,
    expectedBefore: line.expected,
    reason,
    note: form.note.trim() || null,
    accountPassword: password,
  };
}

/**
 * Resolve a stale-stock rejection. If the PC already shows the counted value,
 * an earlier attempt succeeded and its response was lost: the line is done.
 */
export function resolveStale(line: CountLine, current: number): CountLine {
  if (current === line.counted) return { ...line, status: 'done', message: null };
  return {
    ...line,
    status: 'conflict',
    message: `Stock changed on the PC from ${line.expected} to ${current} after you counted. Recount, or use ${current} as the new starting stock.`,
  };
}

export function markLine(
  form: CountForm,
  productId: string,
  patch: Partial<Pick<CountLine, 'status' | 'message' | 'expected'>>
): CountForm {
  return {
    ...form,
    lines: form.lines.map((line) => (line.productId === productId ? { ...line, ...patch } : line)),
  };
}

// ------------------------------------------------------------------ receiving

export interface ReceiveLine {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
}

export interface ReceiveForm {
  supplierId: string;
  supplierName: string;
  referenceNumber: string;
  receivedOn: string;
  note: string;
  lines: ReceiveLine[];
}

export const MAX_RECEIVE_LINES = 100;

export function initialReceive(today: string): ReceiveForm {
  return {
    supplierId: '',
    supplierName: '',
    referenceNumber: '',
    receivedOn: today,
    note: '',
    lines: [],
  };
}

export function addReceiveScan(
  form: ReceiveForm,
  product: { id: string; name: string; sku: string; trackStock: boolean }
): ReceiveForm {
  if (!product.trackStock) throw new Error(`${product.name} does not track stock.`);
  const existing = form.lines.find((line) => line.productId === product.id);
  if (existing) return setReceiveQuantity(form, product.id, existing.quantity + 1);
  if (form.lines.length >= MAX_RECEIVE_LINES)
    throw new Error(`A receiving document can hold at most ${MAX_RECEIVE_LINES} products.`);
  return {
    ...form,
    lines: [{ productId: product.id, name: product.name, sku: product.sku, quantity: 1 }, ...form.lines],
  };
}

export function setReceiveQuantity(form: ReceiveForm, productId: string, quantity: number): ReceiveForm {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > INVENTORY_QUANTITY_LIMIT)
    throw new Error('Quantity must be a whole number of at least 1.');
  return {
    ...form,
    lines: form.lines.map((line) => (line.productId === productId ? { ...line, quantity } : line)),
  };
}

export function removeReceiveLine(form: ReceiveForm, productId: string): ReceiveForm {
  return { ...form, lines: form.lines.filter((line) => line.productId !== productId) };
}

export interface ReceivingPayload {
  idempotencyKey: string;
  supplierId: string | null;
  referenceNumber: string | null;
  note: string | null;
  receivedOn: string;
  items: { productId: string; quantity: number }[];
}

/** Same shape as the desktop toCreateReceivingInput(). */
export function buildReceivingPayload(
  form: ReceiveForm,
  idempotencyKey: string,
  today: string
): ReceivingPayload {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.receivedOn)) throw new Error('Enter the receiving date as YYYY-MM-DD.');
  if (form.receivedOn > today) throw new Error('The receiving date cannot be in the future.');
  if (!form.lines.length) throw new Error('Scan or add at least one product.');
  if (form.lines.length > MAX_RECEIVE_LINES)
    throw new Error(`A receiving document can hold at most ${MAX_RECEIVE_LINES} products.`);
  if (form.referenceNumber.length > 200) throw new Error('Reference number is too long.');
  if (form.note.length > 2000) throw new Error('Note is too long.');
  return {
    idempotencyKey,
    supplierId: form.supplierId || null,
    referenceNumber: form.referenceNumber.trim() || null,
    note: form.note.trim() || null,
    receivedOn: form.receivedOn,
    items: form.lines.map((line) => ({ productId: line.productId, quantity: line.quantity })),
  };
}
