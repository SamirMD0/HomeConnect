# Existing idempotency pattern and supplier reuse plan

**Investigated:** 2026-08-26  
**Baseline commit:** `8fa5cd80ba0253f4278f1ee8f17f64e7640eb6e2`  
**Prompt:** Phase 1, Prompt 07  
**Change type:** Investigation only; no application code changed

## Executive finding

Payment idempotency is a client-key plus database-uniqueness pattern:

1. The frontend creates one random key for the mounted payment form and sends the same key on every retry.
2. The backend trims and validates that key before entering a serializable transaction.
3. Inside the transaction it looks up a globally unique `Payment.idempotencyKey`.
4. If a payment exists, the service reconstructs a fingerprint from the stored payment and another from the incoming command.
5. Equal fingerprints return the current debt result without another write. Unequal fingerprints raise an HTTP 409 conflict.
6. If no payment exists, the normal write path stores the key on the new payment. The nullable key preserves old callers that do not send one; the unique index is the final duplicate-write guard.

The fingerprint is not stored. It is recomputed from selected persisted fields. It is therefore a fingerprint of the command's financial identity, not every request field: debt-payment `reference` and `notes` are not included.

## 1. `financial/infrastructure/idempotency.ts`

Source: `backend/src/features/financial/infrastructure/idempotency.ts:1-56`.

### Exported functions

#### `normalizeIdempotencyKey`

```ts
export function normalizeIdempotencyKey(key: string | null | undefined): string | null {
  const normalized = key?.trim();
  if (!normalized) return null;

  if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
    throw new PaymentIdempotencyConflictError(
      'Idempotency key must be 8 to 128 safe ASCII characters'
    );
  }

  return normalized;
}
```

Purpose and behavior:

- Trims a supplied key.
- Treats `undefined`, `null`, an empty string, or whitespace-only input as no key and returns `null`.
- Accepts only 8–128 characters from `[A-Za-z0-9._:-]`.
- Throws `PaymentIdempotencyConflictError` for a nonblank invalid key. That error is HTTP 409 with code `PAYMENT_IDEMPOTENCY_CONFLICT` (`backend/src/features/financial/domain/financial-errors.ts:45-49`).

The Zod payment validator only trims and limits the field to 128 characters. The service helper owns the minimum length and safe-character rule.

#### `createIdempotencyFingerprint`

```ts
export function createIdempotencyFingerprint(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}
```

Purpose and behavior:

- Converts the selected payload to a deterministic string with the private `stableStringify` helper.
- Hashes that string with SHA-256 and returns a lowercase hexadecimal digest.
- `stableStringify` recursively sorts object keys, including keys of nested objects, so object property insertion order does not affect the digest.
- Array order is preserved. Array callers must sort first if line order is not semantically meaningful.
- Primitive values use normal `JSON.stringify` semantics.

This helper hashes whatever its caller supplies. It does not choose fields, normalize money/dates, or remove secrets itself.

#### `assertIdempotentReplay`

```ts
export function assertIdempotentReplay(input: {
  existingFingerprint: string;
  incomingFingerprint: string;
}): void {
  if (input.existingFingerprint !== input.incomingFingerprint) {
    throw new PaymentIdempotencyConflictError();
  }
}
```

Purpose and behavior:

- Allows a replay only when the stored-record fingerprint and incoming-command fingerprint are identical.
- A mismatch throws `PaymentIdempotencyConflictError` with the default message `Idempotency key was already used for a different request`, HTTP status 409, and error code `PAYMENT_IDEMPOTENCY_CONFLICT`.
- A match returns `void`; the service decides which existing result to return.

### Exported interfaces

`IdempotencyLookupResult<TResult>` describes a `{ fingerprint, result }` pair, and `IdempotencyRepositoryContract<TResult>` describes a `findByKey` lookup returning that pair or `null`. Neither interface has runtime behavior. The debt repository does not implement this generic interface directly; its concrete lookup returns a Prisma `Payment` with allocations, and the service constructs the fingerprint.

## 2. Database constraint

`Payment` declares:

```prisma
idempotencyKey String? @unique
```

Source: `backend/prisma/schema.prisma:584-605`, specifically line 593.

The original financial-domain migration creates the corresponding unique index:

```sql
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");
```

Source: `backend/prisma/migrations/20260724090000_add_financial_domain_models/migration.sql:151`.

Consequences:

- A non-null key identifies at most one payment across the entire `payments` table, not merely within one debt or customer.
- The nullable column permits legacy/no-key writes. PostgreSQL's normal unique-index behavior permits multiple `NULL` values.
- The service lookup gives friendly replay behavior before writing; the database constraint remains the authoritative race-safety boundary.
- `runFinancialTransaction` uses Prisma `Serializable` isolation and retries Prisma `P2034` transaction conflicts up to two times (`backend/src/features/financial/infrastructure/transaction.ts:11-48`). It does not classify a `P2002` unique violation as retryable.

## 3. Debt-payment replay path

`DebtsService.recordDebtPayment` is at `backend/src/features/financial/debts/debts.service.ts:365-455`.

Before the transaction it:

1. Parses and validates positive money.
2. Parses the business date.
3. Calls `normalizeIdempotencyKey(input.idempotencyKey)`.

Inside `runFinancialTransaction` it first loads the requested debt. When a normalized key exists, it calls:

```ts
const existingPayment = await DebtsRepository.findPaymentByIdempotencyKey(tx, idempotencyKey);
```

The repository implementation (`backend/src/features/financial/debts/debts.repository.ts:257-269`) is a `payment.findUnique({ where: { idempotencyKey }, include: { allocations: true } })`. The lookup therefore uses the unique key and returns the payment plus every allocation needed to identify its target.

When a record is found, the service finds an allocation satisfying both:

```ts
allocation.debtId === debtId && allocation.installmentId === null
```

It then compares the stored-record and incoming fingerprints. An exact match performs no new payment, allocation, debt-status update, or audit write. Instead it reloads the debt within the same transaction and returns:

```ts
return this.toDebtView(refreshedDebt);
```

The replay response is therefore a freshly calculated current `DebtView`. It is not the `Payment` row, and it is not a byte-for-byte snapshot of the first HTTP response. The existing payment remains the one and only financial event.

The replay check happens before the cancelled/already-paid checks. Consequently, a valid retry can still retrieve the debt result after the first request made the debt fully paid.

If the key is absent or not found, the service continues through normal eligibility and allocation checks, creates a `Payment` carrying the normalized key, creates its allocation, refreshes the debt, updates its calculated status, writes the audit, and returns the debt view.

## 4. Exact debt-payment fingerprint

For the existing payment, `recordDebtPayment` hashes:

```ts
{
  debtId: debtAllocation?.debtId ?? null,
  amount: moneyToApiString(existingPayment.totalAmount),
  paymentDate: prismaDateToBusinessDate(existingPayment.paymentDate),
  paymentMethod: existingPayment.paymentMethod,
  idempotencyKey: existingPayment.idempotencyKey,
  createdById: existingPayment.createdById,
}
```

For the incoming request, it hashes the same shape:

```ts
{
  debtId,
  amount: moneyToApiString(amount),
  paymentDate,
  paymentMethod: input.paymentMethod,
  idempotencyKey,
  createdById: user.userId,
}
```

Source: `backend/src/features/financial/debts/debts.service.ts:381-402`.

Normalization before hashing is significant: amount is the canonical two-decimal API string and the date is the canonical business-date string. The fingerprint binds the key to the debt, amount, payment date, method, and creating user.

It deliberately does **not** hash `reference` or `notes`, even though those fields are stored on a new payment. A replay that changes only either of those fields is treated as the same financial request and returns the existing debt; it does not update the original payment metadata.

If a globally reused key belongs to another debt, there is no matching debt allocation, so the existing fingerprint uses `debtId: null`; that differs from the requested debt id and causes a conflict. A different amount, date, method, user, or key likewise causes `assertIdempotentReplay` to throw the 409 conflict.

## 5. Frontend key lifecycle

The generator is `frontend/src/features/customer-financial/utils/idempotency-key.ts:1-4`:

```ts
export function createClientIdempotencyKey(prefix: string): string {
  const random = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}
```

It prefers `crypto.randomUUID()` and has a timestamp/random fallback. Both payment forms keep the generated value in a React ref. The debt form says (`frontend/src/features/customer-financial/components/RecordDebtPaymentDialog.tsx:42,67-76`):

```ts
const idempotencyKeyRef = useRef(createClientIdempotencyKey('debt-payment'));

await recordPayment.mutateAsync({
  // ...payment fields...
  idempotencyKey: idempotencyKeyRef.current,
});
idempotencyKeyRef.current = createClientIdempotencyKey('debt-payment');
onSuccess();
```

The installment-plan form is identical with the `plan-payment` prefix (`RecordPlanPaymentDialog.tsx:51,76-85`).

The key used by requests is generated once per mounted form/component instance, **not once per submit**:

- Every submit reads the same `idempotencyKeyRef.current`.
- A failed or ambiguous request stays in the `catch` path and does not replace the ref, so the next retry reuses the key.
- Only a successful `mutateAsync` replaces the key, immediately before `onSuccess` closes/advances the form.
- On a later remount, the ref begins with a new key.

React evaluates the expression passed to `useRef(...)` during renders, so the helper may produce unused values on rerenders; React preserves the original `.current`. This does not change the request-key behavior, but a lazy state initializer would avoid producing those discarded values.

## 6. Existing helper/transaction tests

`backend/src/features/financial/infrastructure/idempotency-transaction.test.ts` contains seven unit tests in two groups.

### `idempotency helpers`

1. **Normalizes valid keys and treats blank keys as absent**: verifies surrounding whitespace is removed and whitespace/`undefined` become `null`.
2. **Rejects invalid keys**: verifies a too-short key and a key containing spaces throw `PaymentIdempotencyConflictError`.
3. **Creates stable fingerprints independent of object key order**: hashes two nested objects with different property order and expects equal digests.
4. **Allows same-key same-request replay and rejects same-key different-request conflicts**: equal amount fingerprints do not throw; changing `10.00` to `11.00` throws the conflict error.

### `transaction retry helper`

5. **Retries retryable transaction errors up to success**: one retryable failure followed by success calls the operation twice and resolves `ok`.
6. **Stops at the maximum retry limit**: with `maxRetries: 1`, two retryable failures result in rejection and exactly two calls.
7. **Does not retry non-retryable errors**: a fatal error is thrown after one call even when the maximum is three retries.

These are pure unit tests. They prove helper determinism, mismatch behavior, and generic retry-loop limits; they do not themselves use Prisma or prove a concurrent database race. Debt service unit tests cover exact/conflicting replay (`backend/src/features/financial/debts/debts.service.test.ts:440-477`), and the debt database suite covers persistence-level payment idempotency (`debts-db.integration.test.ts:41-148`).

## 7. Minimum supplier changes for Prompt 08

No code was changed for this investigation. The following is the smallest coherent change set that reuses the existing mechanism rather than introducing receipt-number deduplication or a second idempotency system.

### A. Schema and migration

Add a nullable unique key to each root write model:

```prisma
model SupplierTransaction {
  idempotencyKey String? @unique
}

model SupplierReceiving {
  idempotencyKey String? @unique
}
```

The migration should only add the two nullable columns and their unique indexes, with no backfill. Existing records remain valid with `NULL`. Do not add uniqueness to `(supplierId, receiptNumber)`; receipt reuse is explicitly legitimate.

For a composite supplier purchase:

- Store the request key on the root payable `SupplierTransaction`.
- When it creates stock, also store the same request key on its `SupplierReceiving`. The identical text is allowed because uniqueness is per table.
- Do **not** put that same key on the optional settled-amount `SUPPLIER_PAYMENT` row: it is a second row in `supplier_transactions` and would violate the root row's unique constraint. Leave that child row's key null; the purchase transaction and root key protect the whole composite command.

### B. Request contracts

Add optional/nullable `idempotencyKey` to both backend create validators and inferred input types, mirroring the payment validator's trim/max-128 boundary and leaving final safe-character validation to `normalizeIdempotencyKey`.

Add the field to the matching frontend create-input types and pass it unchanged through the existing API wrappers. No route or controller protocol change beyond the validated body is required.

### C. Repository lookups and result shape

Add transaction-scoped `findByIdempotencyKey` methods:

- `SupplierPurchasesRepository.findByIdempotencyKey(tx, key)` should query the unique `SupplierTransaction` key and include the same supplier, receiving, and ordered purchase-line graph used by `findById`, so an exact replay can return `serializePurchase(existing)`.
- `SupplierReceivingsRepository.findByIdempotencyKey(tx, key)` should query the unique `SupplierReceiving` key with `detailInclude`, so an exact replay can return `serializeReceiving(existing)`.

Both lookups and replay returns must remain inside the same serializable transaction as the create path.

### D. Service structure

Mirror `recordDebtPayment` in both public create services:

1. Normalize the key before opening the transaction.
2. Normalize/canonicalize the other inputs before fingerprinting.
3. Inside the transaction, look up by key before any product creation, stock movement, payable/payment creation, purchase-line creation, or audit write.
4. If found, construct stored and incoming fingerprints with the same field names and canonical formats; call `assertIdempotentReplay`.
5. On a match, return the existing serialized `SupplierPurchase` or `SupplierReceiving` immediately.
6. On a mismatch, let the shared helper raise the existing 409 conflict.
7. If not found, run the current create path and persist the normalized key.
8. If no key was supplied, preserve today's behavior unchanged.

`postSupplierReceiving` needs an optional normalized key in `PostReceivingInput` so both its standalone caller and the purchase orchestrator can persist the key on the receiving row. The replay lookup belongs in the two public command services; the low-level writer should continue to perform one write when called.

The current helper is coupled to `PaymentIdempotencyConflictError`. The literal minimum is to reuse it, which preserves status 409 and code `PAYMENT_IDEMPOTENCY_CONFLICT`. If the name/code is generalized, it should be one central rename/compatibility change—not a separate supplier-only helper or algorithm.

### E. Fingerprint payloads

Use semantic, canonical, persisted business fields, following the debt-payment rule that credentials, request metadata, generated ids, timestamps, and nonessential mutable text do not define command identity.

For standalone receiving, the minimum reconstructable fingerprint is:

```ts
{
  supplierId,
  receivedOn,
  items: [...items]
    .sort((a, b) => a.productId.localeCompare(b.productId))
    .map(({ productId, quantity }) => ({ productId, quantity })),
  idempotencyKey,
  receivedById: user.userId,
}
```

Sorting is required because `stableStringify` preserves array order while `postSupplierReceiving` already treats item order as irrelevant and sorts by product id. As with payment `reference`/`notes`, omit receiving `referenceNumber` and `note` if the goal is exact reuse of the existing semantic pattern; they are editable metadata and changing them on a replay must not mutate the posted document.

For a supplier purchase, bind at minimum:

- supplier id and creating user id;
- normalized idempotency key;
- canonical business date;
- effective canonical payable amount;
- canonical paid amount;
- whether stock was received;
- ordered purchase-line financial/stock identity (kind, product identity where one already exists, quantity, canonical unit price/line total, and manual description).

Do not hash `accountPassword`, request id, IP address, generated database ids, created timestamps, current stock balances, or audit data. A credential can change between retries without changing the purchase, and generated/current values cannot be reproduced before a replay lookup.

There is one supplier-specific caveat that Prompt 08 must handle deliberately: `NEW_PRODUCT` is converted to stored `PRODUCT`, and its product id/SKU are generated during the first request. The raw line therefore cannot be reconstructed exactly from `SupplierPurchaseLine` alone before side effects. The minimal safe choices are either:

1. Define and test a semantic line fingerprint using only values reproducible from both the incoming line and the persisted purchase/product graph, expanding the repository selection where necessary; or
2. Persist the creation-time request fingerprint on the root record, which is more exact for quick-add payloads but adds a column beyond the payment schema pattern.

The first choice is closer to the existing payment implementation and the stated “reuse exactly” constraint. It must not resolve a quick-add by creating/searching a product before the idempotency lookup, because that would allow replay side effects before the guard.

### F. Frontend lifecycle

Reuse the existing client generator from a shared location. Each supplier create form should own a ref initialized when that form instance begins:

```ts
const idempotencyKeyRef = useRef(createClientIdempotencyKey('supplier-purchase'));
```

and similarly `supplier-receiving`. Submit must send `idempotencyKeyRef.current`. Errors must leave it unchanged. Generate a replacement only after a confirmed success/reset, or let navigation/unmount create the next form instance's key.

`SupplierPurchaseFormDialog` remains mounted while `open` changes and its `close()` resets local fields. Its key must therefore be rotated in that same successful/reset lifecycle; mount alone is not equivalent to each time this modal is opened. `SupplierReceivingForm` navigates away after success, so unmounting naturally ends that key's lifecycle.

### G. Tests needed

Extend the existing supplier purchase and receiving database integration suites to establish:

- same key and same payload produces exactly one root record and one stock increase;
- same key with a changed fingerprint field produces the 409 conflict;
- no key still creates normally;
- two concurrent identical submissions cannot create duplicate effects (the database unique index is what closes the race);
- a replay returns the original record id;
- for a composite purchase, there is exactly one payable, at most one settled-payment child, one receiving, one set of stock movements, and one set of purchase lines/audits;
- a failed frontend retry reuses the key and a successful reset/new form uses a new one.

## Conclusion

The reusable mechanism is already small and sound: normalize one client-generated key, enforce it with a nullable unique index, look it up inside the serializable transaction, compare canonical fingerprints, and return the existing domain view before any write. Supplier purchases need the guard at the composite command boundary so one key protects payable, payment, receiving, inventory, lines, and audits together; standalone receiving needs the same guard around its stock-writing transaction.
