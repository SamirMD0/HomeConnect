# Codex build prompt — HomeConnect Inventory v1.9.1 (Supplier Receiving)

**Purpose:** implementation prompt for supplier receiving, checkpoint by checkpoint.
**Companion plan:** [claude/plans/inventory-v1.9.1-supplier-receiving-plan.md](../plans/inventory-v1.9.1-supplier-receiving-plan.md) — read it first; it is the source of truth for design decisions.
**Predecessor prompt:** [claude/prompts/codex-inventory-v1.9.0-build.md](codex-inventory-v1.9.0-build.md)
**Created:** 2026-08-13

Paste everything between the fences into Codex. Re-paste it at the start of each checkpoint,
naming the checkpoint you are authorizing.

**CP-1913 is implemented and awaiting review. Nothing later is authorized; CP-1914 requires explicit written authorization by name.**

---

```text
You are working in the HomeConnect repository — a local Windows Electron ERP-style app for an
appliance retail/repair business. Local PostgreSQL, Express + Prisma, React frontend, Electron
desktop shell, Vitest throughout. The app runs on a real shop PC holding real business data.

You are building SUPPLIER RECEIVING as the v1.9.1 release target.

Read claude/plans/inventory-v1.9.1-supplier-receiving-plan.md before writing anything. It is the
design authority. Where this prompt and the plan disagree, STOP AND ASK — do not pick one
silently.

====================================================================
AUTHORIZATION — READ THIS FIRST
====================================================================

CP-1911, CP-1911A, and CP-1912 are complete. CP-1913 is implemented and awaiting review.

NOTHING LATER IS AUTHORIZED RIGHT NOW.

CP-1914 IS THE NEXT CHECKPOINT AND IT MUST NOT START until the user authorizes it by name.

Finish the named checkpoint, produce its report, STOP, and wait. Do not "get a head start" on the
schema. Do not draft the migration. Do not create files. The same rule applies at every later
checkpoint.

FORBIDDEN IN EVERY CHECKPOINT UNLESS THE USER EXPLICITLY AUTHORIZES IT IN WRITING:
  - bumping the version in package.json or anywhere else
  - running the installer / electron-builder / any packaging or build-release step
  - committing or pushing
  - connecting to, reading from, or writing to the REAL business PC database
  - prisma migrate reset, DROP, TRUNCATE, DELETE, or any destructive SQL
  - backfilling receiving rows from existing supplier transactions or stock movements
  - editing anything under backend/prisma/repair/manifest.json

====================================================================
WHAT YOU ARE BUILDING
====================================================================

v1.8.0 made the stock number trustworthy. v1.9.0 connected it to the document that takes goods
OUT (the sales order). v1.9.1 connects the document that puts goods IN.

  Goods arrive from a supplier -> user presses "Receive Stock / إدخال إلى المخزون"

Each receiving line creates ONE PURCHASE_RECEIPT StockMovement. PURCHASE_RECEIPT has been
reserved and unwired since v1.8.0; this release is what wires it.

THE DECISION THAT SHAPES THIS RELEASE:
  SupplierTransaction is NOT the hook. It has no product and no quantity, it is mutable and
  soft-removable, and it is a FINANCIAL ledger. Deriving stock from it would re-trust the client
  with product and quantity — exactly the property v1.9.0 removed — and would imply stock
  reversal on a financial edit.

  Supplier receiving is its OWN inventory document. It MAY reference a supplier. It NEVER writes
  to the supplier ledger.

WHAT MUST NOT HAPPEN:
  - creating a SupplierTransaction silently increases stock                FORBIDDEN
  - editing or removing a supplier transaction changes stock               FORBIDDEN
  - receiving stock creates a supplier payable, debt, or balance change    FORBIDDEN
  - receiving stock touches customer debt, payment, or installment rows    FORBIDDEN
  - receiving onboards a product that has no verified opening count        FORBIDDEN
  - any valuation, COGS, FIFO, weighted average, margin, or profit         FORBIDDEN

Product.costPrice exists and a receiving line is exactly where someone will want to multiply it
by a quantity. Do not. Not once, not "just for display".

====================================================================
BASELINE — verify in CP-1911, do not assume
====================================================================

REUSE, do not rebuild:
  - runFinancialTransaction (Serializable, retries only P2034 by re-running the whole operation)
  - InventoryRepository.compareAndSetQuantity — the lost-update guard, assert count === 1
  - InventoryRepository.findOpeningBalance — returns { id, createdAt } (added in v1.9.0)
  - InventoryRepository.createMovement — the StockMovement writer
  - normalizeRequiredReason / normalizeOptionalText (inventory.validator.ts)
  - databaseUuidSchema (backend/src/validators/database-uuid.ts) — see LEGACY UUIDS below
  - timestampToBusinessDate / todayInBusinessTimezone (financial/domain/business-date.ts)
  - businessLabels, format 'English / عربي'
  - the v1.9.0 SalesOrderStockFulfillment service as the structural template

LEGACY UUIDS — NON-NEGOTIABLE:
  v1.9.0 added databaseUuidSchema because real product IDs are canonical UUID text whose version
  nibble is NOT RFC-assigned. This was measured: 1 of 90 products in the restored business backup
  fails z.string().uuid(). EVERY new validator in v1.9.1 must use databaseUuidSchema. Using
  z.string().uuid() will reject real business data at the shop counter.

PENDING-MIGRATION COMPATIBILITY:
  v1.9.0 added a to_regclass probe in InventoryRepository.summary so the packaged app starts on
  the OLD schema, letting Maintenance take a backup BEFORE applying pending migrations. Apply
  that pattern to every ordinary query that adds receiving relations: summary/recent movements,
  global movement history, product movement history, and dashboard activity. Do not assume
  migrations run before the app starts.

====================================================================
CORE DESIGN
====================================================================

TWO TABLES, additive migration, NO enum addition needed (PURCHASE_RECEIPT already exists):
  supplier_receivings       (id, supplierId?, referenceNumber?, receivedOn date, note?,
                             receivedById, createdAt)
  supplier_receiving_items  (id, receivingId, productId, quantity, stockMovementId UNIQUE,
                             createdAt)

  receivedOn is a date-only @db.Date. Do not rename it receivedAt. The document is immutable, so
  it has no updatedAt. Pre-generate each item UUID so the movement referenceId and the item's
  authoritative stockMovementId can both be non-null from their first insert.

EVERY foreign key ON DELETE RESTRICT, matching v1.9.0.
  CHECK (quantity > 0)
  CHECK (referenceNumber IS NULL OR btrim(referenceNumber) <> '')
  UNIQUE (receivingId, productId)   -- one line per product per document
  UNIQUE (stockMovementId)          -- a movement backs at most one line

referenceNumber is DELIBERATELY NOT UNIQUE. Suppliers reuse and omit invoice numbers, and a
unique constraint would block a legitimate second delivery. Duplicate detection is a UI warning.

MOVEMENT CONTRACT, per line:
  movementType   = PURCHASE_RECEIPT
  quantityChange = +quantity
  quantityBefore/After = read and computed SERVER-SIDE
  reason         = SERVER-GENERATED from supplier name + reference. NEVER from the client.
  referenceType  = 'SUPPLIER_RECEIVING_ITEM'
  referenceId    = receiving item id
  createdById    = acting user

TRANSACTION SHAPE — one runFinancialTransaction, items sorted by productId:
  1. validate header; if supplierId present the supplier must exist AND be ACTIVE
  2. validate receivedOn: real business date, NOT in the future; backdating is allowed only on
     or after every selected product's opening-count business date
  3. validate items: >= 1, positive integer within INVENTORY_QUANTITY_LIMIT, no duplicate
     productId (clean validation error; the @@unique is only the backstop)
  4. per item: product exists, trackStock = true, and HAS A VERIFIED OPENING COUNT. Convert the
     opening createdAt with timestampToBusinessDate and reject a receipt date before it.
     Receiving does NOT onboard a product.
  5. before writing: every line is 1..100,000 and every projected result is <= 2_147_483_647
  6. per item: read `before` INSIDE THE WRITE LOOP from the same tx, compute after, repeat the
     ceiling guard, compareAndSetQuantity asserting count === 1, insert StockMovement, then the
     pre-ID'd SupplierReceivingItem
  7. commit whole or not at all — one bad line means NO movements and NO partial receipt

ALL VALIDATION BEFORE THE FIRST WRITE.

IMMUTABILITY: a posted receiving document has NO edit and NO delete endpoint in v1.9.1. A mistake
is corrected with a compensating manual movement (DAMAGE_LOSS / MANUAL_REMOVE / STOCK_COUNT),
which keeps its ADMIN + password guard. Reversal is DEFERRED — unlike a sales deduction, an
incorrect receipt blocks nothing downstream, so there is no deadlock forcing it into this release.

SUPPLIER LIFECYCLE:
  Archived suppliers retain readable receiving history but cannot be selected for a new receipt.
  Suppliers referenced by receiving documents cannot be hard-deleted. SuppliersService.remove
  must return a friendly 409 with code SUPPLIER_HAS_RECEIVINGS and recommend archive;
  ON DELETE RESTRICT is the database backstop.

PERMISSIONS:
  create / view receiving = ADMIN or EMPLOYEE, NO account password
  Use requireRole([Role.ADMIN, Role.EMPLOYEE]) explicitly, not bare requireAuth, so a future
  third role fails closed.

  Note the deliberate asymmetry: every supplier TRANSACTION write is ADMIN-only, so an EMPLOYEE
  who can receive goods cannot record what the shop owes for them. That is correct — one is
  inventory, the other is finance — but the UI must say so plainly.

BACKEND API:
  GET  /api/v1/inventory/receivings
  GET  /api/v1/inventory/receivings/duplicate-check  (register before /:receivingId)
  GET  /api/v1/inventory/receivings/:receivingId
  POST /api/v1/inventory/receivings
  No PATCH, DELETE, reverse, or supplier-ledger endpoint. Duplicate checking runs only when both
  supplierId and referenceNumber exist, warns only, and never blocks creation.

FRONTEND LOCATION: under INVENTORY, never under Suppliers or the Supplier Ledger.
  /inventory/receiving          list
  /inventory/receiving/new      form
  /inventory/receiving/:id      read-only document view
  The form MUST state, bilingually, that NO SUPPLIER PAYABLE IS RECORDED and that the supplier
  ledger is updated separately.
  Disable submit while in flight and navigate to the created document on success.
  Warn (do not block) if a document already exists with the same supplier and reference number.
  Movement history links PURCHASE_RECEIPT rows back to the document through the
  SupplierReceivingItem RELATION, not by parsing referenceType.

====================================================================
LEDGER ISOLATION — NON-NEGOTIABLE
====================================================================

No code path added in this release may create, update, or delete a row in:
  supplier_transactions, debts, payments, payment_allocations, installment_plans, installments,
  transactions
nor change any supplier balance, customer receivable, sales order, or dashboard financial figure.

Tests MUST snapshot all of these before and after every receiving write and assert UNCHANGED.
This is the same assertion set v1.9.0 used, extended with supplier balance.

====================================================================
MIGRATION SAFETY
====================================================================

  - ADDITIVE ONLY: CREATE TABLE, CREATE INDEX, ALTER TABLE ... ADD CONSTRAINT
  - NO enum addition needed — PURCHASE_RECEIPT already exists
  - NO DROP, TRUNCATE, DELETE, UPDATE of existing rows, NO prisma migrate reset
  - NO BACKFILL. No supplier transaction becomes a receipt. No historical stock movement is
    reclassified. Every pre-v1.9.1 arrival stays whatever manual movement recorded it.
  - report-only SQL under backend/prisma/repair/inventory-v1.9.1/ — nothing writes. Add no
    manifest.json entry unless the rehearsal proves a repair is needed.
  - REHEARSAL IS THE RELEASE GATE. Scratch rehearsal first, then CP-1919 against a RESTORED COPY
    of the business PC backup on a development machine. Nothing is installed on the business PC
    until CP-1919 passes.

====================================================================
CHECKPOINTS
====================================================================

CP-1911  Repo review after the v1.9.0 commit. COMPLETE.
CP-1911A Desktop test baseline fix. COMPLETE at 19ab2a9.
CP-1912  Supplier receiving design finalization. COMPLETE.
CP-1913  Prisma schema + additive migration. No backfill. IMPLEMENTED; AWAITING REVIEW.
CP-1914  Backend service, routes, validators, tests.  <-- NEXT, NOT YET AUTHORIZED
CP-1915  Frontend receiving list/form/document under Inventory + tests.
CP-1916  Movement links and pending-migration compatibility.
CP-1917  Approved supplier-profile read-only receiving history.
CP-1918  Approved dashboard recent receipts. Reversal remains deferred.
CP-1919  Rehearsal on a RESTORED business-PC backup.  <-- release gate
CP-1920  Final review. No bump, build, installer, or commit without approval.

====================================================================
CP-1913 — PRISMA SCHEMA + ADDITIVE MIGRATION  (IMPLEMENTED — AWAITING REVIEW)
====================================================================

When explicitly authorized by name:

  1. Verify HEAD is 19ab2a97e60ef053cd05f2802635105436e2c290, package version is 1.9.0,
     there are no tracked modifications, and only the approved planning files are untracked.
     If that gate differs, STOP and report.
  2. Add SupplierReceiving and SupplierReceivingItem plus the necessary inverse relations.
     Use receivedOn @db.Date, no receivedAt and no updatedAt. supplierId and referenceNumber are
     optional. Every foreign key is ON DELETE RESTRICT.
  3. Add an additive migration only: CREATE TABLE / CREATE INDEX / ADD CONSTRAINT. Include
     quantity > 0, nonblank-or-null referenceNumber, unique (receivingId, productId), unique
     stockMovementId, and the planned regular indexes. Do not alter the StockMovementType enum.
  4. Do not backfill, edit products, edit existing rows, or add a repair-manifest entry. Do not
     write backend/frontend service code in this checkpoint.
  5. Validate Prisma, generate the client if required, inspect the generated SQL, and rehearse
     migrate deploy plus constraint/FK probes only against a disposable scratch database.
     Never connect to the real business PC database.
  6. Run the smallest schema/migration verification set plus backend typecheck and
     git diff --check. Report every changed file and prove the migration contains no INSERT,
     UPDATE, DELETE, DROP, TRUNCATE, enum alteration, or products-table alteration.

STOP after the CP-1913 report. Do not start CP-1914, bump, build, stage, commit, or push.
```
