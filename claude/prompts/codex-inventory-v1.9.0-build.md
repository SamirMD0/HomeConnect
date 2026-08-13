# Codex build prompt — HomeConnect Inventory v1.9.0 (Document-Linked Stock Movements)

**Purpose:** implementation prompt for connecting inventory to sales orders, checkpoint by
checkpoint. Supplier receiving is deferred in full to v1.9.1.
**Companion plan:** [claude/plans/inventory-v1.9.0-document-linked-movements-plan.md](../plans/inventory-v1.9.0-document-linked-movements-plan.md) — read it first; it is the source of truth for design decisions.
**Predecessor prompt:** [claude/prompts/codex-inventory-v1.8.0-build.md](codex-inventory-v1.8.0-build.md)
**Created:** 2026-08-13

Paste everything between the fences into Codex. Re-paste it at the start of each checkpoint,
naming the checkpoint you are authorizing.

**CP-1904 through CP-1907 are complete. CP-1908 review remediation is implemented and awaiting
re-review. No release action is authorized.**

---

```text
You are working in the HomeConnect repository — a local Windows Electron ERP-style app for an
appliance retail/repair business. Local PostgreSQL, Express + Prisma, React frontend, Electron
desktop shell, Vitest throughout. The app runs on a real shop PC holding real business data.

You are building DOCUMENT-LINKED INVENTORY MOVEMENTS as the v1.9.0 release target.

Read claude/plans/inventory-v1.9.0-document-linked-movements-plan.md before writing anything.
It is the design authority. Where this prompt and the plan disagree, STOP AND ASK — do not pick
one silently.

====================================================================
AUTHORIZATION — READ THIS FIRST
====================================================================

CP-1901 THROUGH CP-1907 ARE COMPLETE (2026-08-13). The first CP-1908 review rejected release
authorization because the dashboard awaiting-deduction SQL inverted the UTC-to-Beirut conversion.
That defect, its PostgreSQL regression test, pending-migration summary compatibility, strict action
schemas, and documentation corrections are implemented. CP-1908 now awaits re-review.

No further implementation or release action is authorized. Review the remediation, report, and
STOP. Do not bump, package, stage, commit, or push without separate explicit user approval.

FORBIDDEN IN EVERY CHECKPOINT UNLESS THE USER EXPLICITLY AUTHORIZES IT IN WRITING:
  - bumping the version in package.json or anywhere else
  - running the installer / electron-builder / any packaging or build-release step
  - committing or pushing
  - connecting to, reading from, or writing to the REAL business PC database
  - prisma migrate reset, DROP, TRUNCATE, DELETE, or any destructive SQL
  - backfilling data from existing sales orders
  - editing anything under backend/prisma/repair/manifest.json

====================================================================
WHAT YOU ARE BUILDING
====================================================================

v1.8.0 gave the shop a trustworthy stock number plus an append-only StockMovement ledger, but
every movement is typed by hand. v1.9.0 connects that ledger to SALES ORDERS ONLY:

  Customer buys a product   -> user presses "Deduct Stock / إخراج من المخزون"
  Order must be undone      -> admin presses "Restore Stock / إرجاع إلى المخزون"

SUPPLIER RECEIVING IS v1.9.1. v1.9.0 creates no receiving table, route, service, component,
test, dashboard surface, or release-note claim. PURCHASE_RECEIPT stays reserved and unwired.

WHAT MUST NOT HAPPEN — these are the failure modes this release exists to prevent:
  - creating a sales order silently deducts stock                          FORBIDDEN
  - confirming a sales order silently deducts stock                        FORBIDDEN
  - a delivery status change silently deducts stock                        FORBIDDEN
  - recording a payment silently deducts stock                             FORBIDDEN
  - creating a SupplierTransaction silently increases stock                FORBIDDEN
  - editing the supplier ledger silently changes stock                     FORBIDDEN
  - cancelling an order silently restores stock                            FORBIDDEN
  - any stock action creating or editing customer debt or payment          FORBIDDEN
  - any stock action creating or editing a supplier balance or payable     FORBIDDEN

EVERY document-linked stock movement is explicit, visible, and user-confirmed. A human presses a
button. What changes versus v1.8.0 is that the PRODUCT and the QUANTITY are no longer typed by
the operator — the server derives them from a record it already owns.

THE CLIENT IS NEVER TRUSTED with productId, quantity, referenceId or referenceType for a
document-linked movement. The client sends DOCUMENT LINE IDS ONLY. If a request body carries a
productId or a quantity for a sales deduction, ignore it completely — do not validate it, do not
compare against it, do not echo it back.

====================================================================
CONFIRMED BASELINE — CP-1901 outcome
====================================================================

Already exists and must be REUSED, not rebuilt:
  - runFinancialTransaction (backend/src/features/financial/infrastructure/transaction.ts)
    Serializable isolation, retries ONLY P2034, up to 2 retries, by re-running the whole operation
  - InventoryRepository.compareAndSetQuantity — the compare-and-set that prevents lost updates
  - InventoryRepository.hasOpeningBalance — the verified-onboarding check
  - InventoryRepository.createMovement — the StockMovement writer
  - verifyAdminPassword (backend/src/lib/admin-verification.ts) + AdminVerificationLog
  - normalizeRequiredReason / normalizeOptionalText / assertMovementQuantity
    (backend/src/features/inventory/inventory.validator.ts)
  - deriveProductStockStatus (backend/src/features/service/products/product-stock.ts)
  - writeSalesAudit + the SalesAudit model
  - businessLabels in frontend/src/shared/labels/business-labels.ts, format 'English / عربي'
  - the existing inventory frontend under frontend/src/features/inventory/

CONFIRMED BY CP-1901 — these were verified against the code, treat them as established:
  - the four reserved StockMovementType values exist and NO production code writes any of them
  - stock_movements carries the partial unique index
    "stock_movements_one_opening_balance_per_product" plus five CHECK constraints
  - sales READS stock (salesOrderInclude selects trackStock, stockQuantity, lowStockThreshold
    AND costPrice) but never WRITES it; suppliers touch stock nowhere at all
  - SalesOrderItem.id is a stable uuid, productId is nullable, and the same product CAN appear on
    two lines of one order (no constraint, no validator refinement, the editor allows it)
  - SalesOrdersRepository.removeItem is a HARD DELETE — the FK RESTRICT backstop is load-bearing
  - InventoryRepository.hasOpeningBalance selects { id } only; the implemented
    findOpeningBalance method supplies { id, createdAt } for the business-date guard
  - there is NO global Prisma error mapping; error.middleware.ts only understands AppError, so an
    unhandled P2002 becomes an HTTP 500
  - every supplier transaction write is ADMIN-only
  - the v1.8.1 cleanup was validated, packaged, and committed at
    9c46f712bec2fb2e13cfbff65e565ab974f251d8. CP-1903 began from a clean tracked tree at version
    1.8.1. Bucket C remains separately held in stash@{0}.

CORRECTIONS THAT CHANGE THE DESIGN — read sections 5.3, 5.5, 5.5.1, 5.6, 6.1, 7 and 13.1 of the
plan in full. In summary:
  - prismaDateToBusinessDate reads UTC fields. It is CORRECT for @db.Date columns and WRONG for a
    DateTime timestamp such as StockMovement.createdAt. Beirut is UTC+2/+3, so an opening count
    verified just after midnight resolves to the PREVIOUS day and an ineligible order looks
    eligible. Extract timestampToBusinessDate from the body of todayInBusinessTimezone (which
    already accepts an arbitrary Date and formats it through Intl) and use it for the guard. Test
    the midnight boundary with an explicit BUSINESS_TIMEZONE — a midday fixture passes even with
    the broken helper.
  - the running balance must CHAIN across two lines of the same product: read inside the loop
    from the same tx, and precheck against the running balance so two 6-unit lines against a
    10-unit stock are rejected as a pair.
  - P2002 needs a LOCAL catch throwing SalesConflictError (409). CP-1903 measured the raw partial
    index response on scratch PostgreSQL and pinned
    { modelName: 'SalesOrderStockFulfillment', target: ['salesOrderItemId'] } in a gated DB test.
  - StockMovement.reason is SERVER-GENERATED from the document, not typed by the operator, with
    an optional note. Restoration keeps a required typed reversalReason.
  - guard ordering is settled: keep assertEditable then assertNoFinancialLink; the selected-line
    fulfillment check follows item lookup. terminalMutation keeps financial-link first, then
    active fulfillment.
  - supplier receiving is deferred in full to v1.9.1; its later screen belongs under Inventory.

====================================================================
CORE DESIGN — do not deviate without asking
====================================================================

DEDICATED TABLE, NOT REFERENCE STRINGS.
  StockMovement.referenceType / referenceId are free-text metadata used by the existing manual
  flow. They are NOT strong enough to carry inventory safety. Document links live in dedicated
  table with real foreign keys and real unique indexes:
      sales_order_stock_fulfillments   (ACTIVE | REVERSED)
  You may ALSO populate referenceType/referenceId for display convenience, but nothing may READ
  them to make a decision.

DATABASE-LEVEL IDEMPOTENCY IS THE REQUIREMENT, NOT A SERVICE-LAYER CHECK.
  CREATE UNIQUE INDEX "sales_order_stock_fulfillments_one_active_per_item"
    ON "sales_order_stock_fulfillments"("salesOrderItemId")
    WHERE "status" = 'ACTIVE';
  Plus stockMovementId UNIQUE and reversalStockMovementId UNIQUE on fulfillment rows.
  The service-layer check exists only to produce a good error message. The index exists to be
  correct. A P2002 on that index maps to a 409 conflict — and MUST NOT be added to
  isRetryableTransactionError, because retrying a unique violation can only reproduce it.

EVERY QUANTITY CHANGE, in ONE transaction, reusing the v1.8.0 shape:
  read stockQuantity -> quantityBefore -> quantityAfter -> reject negative ->
  compareAndSetQuantity asserting count === 1 -> insert StockMovement -> insert the document-link
  row -> commit or roll back entirely.

WHOLE-OR-NOTHING. A multi-line deduction either applies to every selected line or to none. An
itemId that does not belong to the order is REJECTED, never silently skipped. Partial success is
worse than failure, because the operator cannot tell which half happened.

DETERMINISTIC LOCK ORDER. Within a multi-line transaction, process products sorted by productId
so two concurrent deductions cannot deadlock against each other.

WHOLE-LINE ONLY. v1.9.0 deducts an entire order line or nothing. Partial fulfillment is v1.10.0.

THE DOUBLE-COUNT GUARD — the highest-severity rule in this release:
  REJECT deduction when the sales order's orderDate is EARLIER than the business date of the
  product's OPENING_BALANCE movement. A verified physical count already includes goods that had
  left the shelf before the count was taken; deducting such an order removes the same units
  twice and destroys the number v1.8.0 exists to make trustworthy. This must be a SERVER-SIDE
  REJECTION, not a UI warning. It is also what makes "no backfill" safe for the hundreds of
  orders already in the database.

ORDER STATUS ELIGIBILITY:
  deduction allowed from CONFIRMED onward (CONFIRMED, PREPARING, READY_FOR_DELIVERY,
  OUT_FOR_DELIVERY, DELIVERED). Refused on DRAFT, CANCELLED, RETURNED.

LOCK AFTER DEDUCTION:
  while a line has an ACTIVE fulfillment, updateItem and removeItem are refused for that line.
  Adding NEW lines stays allowed. Order-level edits (fees, dates, notes, payment) stay allowed.
  NEVER silently recalculate stock from an edited order.

RESTORATION SHIPS WITH DEDUCTION — NOT LATER.
  Without it, a deducted order that needs cancelling has no legitimate exit: cancel is blocked,
  the fulfillment cannot be reversed, the line cannot be edited, and the operator's only move is
  a manual add that leaves the fulfillment ACTIVE forever. That is a deadlock. Explicit
  "Restore Stock / إرجاع إلى المخزون" creates a SALE_CANCEL_RESTORE movement and flips the
  fulfillment to REVERSED, which frees the line for a corrected re-deduction.
  cancel/returnOrder refuse while any ACTIVE fulfillment exists, naming the restore action.
  There is NO override and NO "confirm handled manually" escape hatch.

SUPPLIER RECEIVING IS OUT OF SCOPE.
  It is v1.9.1 work. Do not create its schema early and do not wire PURCHASE_RECEIPT.

MANUAL INVENTORY ACTIONS SURVIVE UNCHANGED.
  Add stock, Remove stock, Correct count, Damage/loss, Return to stock, Verify opening count —
  same routes, same permissions, same dialogs. They are the fallback and the correction tool.
  Making any of them harder to reach is a REGRESSION and the frontend tests must assert they are
  still present.

PERMISSIONS — SETTLED 2026-08-13 BY A SECURITY POLICY CORRECTION. IMPLEMENT AS WRITTEN.

  The app had been overusing admin-password verification on actions that are simply WORK.
  Security is ROLE-BASED FIRST. The account password is reserved for HIGH-RISK CORRECTIONS.

  Schema roles are ADMIN and EMPLOYEE (schema.prisma:13). "MEMBER" in the policy statement means
  EMPLOYEE. Do NOT add a role and do NOT touch the Role enum.

  deduct stock   = ADMIN or EMPLOYEE, NO account password
  restore stock  = ADMIN ONLY, NO account password, TYPED REASON REQUIRED

  Use requireRole([Role.ADMIN, Role.EMPLOYEE]) explicitly rather than requireAuth alone. Those
  are the only two roles today, so it is equivalent NOW — but when a third role is added the
  endpoint must fail closed instead of inheriting it.

  ADMIN PASSWORD STAYS REQUIRED FOR (do not touch any of these):
    deleting records; changing or deleting payments; reversing financial records; changing
    supplier or customer ledger balances; STOCK_COUNT correction; manual stock removal NOT linked
    to a document (MANUAL_REMOVE, DAMAGE_LOSS); database repair/maintenance; changing user roles;
    dangerous overrides.

  ADMIN PASSWORD IS NOT REQUIRED FOR:
    document-linked deduction from a valid sales order; scanning; viewing inventory; normal order
    creation; normal product lookup.

  v1.8.0's MANUAL INVENTORY POLICY IS UNCHANGED. MANUAL_REMOVE, STOCK_COUNT and DAMAGE_LOSS keep
  ADMIN + password. Verified opening count keeps ADMIN + password. Write REGRESSION TESTS
  asserting each of these still demands a password — this correction relaxes the neighbouring
  paths and it would be easy to relax these by accident.

  DO NOT accept an accountPassword field on the deduction or restoration endpoints.
  If one is sent, IGNORE it. Do not honour it as a bypass and do not reject the request over it.

  WHERE THE SECURITY ACTUALLY COMES FROM — this is why removing the prompt is safe, and every one
  of these is a hard requirement, not a nice-to-have:
    1. role check at the route
    2. server-side derivation of product / quantity / reference from SalesOrderItem
    3. database-level idempotency (the partial unique index)
    4. audit trail — StockMovement.createdById plus a named SalesAudit row
    5. before/after quantities under CHECK constraints
    6. edits blocked on a line after deduction
    7. an explicit, recorded restore workflow — never a silent adjustment

  Restoration is ADMIN-only WITHOUT a password because it reverses an INVENTORY record rather
  than a financial one, it adds evidence rather than removing any (the fulfillment becomes
  REVERSED, nothing is deleted), and the action it exists to enable — cancelling or returning the
  order — ALREADY requires ADMIN + password at sales-orders.service.ts:575. A second prompt one
  step earlier only trains people to type the password twice without reading either dialog.
  The TYPED REASON is the control that matters there; it cannot be supplied by muscle memory.

====================================================================
LEDGER SAFETY — NON-NEGOTIABLE
====================================================================

No code path added in this release may create, update, or delete a row in:
  debts, payments, payment_allocations, installment_plans, installments, transactions,
  supplier_transactions
nor change any sales order's paidAmount, remainingAmount, paymentStatus, settlement, debtId or
installmentPlanId, nor any customer receivable total, nor any dashboard financial figure.

Tests must snapshot these before and after every new write path and assert they are UNCHANGED.

Also forbidden anywhere in this release: stock valuation, COGS, FIFO, weighted average, margin,
profit. Product.costPrice exists and is tempting — it must not be multiplied by a quantity
anywhere in v1.9.x.

====================================================================
MIGRATION SAFETY
====================================================================

  - ADDITIVE ONLY: CREATE TYPE, CREATE TABLE, CREATE INDEX, ALTER TYPE ... ADD VALUE
  - NO DROP, NO TRUNCATE, NO DELETE, NO UPDATE of existing rows, NO prisma migrate reset
  - NO BACKFILL. No historical sales order becomes a fulfillment. Every pre-v1.9.0 order is
    simply "not deducted".
  - NO change to any customer, debt, payment, installment or supplier-ledger row
  - PostgreSQL will not allow a newly added enum value to be used in the same transaction that
    added it — keep ALTER TYPE ... ADD VALUE in its own statement and verify in the rehearsal
  - helper SQL under backend/prisma/repair/inventory-v1.9.0/ is REPORT-ONLY. Nothing writes.
    Add no manifest.json entry unless the CP-1907 rehearsal proves a repair is needed.
  - REHEARSAL IS THE RELEASE GATE. Scratch rehearsal
    (npm run rehearse:migrations -- --confirm-scratch) proves the bundle applies. Then CP-1907
    rehearses on a RESTORED COPY of the business PC backup, on a development machine. NOTHING is
    installed on the business PC until CP-1907 has passed. You cannot rehearse a migration you
    have not written, so the real-data rehearsal gates the RELEASE, not the authoring.

====================================================================
CHECKPOINTS
====================================================================

CP-1901  Repo review at v1.8.0. NO CODE.                        <-- COMPLETE 2026-08-13
CP-1902  Deduction design finalization. Planning only.          <-- COMPLETE 2026-08-13
CP-1903  Sales fulfillment Prisma schema + additive migration. No backfill. <-- COMPLETE 2026-08-13
CP-1904  Backend sales deduction AND restoration + tests.             <-- COMPLETE 2026-08-13
CP-1905  Frontend sales-order deduct/restore UI + tests.               <-- COMPLETE 2026-08-13
CP-1906  Dashboard, sales movement-history links, release notes.       <-- COMPLETE 2026-08-13
CP-1907  Rehearsal on a RESTORED business-PC backup.                   <-- PASSED 2026-08-13
CP-1908  Final review.                                                 <-- REMEDIATION IMPLEMENTED; RE-REVIEW PENDING

The package remains 1.8.1. Do not bump, build, package, commit, or push until the user gives
separate final-release approval.

====================================================================
CP-1903 — DATABASE LAYER  (COMPLETE 2026-08-13; RETAINED AS CONTRACT)
====================================================================

CP-1903 was DATABASE LAYER ONLY:

  - add Prisma model SalesOrderStockFulfillment and inverse relations to SalesOrder,
    SalesOrderItem, Product, StockMovement, and User where relation names require them
  - add enum SalesOrderStockFulfillmentStatus { ACTIVE, REVERSED }
  - add DEDUCT_STOCK and RESTORE_STOCK to SalesAuditAction
  - author one additive migration creating sales_order_stock_fulfillments only
  - add the partial unique index
      sales_order_stock_fulfillments_one_active_per_item
    on salesOrderItemId WHERE status = 'ACTIVE'
  - make stockMovementId and nullable reversalStockMovementId unique
  - add positive-quantity, coherent-reversal, and non-empty-reversal-reason CHECK constraints
  - use ON DELETE RESTRICT foreign keys
  - add no data and perform no backfill
  - create NO supplier_receivings or supplier_receiving_items table
  - do not implement sales services, routes, validators, or frontend UI yet
  - empirical scratch PostgreSQL probe recorded P2002 metadata as
    { modelName: 'SalesOrderStockFulfillment', target: ['salesOrderItemId'] }
  - run Prisma validation, targeted schema/migration checks, and
    npm run rehearse:migrations -- --confirm-scratch
  - prepare the restored-business-PC-backup rehearsal checks, but do not touch the real business
    PC or run that release-gate rehearsal until its checkpoint

The migration must not alter existing products, stock movements, orders, order items, customers,
debts, payments, installments, supplier records, or supplier transactions. Report and stop for
migration review before CP-1904.

```

## CP-1901 outcome — 2026-08-13

Baseline confirmed; suite green (191 files, 1,404 tests, 0 failures, ~95s) on a **dirty** working
tree. Seven plan assumptions were corrected, three of them design-affecting: the UTC/Beirut
timestamp conversion in the double-count guard, the chained balance across repeated products in
one order, and the absence of any global `P2002` mapping. All are now in the plan and in the
baseline section above.

## CP-1902 outcome — 2026-08-13

Design finalized in the companion plan. v1.9.0 is sales deduction/restoration only; supplier
receiving, including its schema, is v1.9.1. Whole-line fulfillment, delivered-order eligibility,
restore-before-cancel/return, role-only permissions, server-generated deduction reason, typed
restoration reason, existing financial-link guard precedence, timezone-aware opening-date
comparison, sequential repeated-product balance handling, and local `P2002` → 409 mapping are all
settled. CP-1903 instructions are prepared above but remain unauthorized and blocked by the
unrelated dirty application tree.

## CP-1903 outcome — 2026-08-13

The additive fulfillment migration, Prisma model and inverse relations, three CHECK constraints,
seven restrictive foreign keys, three regular indexes, three unique indexes, and the two sales
audit enum values are implemented. The migration contains no data writes or supplier-receiving
schema. Scratch rehearsal passed, the gated PostgreSQL contract test proved the constraints and
captured the raw partial-index `P2002.meta` shape, and the Beirut timestamp helper tests passed.
CP-1904 was subsequently authorized and completed.

## CP-1904 through CP-1908 outcome — 2026-08-13

Backend deduction/restoration, order interaction guards, frontend per-line inventory states and
actions, dashboard awaiting-deduction filtering, movement source links, report-only SQL, and
release notes are implemented. The full suite passed with 1,470 tests and 6 gated skips; both
typechecks and lint passed (zero lint errors).

The release-gate rehearsal restored the real business backup only into local scratch databases.
Protected counts and the product inventory fingerprint were identical before and after the two
pending migrations; the new tables stayed empty; v1.8 inventory reconciliation and v1.9
fulfillment reconciliation both reported zero faults. The retained migrated scratch database is
`homeconnect_rehearsal_v190`. The temporary pristine comparison database was removed.

No business database, customer/debt/payment logic, supplier ledger, Financial Truth Foundation,
supplier receiving, WhatsApp, or Mobile Scanner scope was touched. Package version is still
1.8.1; no build, installer, commit, push, or version bump has occurred.
