# Prompt 06 — Atomic sales return and refund design

Date: 2026-09-11

Branch: `upgrade/phase-02-operations`

Status: **OWNER APPROVED — implementation in progress**

Rounding amendment approved by the owner on 2026-09-14. This supersedes the independent component allocation/conversion rule below; all other approved policies remain unchanged.

Prerequisite reviewed: `RETURN_TRACE.md`

## Confirmed owner policy

1. Partial returns are required. A return selects one or more original order lines and a positive quantity from each.
2. The refundable portion supports either `CASH_OUT` or `STORE_CREDIT`. The selected destination is explicit and audited.
3. Every returned line has one condition-based disposition:
   - `SELLABLE`: add it to normal available stock;
   - `DAMAGED`: track it separately and do not make it available for normal sale;
   - `QUARANTINE`: track it separately pending inspection and do not make it available for normal sale.
4. The normal return window is 14 days from the sale date. The value is configurable in Business Settings. An admin may override an expired window only with an explicit override reason recorded in the audit trail.
5. Original sales remain immutable in reporting. A return is a separate negative transaction. Reports expose gross sales, returns/refunds, and `net sales = gross sales - returns`.
6. Cumulative returned quantity can never exceed original sold quantity.
7. Each return preserves the original sale reference, item and quantity, original price, VAT snapshot, currency/rate, refund method, disposition, actor, reason, and timestamp.
8. Discarding or otherwise removing damaged stock is not a return disposition. That will be a later, separate inventory disposition/write-off event.

## Design decisions included for approval

The five required questions do not determine three edge policies. This design makes them explicit so approval is unambiguous:

1. **Return value relieves the same sale's outstanding receivable first.** Any excess is the refundable portion sent to cash-out or store credit. A customer is not paid cash while still owing money on the returned value from that sale.
2. **One residual refund destination per return document.** `CASH_OUT` and `STORE_CREDIT` cannot be mixed on one return. If the entire return value is used as receivable relief, the method is `NONE` and no cash/credit record is created.
3. **Delivery is not silently refunded.** The request has an explicit `returnDeliveryFee` choice, defaulting to false. The original delivery fee may be returned at most once across all returns for the order. When selected, its stored tax treatment/rate/code and VAT amounts are reversed exactly. It need not wait for the final merchandise return.
4. **Store credit is issued and held in the original transaction currency.** Initial redemption is same-currency only. Cross-currency redemption is deferred until an explicit FX policy is approved; no current rate is guessed.

Approval of this document approves these policies as well. They must be revised here before implementation if the owner wants different behavior.

## Core invariants

The implementation must make the following statements true by construction:

- **RET-01:** for every sales-order item, `sum(posted returned quantities) <= original quantity`.
- **RET-02:** one idempotency key represents one immutable request fingerprint and at most one posted return.
- **RET-03:** `return total inc VAT = receivable relief + cash refund + store credit issued` in transaction currency and in base currency.
- **RET-04:** exactly one of cash refund or store-credit issue may be positive on a return; neither exists when refundable amount is zero.
- **RET-05:** return VAT is allocated only from stored original VAT snapshots; current product price, tax profile, VAT rate, and exchange rate are never read for valuation.
- **RET-06:** only `SELLABLE` quantity changes `Product.stockQuantity`; `DAMAGED` and `QUARANTINE` quantities are still traceable but never enter normal available stock.
- **RET-07:** every sellable stock increase has exactly one linked append-only stock movement, and retries cannot create another.
- **RET-08:** stock, receivable relief, refund/credit, order state, and audit either all commit or all roll back.
- **RET-09:** original `SalesOrder`, item price/VAT snapshots, payments, and payment allocations are not deleted, voided, or rewritten merely because goods were returned.
- **RET-10:** gross sales are unchanged by returns; return value is a separately dated negative transaction; net sales is their difference.
- **RET-11:** customer receivable balances and store-credit availability are derived from immutable source/allocation rows, never stored as mutable balance columns (ADR-02).
- **RET-12:** an expired-window override is impossible without both an explicit override flag and a non-empty override reason captured with the actor and timestamp.

## State machine

Add `PARTIALLY_RETURNED` to `SalesOrderFulfillmentStatus`.

```text
DELIVERED
  ├─ return less than all remaining item quantity ─> PARTIALLY_RETURNED
  └─ return all remaining item quantity ──────────> RETURNED

PARTIALLY_RETURNED
  ├─ another partial return ──────────────────────> PARTIALLY_RETURNED
  └─ return all remaining item quantity ──────────> RETURNED

RETURNED ──> no further return
```

Rules:

- `DRAFT`, `CONFIRMED`, `PREPARING`, `READY_FOR_DELIVERY`, `OUT_FOR_DELIVERY`, and `CANCELLED` are not returnable.
- `PARTIALLY_RETURNED` is returnable because it proves the order was delivered and still has unreturned quantity.
- Full/partial state depends only on cumulative returned item quantity, not whether delivery was refunded.
- A posted return is immutable. Correcting a mistaken return requires a future dedicated return-reversal workflow; editing/deleting it is forbidden.
- The existing generic Restore action must reject `RETURNED` or `PARTIALLY_RETURNED` orders that have posted return records. Reopening such an order without reversing its stock and financial records would be corrupt.
- The old standalone financial Unlink and stock Restore actions must reject return-managed financial allocations/fulfillments. They remain available for unrelated legacy corrections and cancellation workflows, but cannot dismantle a posted return.

## Return value and settlement policy

### Snapshot calculation for partial quantities

Every value comes from the original `SalesOrderItem` and order delivery snapshots.

The original immutable `lineTotalIncVat` is authoritative. Allocate gross total, VAT, and discount using cumulative minor units, **not subtotal independently**:

```text
target cumulative component
  = round(original component × cumulative returned quantity / sold quantity)

this return's component
  = target cumulative component - component already returned
```

Use currency precision (USD two decimals, LBP whole units) and deterministic `ROUND_HALF_UP`. The final remaining return receives the exact original amount less all prior allocations. Derive `returnedSubtotal = returnedTotal - returnedVat`. Thus every return satisfies subtotal + VAT = total, and any sequence returning the full original quantity reverses gross, VAT, and subtotal exactly. Multi-unit requests and mixed line/request ordering use the same per-original-line cumulative history.

Example: two $50 VAT-inclusive units at 11% snapshot $90.09 subtotal + $9.91 VAT = $100.00. The first unit returns $50.00 gross, $4.96 VAT, and **$45.04 derived subtotal**. The final unit returns $50.00 gross, $4.95 VAT, and $45.05 subtotal. The sequence reverses the original snapshots exactly with zero residual rounding drift.

The line copies the original unit price, tax rate/code, product identity snapshots, and order currency/rate for display and provenance. It stores this return's derived subtotal and allocated VAT/gross values. No current product price, VAT configuration, or exchange rate is used.

Apply the same cumulative policy to base currency: allocate original base gross and base VAT, then derive base subtotal as their difference. Never convert each partial return separately. The existing sale-line schema stores `baseLineTotal` (original **ex-VAT** base subtotal), but has no separate base VAT/gross columns. For those missing anchors only, convert the **full original VAT snapshot once** using the immutable original exchange rate and USD half-up precision, and define original base gross as stored `baseLineTotal` + that full-original base VAT. Allocate against these fixed original anchors and subtract prior stored return base allocations. This preserves the stored original base subtotal and exactly reverses the full-original VAT conversion; it does not fabricate historical columns or use current rates. A future sales schema with explicit base VAT/gross snapshots must use those stored anchors directly.

Reject inconsistent original snapshots; do not confuse expected partial-rounding remainders with corrupt historical values. Original and returned subtotal/VAT/gross must remain non-negative and coherent.

If `returnDeliveryFee` is true, use the stored delivery ex-VAT, VAT, inc-VAT, treatment, rate, and code. Cumulative delivery return is constrained to the original delivery snapshot and normally occurs once.

### Receivable first, then refund/credit

Within the transaction, derive the linked order obligation's current outstanding from non-voided payment allocations and prior return-credit allocations.

```text
receivable relief = min(this return total, current order-linked outstanding)
refundable amount = this return total - receivable relief
```

Examples:

| Situation | Return value | Current linked outstanding | Receivable relief | Customer destination |
|---|---:|---:|---:|---:|
| $1,000 sale, $500 paid at sale, $500 debt; full return | $1,000 | $500 | $500 | $500 cash or store credit |
| Same sale; $300 partial return | $300 | $500 | $300 | $0 (`NONE`) |
| Same sale; $700 partial return | $700 | $500 | $500 | $200 cash or store credit |
| Fully paid sale; $250 return | $250 | $0 | $0 | $250 cash or store credit |

Do not void legitimate payments. A payment remains historical evidence that money came in. A cash refund is the separate evidence that money went out; a store-credit issue is the separate liability. Payment voiding remains only for correcting an erroneous payment.

Return-credit allocations reduce the target debt/installment balance alongside payment allocations. They are not payments and must be displayed as return credits. For installment plans, allocate relief deterministically to open installments by due date, then installment number, then ID. Recompute affected stored status projections inside the same transaction.

`SalesOrder.paidAmount`, `remainingAmount`, and `paymentStatus` remain original sales snapshots. Current order receivable, returned total, refunded total, and remaining returnable quantities are derived for the UI from the linked transactions.

## Schema design

Names below are normative unless implementation discovers a database-name collision and stops for review.

### Enum changes

- `SalesOrderFulfillmentStatus`: add `PARTIALLY_RETURNED`.
- `SalesReturnStockDisposition`: `SELLABLE`, `DAMAGED`, `QUARANTINE`.
- `SalesReturnRefundMethod`: `NONE`, `CASH_OUT`, `STORE_CREDIT`.
- `StockMovementType`: add `SALE_RETURN_SELLABLE` so a return cannot be confused with legacy cancellation restoration.
- `SalesAuditAction`: keep `RETURN` for the atomic operation; add no second competing “return” action.

### `BusinessSettings`

Add `returnWindowDays Int @default(14)` with application and database checks allowing a sensible configured range (proposed `1..365`). The migration must ensure the `primary` singleton row exists with the initial value 14, so the return service never relies on a hidden runtime constant. The Settings UI and API expose it to admins.

The return reads the current configured value inside its transaction and stores `windowDaysSnapshot` and `returnDeadlineSnapshot` on the return. A later setting change does not rewrite a posted return. It may change eligibility for an order that has not yet been returned; that is the effect of changing the current business policy.

Use business dates in the configured business timezone. The deadline is inclusive: with a 14-day setting, a sale dated September 1 may be returned through September 15; September 16 requires the audited override. The return date is the server-derived processing business date and cannot be backdated by the client.

### `SalesReturn` — immutable return/credit-note header

Required fields:

- `id` UUID primary key;
- `returnNumber` unique display reference, allocated as `<orderNumber>-R<sequence>`;
- `salesOrderId` with `onDelete: Restrict`;
- `sequence` and unique `(salesOrderId, sequence)`;
- `customerId` nullable only because the existing sales model permits an anonymous fully paid sale; `STORE_CREDIT` requires it;
- `returnDate` business date and `processedAt` timestamp;
- `reason`;
- `windowDaysSnapshot`, `returnDeadlineSnapshot`, `windowOverride`, nullable `windowOverrideReason`;
- `currency`, `exchangeRate` copied from the original sale;
- `subtotalExVat`, `vatAmount`, `totalIncVat`;
- `baseSubtotalExVat`, `baseVatAmount`, `baseTotalIncVat`;
- delivery reversal snapshot fields: ex-VAT, VAT, inc-VAT, treatment, rate, and code;
- `receivableReliefAmount`, `baseReceivableReliefAmount`;
- `refundableAmount`, `baseRefundableAmount`;
- `refundMethod`;
- `idempotencyKey @unique` and `requestFingerprint`;
- `processedById` plus immutable actor name/username snapshots;
- `createdAt`.

Store return amounts as non-negative magnitudes. Reports/documents apply the negative direction. This keeps money validators simple while making direction explicit from the record type.

### `SalesReturnItem` — immutable returned-line snapshot

Required fields:

- `salesReturnId` and original `salesOrderItemId`, both restrictive relations;
- optional source `salesOrderStockFulfillmentId` for a stock-tracked product;
- `quantity > 0`;
- original product ID plus name/model/SKU snapshots;
- original sold quantity and unit-price snapshot;
- this return's allocated discount, ex-VAT, VAT, and inc-VAT totals;
- tax rate/code snapshot;
- base ex-VAT, VAT, and inc-VAT totals;
- `stockDisposition`;
- optional condition note;
- nullable unique `stockMovementId`, required only for `SELLABLE` stock-tracked lines;
- unique `(salesReturnId, salesOrderItemId)` so a request cannot repeat a line ambiguously.

For `DAMAGED` and `QUARANTINE`, the immutable return item is the source record for separate condition inventory. Queries derive quantities grouped by product and disposition from these rows. They do not affect `Product.stockQuantity`. A future inspection/write-off event will reference this row and be append-only; it is deliberately outside this return implementation.

Manual or non-stock-tracked sales lines still retain a disposition for the return document, but create no available-stock movement. A stock-tracked line must have sufficient unreturned fulfilled quantity or the return is rejected as an integrity problem.

### `SalesReturnReceivableAllocation` — return credit applied to an obligation

Required fields:

- `salesReturnId`;
- exactly one of `debtId` or `installmentId`;
- amount in the obligation/return currency;
- exchange-rate snapshot and base amount;
- `createdAt`.

All relations use `onDelete: Restrict`. The sum for a return equals `receivableReliefAmount`. Debt/installment balance derivation subtracts non-voided payment allocations **and** immutable return allocations. No customer balance column is introduced.

### `CashRefund` — explicit outgoing cash record

Required fields:

- `id`, unique `salesReturnId`, optional `customerId`;
- amount, currency, original exchange-rate snapshot, and base amount;
- `processedAt`, `processedById`, actor snapshots;
- inherited return reason/reference.

Its amount must equal the parent return's `refundableAmount`, and it may exist only when `refundMethod = CASH_OUT`. It is a cash-out transaction for cash-flow reporting, not a negative `Payment`.

### `CustomerCredit` and `CustomerCreditApplication`

`CustomerCredit` is an immutable issue record with unique `salesReturnId`, required customer, issued amount/currency/original rate/base amount, issue timestamp, actor, and reason. It may exist only when `refundMethod = STORE_CREDIT` and must equal `refundableAmount`.

`CustomerCreditApplication` is an immutable redemption allocation containing credit ID, customer, future sales-order reference, exactly one target debt/installment, amount, application-time base snapshot, idempotency key/fingerprint, actor, reason, and timestamp.

Available store credit is derived as:

```text
issued credit - sum(valid applications)
```

No mutable `remainingCredit` column is allowed. An application validates same customer, same currency, sufficient derived available credit, and sufficient target outstanding inside one serializable transaction. It reduces the target receivable as a credit allocation but never appears as cash collected. The initial UI may apply credit to an order-linked debt/plan; integration into the future unified sale-tender flow must remain a separate T8 change rather than silently treating credit as cash.

### Database constraints and deletion policy

Use check constraints for positive quantities, non-negative money, exactly-one allocation target, refund-method consistency, and window-override reason consistency. Use unique keys for idempotency, return numbering, one cash/credit settlement per return, and one stock movement per sellable return line.

The cumulative-quantity and available-credit limits span rows, so enforce them through serializable transactions and retry-on-conflict, with DB integration tests proving concurrent requests cannot exceed them. All return, refund, credit, allocation, movement, order, customer, product, and actor relations use `onDelete: Restrict`. There is no hard-delete endpoint.

## Atomic endpoint and input

Replace the behavior behind the existing route rather than introduce a manual second return endpoint:

`POST /api/v1/sales-orders/:salesOrderId/return`

Input contains:

- `idempotencyKey`;
- one or more `{ salesOrderItemId, quantity, stockDisposition, conditionNote? }` entries;
- `returnDeliveryFee` (default false);
- `refundMethod` (`NONE`, `CASH_OUT`, or `STORE_CREDIT`);
- return reason;
- `overrideReturnWindow` and conditional `windowOverrideReason`;
- admin account password.

The client does not submit prices, VAT, return totals, outstanding, refund amount, currency, exchange rate, stock movement IDs, or return status. The server derives every one.

The response returns the posted return ID/number, snapshots/totals, receivable allocations, refund/credit reference, resulting derived order financial position, stock results, and document route. The frontend displays a review summary before confirmation, but the server recomputes after submit.

## The single `runFinancialTransaction`

All domain reads and writes below use one serializable `runFinancialTransaction`. No service called by this path may silently open its own transaction.

1. Require authenticated ADMIN role and validate the request shape.
2. Verify the account password with action `RETURN_SALES_ORDER`; keep the verification log in the transaction.
3. Normalize the request and compute its idempotency fingerprint. If the key already exists, return the original result only when fingerprints match; otherwise return conflict.
4. Load the order, actor, current Business Settings, original item snapshots, relevant stock fulfillments, all prior return lines/delivery reversal, and linked financial record through the transaction client. Serializable isolation protects these reads from concurrent return writes.
5. Validate order existence and state (`DELIVERED` or `PARTIALLY_RETURNED` only).
6. Compute the business-date deadline from `orderDate + configured returnWindowDays`. If expired, require the explicit override flag and distinct override reason. Reject a claimed override when no override is needed so audit data stays truthful.
7. Aggregate/reject duplicate requested lines. Validate ownership, positive quantities, and cumulative remaining returnable quantity.
8. For stock-tracked lines, validate sufficient unreturned fulfillment quantity and block any fulfillment already handled by incompatible legacy restoration. Validate each disposition.
9. Derive partial line and optional delivery values from original snapshots using cumulative allocation. Validate VAT/component identities in transaction and base currencies.
10. Load and derive the same order's current receivable. Reject cancelled financial records, currency/customer mismatches, missing links for a positive recorded remainder, or any legacy state where ownership of the balance cannot be proven.
11. Compute receivable relief and refundable amount. Validate `refundMethod`: `NONE` exactly when refundable is zero; otherwise exactly `CASH_OUT` or `STORE_CREDIT`; store credit requires a customer.
12. Preflight every stock result before the first business write, including maximum integer checks and compare-and-set expectations.
13. Insert the `SalesReturn` header and item snapshots.
14. Insert deterministic receivable allocations and recompute affected debt/installment/plan status projections.
15. For each `SELLABLE` tracked line, invoke the shared inventory reversal primitive with the existing transaction: compare-and-set `Product.stockQuantity`, append `SALE_RETURN_SELLABLE`, and link it to the return line/source fulfillment. For `DAMAGED`/`QUARANTINE`, write only the condition inventory provenance; available quantity stays unchanged.
16. Create exactly one `CashRefund` or `CustomerCredit` for a positive refundable amount, or neither for `NONE`.
17. Derive cumulative returned quantities after this write and update the order to `PARTIALLY_RETURNED` or `RETURNED`. Do not clear its financial link or rewrite original money/VAT fields.
18. Write one comprehensive `SalesAudit` action `RETURN` and any domain-specific financial/inventory audit references.
19. Recheck settlement, quantity, VAT, and stock identities, then commit. Any thrown error rolls back every write above.

## Preserving every existing guard

| Existing protection | Atomic equivalent |
|---|---|
| Authenticated admin only | Keep route middleware and `assertSalesAdmin`; verify current DB user role/password in the atomic service. |
| Order must exist | Load the order transactionally and return `Sales order not found` before writes. |
| Financial link must be removed before terminal status | Do not remove it. Instead prove the linked obligation belongs to this order and atomically apply the exact return credit. Block missing/cancelled/mismatched legacy financial state. This preserves the real protection: no returned order with an unexplained receivable. |
| No active stock fulfillment before terminal status | Replace the manual prerequisite with transaction-scoped fulfillment coverage checks and stock/disposition writes. Full `RETURNED` is written only after every sold quantity is accounted for; partial quantity leaves the order `PARTIALLY_RETURNED`. |
| Only delivered orders can return | Permit only `DELIVERED` and the new `PARTIALLY_RETURNED`; every other state remains blocked. |
| Reason and password required | Keep both. Require a second, distinct reason when overriding the return window. |
| Active admin/password/lockout verification | Reuse `verifyAdminPassword` with `RETURN_SALES_ORDER` context and transactional verification logging. |

The old guards are not weakened. Their manual “do this first” form becomes “prove and write this atomically.”

## Reusing stock reversal machinery

Extract the safe internal parts of `SalesOrderInventoryService.restoreStock` into a transaction-aware primitive; do not call the public method, because it opens its own transaction and assumes an entire fulfillment returns to sellable stock.

Reuse:

- order/fulfillment ownership validation;
- deterministic product/fulfillment ordering;
- whole-request preflight;
- stock-ceiling validation;
- compare-and-set quantity update;
- append-only movement creation;
- stale-write conflict handling;
- movement/actor/reason provenance.

Extend it for quantities and disposition:

- the returned quantity may be less than the original fulfillment quantity;
- only `SELLABLE` produces a positive available-stock movement;
- returned quantity is derived from return-line links, so concurrent/retried calls cannot reuse it;
- a source fulfillment remains `ACTIVE` as the immutable original outbound movement after partial and full returns. Return lines hold the offset movements and cumulative returned quantity. `REVERSED` remains reserved for cancellation with its required reversal movement; the existing database coherence constraint is preserved;
- legacy `SALE_CANCEL_RESTORE` remains cancellation/restoration history and is not relabeled as a customer return;
- the legacy Restore Stock endpoint rejects a fulfillment as soon as it has an atomic return line, preventing it from restoring the original full quantity after a partial return;
- the existing inventory reconciliation equation remains clean because every `Product.stockQuantity` change still has one movement, while damaged/quarantined quantities do not alter that available-stock cache.

## Audit trail

The return audit is one readable business event, not three unrelated entries. It records:

- return ID/number and original order ID/number;
- before/after order state;
- each original item ID, product snapshots, quantity sold, quantity previously returned, quantity in this return, and cumulative quantity after;
- original and reversed ex-VAT/VAT/inc-VAT components, rate/code, currency/rate, and base components;
- stock disposition, source fulfillment, stock movement ID if sellable, and condition note;
- optional delivery reversal snapshot;
- receivable outstanding before/after and every allocation target/amount;
- refundable amount, explicit method, and cash-refund/store-credit record ID;
- configured window, calculated deadline, whether override was used, and override reason;
- general return reason;
- actor ID plus name/username snapshots, timestamp, request ID, and IP address;
- idempotency key (the password and request fingerprint payload are never logged).

The successful `AdminVerificationLog` remains. `CashRefund`, `CustomerCredit`, receivable allocations, return lines, and stock movements are themselves immutable audit evidence. They are linked from the sales audit rather than duplicated into unrelated correction audits.

## Return document

Add a reprintable route/page for a posted return and use the established bilingual invoice/receipt primitives, fonts, EN/AR side-by-side labels, RTL handling, A4 print CSS, and `print-color-adjust: exact` behavior.

The document title is **Sales Return / مرتجع مبيعات** and it shows:

- configurable shop identity/logo;
- return number and original invoice/order number;
- original sale date and return date/time;
- customer identity, or the same anonymous-customer convention as the invoice;
- processor;
- each returned item, returned quantity, original unit price, allocated discount, subtotal before VAT, original VAT rate/code and amount, total including VAT, and disposition in English/Arabic;
- returned delivery fee and its original VAT treatment when applicable;
- transaction currency and original exchange rate when relevant;
- total return value as a credit/negative amount;
- amount applied to outstanding, remaining order-linked outstanding after the return, and refundable amount;
- `Cash refund / استرداد نقدي`, `Store credit / رصيد للعميل`, or `No payout — applied to balance / بدون دفع — حُسم من الرصيد`;
- cash-refund or store-credit reference;
- general reason;
- a clear note that it reverses part/all of the original sale without altering the original invoice.

All monetary/document values come from `SalesReturn` snapshots and allocations. Reprinting never reads current product prices, VAT rates, exchange rates, or recomputes partial allocations. A print/render failure does not roll back a posted return; the operator can reprint from history.

## Reporting and customer views

Reports use the return's `returnDate`/`processedAt` period, not the original sale date:

- **Gross sales:** original eligible sales at their original positive amounts, including sales later partially/fully returned.
- **Returns/refunds:** posted `SalesReturn` totals, presented negative; expose settlement split into receivable relief, cash refunds, and store credit.
- **Net sales:** gross sales minus return totals.
- **VAT:** original positive sale VAT plus negative return VAT from stored return snapshots in the period of the return.
- **Cash flow:** `CashRefund` is cash out. Receivable relief and store-credit issue/application are non-cash. Do not report them as collected money.
- **Customer profile:** show current receivable outstanding and available store credit as separate derived figures; optionally show net position, but never silently label store credit as negative cash or a payment.
- **Customer statement:** show the return document. Its receivable allocation reduces the receivable running balance; cash/store-credit settlement is visible but does not reduce receivables a second time. Show available store credit separately.
- **Order detail:** retain original totals and invoice, plus cumulative returned totals, remaining returnable quantity by line, posted return documents, current linked outstanding, refunds, and store credits.

Cancelled sales remain governed by their existing reporting policy; a cancellation is not a return and creates no negative return transaction.

## Failure modes and outcomes

Unless marked “after commit,” every failure below throws inside the serializable transaction and leaves no return header, item, financial allocation, refund/credit, stock movement, stock change, order-state change, or success audit.

| Failure | Outcome |
|---|---|
| Unauthenticated/non-admin caller | 401/403; no transaction effects. |
| Missing reason/password, malformed/duplicate lines, invalid quantity/disposition | 400 validation error; no effects. |
| Inactive/deleted/demoted user, wrong password, or verification lockout | 401/403; no business effects. |
| Order not found | 404; no effects. |
| Order not `DELIVERED`/`PARTIALLY_RETURNED` | 409; no effects. This includes cancelled and fully returned orders. |
| Return after configured deadline without override | 409 with deadline; no effects. |
| Expired-window override without a distinct reason | 400/409; no effects. |
| Duplicate idempotency key, identical fingerprint | Return the original posted result; no duplicate stock, money, or audit. |
| Duplicate idempotency key, different fingerprint | 409 idempotency conflict; no effects. |
| Requested item does not belong to order | 404/409; no effects. |
| Requested or concurrent cumulative quantity exceeds sold quantity | 409; serializable retry then rejection; no effects. |
| Delivery fee already returned | 409; no effects. |
| Current product price/VAT/rate differs | Irrelevant; use stored snapshots. No error and no historical rewrite. |
| Snapshot arithmetic is internally inconsistent | 409 integrity error requiring repair; do not improvise totals. |
| Stock-tracked line lacks sufficient compatible fulfillment history | 409 integrity error; no effects. |
| Legacy manual stock restoration overlaps requested quantity | 409 remediation required; never add stock twice. |
| Sellable stock would exceed integer ceiling | 400/409; no effects. |
| Compare-and-set loses a stock race | Retry the whole serializable transaction; if retries exhaust, 409 and no effects. |
| `DAMAGED`/`QUARANTINE` return | Commit condition inventory provenance but no available-stock increase; this is expected, not failure. |
| Positive historical remainder but no linked obligation | 409 remediation required; do not assume it was paid or forgiven. |
| Linked debt/plan is cancelled or belongs to another customer/currency | 409 remediation required; no effects. |
| Financial return allocation exceeds derived target outstanding | Recompute/serialize; reject if still invalid. |
| `NONE` with refundable money, or payout method with zero refundable money | 400; no effects. |
| Store credit requested for an anonymous order | 409; require a customer or choose cash-out. |
| Refund/credit/receivable sums do not equal return value | Invariant failure; rollback. |
| Any repository, audit, or final invariant check fails mid-operation | Full rollback (INV-05). |
| Client loses response after commit | Retry with same idempotency key; receive original result. |
| Document generation/physical printing fails after commit | Return remains valid and reprintable; no compensating data mutation. |
| Operator chose wrong condition/refund method and transaction committed | No direct edit/delete. Stop and use a future dedicated return-reversal/correction workflow; do not manually unlink or restore around it. |

## Required implementation tests after approval

Prompt 07 must add domain, service, route, and DB integration coverage including:

- full paid return with cash refund;
- full half-cash/half-credit return: linked outstanding becomes zero, cash refund equals only the paid half;
- partial return smaller than outstanding: receivable relief only;
- partial return larger than outstanding: relief plus cash/store credit;
- two $50 VAT-inclusive units at 11%: first partial and final return reconcile exactly;
- three or more partial returns, multi-unit requests, mixed line/request ordering, USD two-decimal and LBP whole-unit rounding, and cumulative base-currency allocation: final gross/VAT/subtotal and base components reverse the original anchors exactly with zero residual rounding drift;
- concurrent returns cannot exceed sold quantity;
- mixed `SELLABLE`, `DAMAGED`, and `QUARANTINE` lines affect only available stock correctly;
- delivery VAT is reversed once from its stored treatment/rate/amount;
- VAT rate changed after sale still reverses the original snapshot (INV-23);
- USD/LBP component/base reconciliation and rounding;
- failure injected after stock, financial allocation, refund/credit, and audit writes leaves no partial state (INV-05);
- identical idempotent replay applies once; mismatched replay conflicts;
- returned order rejects another return;
- window boundary, expired rejection, valid audited override, and setting change;
- legitimate payment records remain non-voided;
- customer outstanding remains independently derivable/reconciled (INV-01);
- customer store-credit availability is derived and cannot be over-applied;
- inventory reconciliation remains clean;
- gross sales unchanged, returns negative, net arithmetic exact, cash refund classified as cash out;
- bilingual return document snapshot uses stored transaction values and is reprintable.

Run the full `npm run test:ci` and inventory/customer-financial reconciliation reports after implementation, as Prompt 07 requires.

## Migration disclosure for the future implementation

- **DB impact:** new return, return-line, receivable-allocation, cash-refund, customer-credit, and credit-application tables; new enums/enum values; `BusinessSettings.returnWindowDays`.
- **Existing sales/financial rows:** not rewritten, cancelled, unlinked, or deleted. The migration upserts the Business Settings singleton if absent and gives it the initial configurable value `14`.
- **Backfill:** no historical `RETURNED` order is fabricated into a return/refund. Existing manually returned records remain legacy history and require explicit remediation if operators need new documents or financial settlement.
- **Safety:** standard verified backup before migration; all new foreign keys restrictive; unique and check constraints installed with the migration.
- **Rollback before production data:** drop new tables/constraints/enum additions and settings column using a reviewed down procedure.
- **Rollback after posted returns:** application rollback alone is unsafe because new records affect stock and receivables. Restore the compatible release or perform an audited data migration; never drop posted returns.

## Approval gate

The owner authorized Prompt 07 and explicitly approved the cumulative rounding amendment on 2026-09-14. If implementation discovers another unanticipated state or invariant, stop and amend/reapprove the design rather than improvising. This approval does not authorize production migration or merging to main.
