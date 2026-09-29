# Supplier purchase transaction trace

**Investigated:** 2026-08-26  
**Baseline commit:** `8fa5cd80ba0253f4278f1ee8f17f64e7640eb6e2`  
**Prompt:** Phase 1, Prompt 06  
**Change type:** Investigation only; no application code changed

## Executive finding

A supplier purchase is **atomic but not idempotent**.

The backend deliberately posts the supplier bill, optional payment, optional stock receipt, stock movements, purchase lines, and audit records inside one serializable Prisma transaction. A failure rolls the entire command back, so the normal path cannot leave a payable without its lines or a half-applied stock receipt.

That atomicity does not identify a retried client request. The payload has no idempotency key, `SupplierTransaction` has no idempotency column or unique request constraint, and receipt numbers are deliberately non-unique. If the first request commits but its response is lost, submitting the same form again creates another valid purchase. For an unpaid purchase with stock receipt enabled, that means a second full payable and a second stock increase.

## 1. Frontend form and submit path

### Entry point

The supplier profile shows **Add Purchase** only when the signed-in user is an ADMIN and the supplier is active (`frontend/src/pages/suppliers/SupplierProfilePage.tsx:25-27,67`). It opens `SupplierPurchaseFormDialog` at lines 37 and 71.

The dialog explicitly treats the bill and receipt as one command:

> “The server turns it into a receiving document and a supplier debt in a single transaction — this dialog never posts the two halves separately.”

Source: `frontend/src/features/suppliers/components/SupplierPurchaseFormDialog.tsx:40-44`.

### Submit sequence

`SupplierPurchaseFormDialog.submit` (`SupplierPurchaseFormDialog.tsx:92-117`):

1. Calls `preventDefault()`.
2. Refuses locally invalid lines, totals, partial payments, and quick-add inputs through `blocker` (`:74-87`).
3. Calls `create.mutateAsync` once with the supplier id and assembled purchase payload (`:96-112`).
4. On a received success response, resets and closes the form (`:113`).
5. On an error, displays the normalized error and leaves the form available for correction or retry (`:114-116`).

`useCreateSupplierPurchase` delegates to `supplierPurchasesApi.create` (`frontend/src/features/suppliers/hooks/useSupplierPurchases.ts:49-65`). The API wrapper performs:

```ts
api.post(`/suppliers/${supplierId}/purchases`, input)
```

Source: `frontend/src/features/suppliers/api/supplier-purchases.api.ts:12-13`.

After success, React Query invalidates the purchase, supplier, supplier-ledger, receiving, inventory, and product caches (`useSupplierPurchases.ts:54-63`). Cache refreshes happen after the server response; they are not part of the database transaction.

### Current double-submit protection

The submit button is disabled while `create.isPending` or while the form has a validation blocker (`SupplierPurchaseFormDialog.tsx:268-272`). This prevents ordinary repeated clicks after React Query has put the mutation into its pending state.

It is only a UI guard:

- There is no synchronous submission latch independent of `isPending`.
- There is no client-generated request/idempotency key.
- `useMutation` sends the payload as supplied; its mutation function contains no deduplication logic.
- A network failure returns the mutation to a retryable UI state while preserving the form.
- The Axios layer may retry once after a 401 only after refreshing authentication (`frontend/src/services/api.ts:70-91`), but a 401 is rejected before the purchase handler writes anything. It does not solve an ambiguous lost response after a commit.

There is an advisory receipt-number API and `useReceiptCheck` hook (`useSupplierPurchases.ts:31-42`), but repository-wide search finds **no component calling `useReceiptCheck`**. More importantly, both the frontend API comment and backend service say that this lookup never blocks saving. Receipt numbers cannot be an idempotency mechanism.

## 2. Route, authentication, validation, and role checks

### Mounted route

`backend/src/app.ts:110` mounts `supplierPurchasesRoutes` at `/api/v1/suppliers` behind `requireAuth`. The create endpoint is therefore:

```text
POST /api/v1/suppliers/:supplierId/purchases
```

The route order is (`backend/src/features/suppliers/purchases/supplier-purchases.routes.ts:12-14`):

1. `requireAuth` from the app mount: valid JWT plus active, non-deleted user.
2. `requireSupplierAdmin`: ADMIN role required.
3. Validate `supplierId` as a database UUID.
4. Validate the body with `createSupplierPurchaseSchema`.
5. Call `SupplierPurchasesController.create`.

The controller adds request id/IP context and calls `SupplierPurchasesService.create`, returning 201 on success (`supplier-purchases.controller.ts:5-14`).

The service repeats the ADMIN assertion before opening the transaction (`supplier-purchases.service.ts:47-56`). This defense-in-depth check prevents a direct/internal service call from bypassing the route policy.

### Important validator guarantees

`createSupplierPurchaseSchema` (`supplier-purchases.validator.ts:61-124`) is strict and ensures:

- the purchase date is a valid non-future business date;
- at least one and at most 100 lines;
- product quantities are whole numbers from 1 through the inventory limit;
- each existing product appears only once;
- line modes are a discriminated union, preventing product fields on manual lines and missing product fields on product lines;
- money strings have at most two decimal places and required charges are positive;
- quick-add requires the account password, stock receipt enabled, and today’s date;
- manual total overrides require a reason;
- unknown client fields are rejected.

The service additionally checks that the supplier exists and is active (`supplier-purchases.service.ts:57-59`), verifies the current ADMIN password once if any line quick-adds a product (`:61-70`), rejects missing/non-tracked products when stock receipt is requested (`:84-105`), and prevents a payment greater than the purchase total (`:149-152`).

## 3. Transaction boundary

`SupplierPurchasesService.create` calls `runFinancialTransaction` at `supplier-purchases.service.ts:56`; the callback does not finish until the final purchase record has been read and serialized at `:214-217`.

`runFinancialTransaction` (`backend/src/features/financial/infrastructure/transaction.ts`) uses a Prisma transaction with PostgreSQL `Serializable` isolation. It retries Prisma `P2034` serialization/write-conflict failures up to two times after the first attempt, for at most three transaction attempts.

### Outside `runFinancialTransaction`

- frontend validation, submission, error display, and cache invalidation;
- HTTP authentication and ADMIN route middleware;
- route parameter/body Zod validation;
- controller request-context construction;
- the service’s defense-in-depth `assertSupplierAdmin`;
- normalization of `receiptNumber`;
- the transaction wrapper’s decision to retry a rolled-back `P2034` attempt.

### Inside `runFinancialTransaction`

- all supplier/product/user reads used by the command;
- ADMIN password verification and its database verification log for quick-add;
- quick-added products, opening-balance movements, and service audits;
- receiving header, product quantity changes, receipt movements, and receiving items;
- supplier debt and optional supplier payment transactions;
- every purchase line;
- supplier audit;
- final readback and serialization.

Nothing from a failed transaction attempt persists. Retrying a rolled-back serializable transaction is safe, but this is **database conflict retry**, not client-request idempotency: a later independent HTTP request starts a new valid transaction with no knowledge of the earlier committed one.

## 4. Exact row-write order

The successful write order is conditional on line types, `receiveStock`, and `paidAmount`.

### A. Conditional quick-add setup

Before any purchase row is written, if at least one `NEW_PRODUCT` line exists:

1. One `AdminVerificationLog` SUCCESS row is written by `verifyAdminPassword` (`admin-verification.ts:70-76,102-115`).
2. For each `NEW_PRODUCT` line, in form-line order:
   1. one `Product` row;
   2. one zero-quantity `StockMovement` of type `OPENING_BALANCE`;
   3. one `ServiceAudit` CREATE row.

Sources: `supplier-purchases.service.ts:61-70,84-86,256-311`.

Existing-product and manual lines create no rows during this step. Manual lines never receive stock.

### B. Optional stock receipt

If `receiveStock` is true and at least one resolved product line can receive stock, `postSupplierReceiving` writes (`supplier-receivings.service.ts:53-100`):

1. one `SupplierReceiving` header;
2. for each product line, sorted by product id:
   1. one compare-and-set `Product.stockQuantity` update;
   2. one `StockMovement` with type `PURCHASE_RECEIPT`;
   3. one `SupplierReceivingItem` linking the receiving, product, and movement.

The purchase creation path writes **no `SupplierReceivingAudit` row**. Initial stock receipt history is represented by the immutable receiving/item records and append-only stock movements. `SupplierReceivingAudit` is used by later metadata correction/void operations.

If `receiveStock` is false, or the purchase contains only manual lines, none of these receiving, item, stock-update, or receipt-movement writes occurs.

### C. Financial header, payment, lines, and audit

After optional receiving (`supplier-purchases.service.ts:125-216`):

1. One `SupplierTransaction` debt header:
   - type `SUPPLIER_DEBT`;
   - direction `INCREASE_OWED`;
   - full purchase amount, using `amountOverride` when supplied;
   - linked to the receiving when stock was received.
2. If `paidAmount > 0`, one separate `SupplierTransaction` payment:
   - type `SUPPLIER_PAYMENT`;
   - direction `DECREASE_OWED`;
   - deliberately no receiving link.
3. One `SupplierPurchaseLine` per resolved form line, in original form order. A stock-receiving product line links to the exact `SupplierReceivingItem` that moved its stock.
4. One `SupplierAudit` CREATE row for the debt/purchase, including line sum, posted amount, override details, receiving id, line counts, quick-add count, paid amount, and remaining owed.
5. A read-only fetch of the assembled purchase record for the response.

The `SupplierPurchaseLine.receivingItemId @unique` and `SupplierTransaction.supplierReceivingId @unique` constraints prove a single purchase line/header cannot point to multiple stock receipts. They do not detect two HTTP requests, because a duplicate request creates new transaction, line, receiving, item, and movement ids.

## 5. Where and how stock changes

All received stock goes through `postSupplierReceiving`; the purchase service does not write product quantity itself (`supplier-purchases.service.ts:37-44,108-123`).

For concurrency, `postSupplierReceiving`:

1. sorts lines by product id so concurrent receipts lock products in a consistent order (`supplier-receivings.service.ts:62-65`);
2. validates the product, stock tracking, opening balance, receiving date, and quantity bounds (`:352-376`);
3. reads the current product immediately before the write (`:77-80`);
4. calculates `quantityAfter` with overflow protection;
5. performs compare-and-set through `InventoryRepository.compareAndSetQuantity`:

```ts
tx.product.updateMany({
  where: { id: productId, trackStock: true, stockQuantity: quantityBefore },
  data: { stockQuantity: quantityAfter },
});
```

Source: `backend/src/features/inventory/inventory.repository.ts:177-186`.

If exactly one row is not updated, the service raises HTTP 409 `STOCK_CHANGED` (`supplier-receivings.service.ts:79-82`). Because this is inside the financial transaction, the receiving header and every earlier line in that attempt roll back too. The CAS prevents a lost update; it does not mean “this business purchase was already handled.”

## 6. Duplicate request behavior

There is no `idempotencyKey` in the supplier purchase input, `SupplierTransaction`, `SupplierReceiving`, or related repository methods. Repository search finds the only schema `idempotencyKey` on `Payment`, not on supplier records (`backend/prisma/schema.prisma:593`).

`receiptNumber` is intentionally not unique. The schema explains that suppliers reuse/reissue numbers and duplicates should only produce a warning (`schema.prisma:1202-1205`). The database has a lookup index, not a uniqueness constraint (`:1225-1231`).

Therefore two sequential identical POSTs both normally succeed:

- two `SUPPLIER_DEBT` transactions are created;
- two sets of `SupplierPurchaseLine` rows are created;
- if money was paid now, two `SUPPLIER_PAYMENT` transactions are created;
- if stock receipt is enabled, two receiving headers, two receiving-item sets, and two `PURCHASE_RECEIPT` movement sets are created, and product stock increases twice;
- two supplier CREATE audits are created;
- quick-added products add special edge cases: a repeated unique barcode normally conflicts and rolls back the second request, while a quick-add without a barcode can create a second catalog product.

Two requests that overlap may produce either a 409/serialization conflict for one attempt or two eventual successes. A `P2034` can cause the transaction wrapper to retry the second command after the first commits; on the retry it sees the new stock quantity and can validly add the same quantity again. CAS protects consistency, not exactly-once command execution.

## 7. Direct answer: response lost, then user submits again

Assume the first request reached the server and committed, but the network dropped before the success response reached the browser. The mutation reports an error, the form remains open, `isPending` returns to false, and the user clicks **Save purchase** again.

The second POST has no key tying it to the first. It is treated as a new purchase.

- **Unpaid, receiveStock=true:** the database ends with two full supplier debts and two stock receipts. Supplier outstanding and product quantity both increase twice.
- **Partially paid, receiveStock=true:** two full debts and two matching partial-payment rows are recorded. Net supplier outstanding increases twice by `(purchase total - paid amount)`, and stock increases twice.
- **Paid in full, receiveStock=true:** two full debts and two offsetting payment rows are recorded, so net outstanding remains zero, but the ledger contains duplicate bill/payment history and stock still increases twice.
- **receiveStock=false:** the duplicate financial rows and purchase lines are created, but there is no stock movement from either request.
- **Manual lines:** their values duplicate the payable but never affect stock.

If the first request never committed, only the retry remains. The dangerous ambiguity is precisely that the client cannot distinguish “did not commit” from “committed but response was lost.” The current system has atomic rollback but no replay recognition, so it cannot safely answer that ambiguity.

## Conclusion

The supplier purchase transaction is internally well-composed: role checks are layered, validation is strict, balances remain derived, received stock has append-only movement evidence, CAS prevents lost updates, and all component writes share one serializable transaction.

The missing control is request idempotency. The minimum next investigation is to reuse the existing payment idempotency pattern so the same form instance sends the same key across retries and the backend returns the original purchase for an exact replay while rejecting a changed payload under the same key.
