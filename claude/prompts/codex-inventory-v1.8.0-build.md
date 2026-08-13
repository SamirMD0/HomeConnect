# Codex build prompt — HomeConnect Inventory v1.8.0

**Purpose:** implementation prompt for building Inventory Management as HomeConnect v1.8.0, checkpoint by checkpoint.
**Companion plan:** [claude/plans/inventory-management-plan.md](../plans/inventory-management-plan.md) — read it first; it is the source of truth for design decisions.
**Created:** 2026-08-12

Paste everything between the fences into Codex. Re-paste it at the start of each checkpoint, naming the checkpoint you are authorizing.

---


```text
You are working in the HomeConnect repository — a local Windows Electron ERP-style app for an
appliance retail/repair business. Local PostgreSQL backend, Express + Prisma, React frontend,
Electron desktop shell, Vitest throughout.

You are building INVENTORY MANAGEMENT as the v1.8.0 release target.

Read claude/plans/inventory-management-plan.md before writing anything. It is the design
authority. Where this prompt and the plan disagree, stop and ask — do not pick one silently.

REHEARSAL TIMING — settled, do not re-litigate:
  CP-INV2 WRITES the migration and backfill against the LOCAL/DEV database, and runs the
  suspicious-row DETECTION queries there.
  CP-INV9 REHEARSES that migration against a RESTORED COPY of the business PC database.
  The real-data rehearsal gates the RELEASE, not the authoring — you cannot rehearse a
  migration you have not written yet. Nothing may be installed on the business PC until
  CP-INV9 has passed. See "What the rehearsal gates" in §8 of the plan.

====================================================================
WHAT YOU ARE BUILDING
====================================================================

Inventory v1.8.0 = Manual Stock Movement Ledger + Low Stock Visibility + Scanner Lookup.

It must answer, for the shop:
  1. How many units are available?
  2. Why did stock change?
  3. Who changed stock?
  4. When did stock change?
  5. Which products are low stock or out of stock?
  6. Can a barcode/SKU scan open the right inventory workflow?

This is practical inventory, NOT ERP accounting.

THE CORE CHANGE: stock is edited today as an ABSOLUTE OVERWRITE with no history. You are
replacing that with SIGNED STOCK MOVEMENTS that explain themselves.

====================================================================
KNOWN BASELINE (verify in CP-INV1, do not assume)
====================================================================

Product already has: trackStock, stockQuantity, lowStockThreshold, costPrice, sku (unique,
required), barcode (unique, optional), specifications.

Already exists and must be REUSED, not rebuilt:
  - deriveProductStockStatus() in backend/src/features/service/products/product-stock.ts
    returns NOT_TRACKED | OUT_OF_STOCK | LOW_STOCK | IN_STOCK
  - ProductStockBadge in frontend/src/features/products/components/
  - GET /products/scan (ProductsService.scanLookup) — open to any authenticated user
  - Scanner Hub feature under backend/src/features/scanner/ (sessions/events are IN-MEMORY)
  - runFinancialTransaction — the existing transaction helper
  - verifyAdminPassword — the existing admin-password check
  - writeServiceAudit / ServiceAudit model
  - businessLabels in frontend/src/shared/labels/business-labels.ts, format 'English / عربي'

Known today, confirm it is still true:
  - NO StockMovement table exists
  - sales orders do NOT deduct stock (they only read it for display)
  - supplier transactions do NOT affect stock
  - service jobs do NOT consume stock
  - the dashboard has no OPERATIONAL stock content, but module-registry.ts does carry an
    Inventory / المخزون tile at 'NEXT' status with no route (CP-INV8 flips it to 'LIVE')
  - PATCH /products/:id/stock (ProductsService.updateStock) requires admin + accountPassword
    + reason, writes a ServiceAudit CHANGE_STOCK row, and sets an ABSOLUTE quantity

====================================================================
CORE DESIGN — follow this unless repo inspection proves a better local convention
====================================================================

Product.stockQuantity STAYS as the stored fast-read value.
StockMovement is the append-only ledger that explains it.

EVERY quantity change must, in ONE database transaction:
  1. read the current Product.stockQuantity
  2. compute quantityBefore
  3. compute quantityAfter
  4. reject negative stock for tracked products (there is NO override — see NEGATIVE STOCK)
  5. update Product.stockQuantity
  6. insert the StockMovement row
  7. commit — or roll back entirely

Concurrency: guard the update with compare-and-set —
  updateMany({ where: { id, stockQuantity: expectedBefore }, data: { stockQuantity: after } })
  assert count === 1, otherwise abort with a "stock changed, please retry" error.
NEVER retry with a stale expectedBefore. That is how a lost update happens.

RECONCILIATION INVARIANT, which you must test:
  for every tracked product,
    SUM(StockMovement.quantityChange) == Product.stockQuantity
    AND the newest movement's quantityAfter == Product.stockQuantity

StockMovement is APPEND-ONLY. No update endpoint, no delete endpoint, no cascade delete from
Product. A mistaken movement is corrected by a compensating movement with a reason.

ZERO-QUANTITY OPENING BALANCE — SETTLED 2026-08-12, CONFIRMED. Implement as written.
  quantityChange must be NON-ZERO for every movement type EXCEPT OPENING_BALANCE, which MAY
  be zero. OPENING_BALANCE always has quantityBefore = 0.

  Why: a verified physical count of zero is a legitimate result. Forbidding it would mean a
  physically-counted empty shelf could never be onboarded, and because un-onboarded products
  refuse stock actions, a product genuinely holding nothing could never receive its first
  unit. That is a deadlock. The never-zero rule exists to stop no-op clicks on the four manual
  types; it does not apply to a once-per-product, idempotency-guarded opening balance where
  zero means "counted, found none".

DATABASE CONSTRAINTS ON THE NEW TABLE — add all of these in the migration.
  stock_movements is brand new, so CHECK constraints on it are purely additive and risk-free.
  A constraint outlives every future code path; a service-layer guard does not.
    CHECK ("quantityBefore" + "quantityChange" = "quantityAfter")
    CHECK ("quantityBefore" >= 0 AND "quantityAfter" >= 0)
    CHECK ("quantityChange" <> 0 OR "movementType" = 'OPENING_BALANCE')
    CHECK ("movementType" <> 'OPENING_BALANCE' OR "quantityBefore" = 0)
    CHECK (btrim("reason") <> '')
  Plus a PARTIAL UNIQUE INDEX so duplicate opening balances are impossible, not merely
  detectable (Prisma cannot express this — put it in the migration as raw SQL):
    CREATE UNIQUE INDEX "stock_movements_one_opening_balance_per_product"
      ON "stock_movements" ("productId")
      WHERE "movementType" = 'OPENING_BALANCE';

MODEL
  StockMovement:
    id, productId, movementType,
    quantityChange (signed Int; zero ONLY for OPENING_BALANCE),
    quantityBefore (Int), quantityAfter (Int), reason (required, non-empty),
    note (optional), referenceType (optional), referenceId (optional),
    createdById (nullable — NULL means system/migration; see the plan for why),
    createdAt
  Indexes: (productId, createdAt), (movementType, createdAt), (createdAt)
  Map to "stock_movements". Int quantities only — no Decimal, no fractional units.
  Inverse relations on BOTH Product and User (Prisma validation requires the User side too).
  There is NO negativeAllowed column — see NEGATIVE STOCK below.

NEGATIVE STOCK — SETTLED, DO NOT DESIGN AN OVERRIDE
  The database ALREADY forbids it:
    products_stockQuantity_check CHECK ("stockQuantity" >= 0)
    in migrations/20260804090000_add_product_sku_stock_specifications/migration.sql
  Negative stock is FORBIDDEN ABSOLUTELY in v1.8.0. The admin override discussed in earlier
  drafts is CANCELLED, not deferred: implementing it would mean dropping or replacing a live
  CHECK constraint, which the additive-only rule forbids.
  - The service layer rejects under-zero movements with a clear bilingual message naming BOTH
    numbers. The constraint is the backstop, never the user-facing error path.
  - Add a test asserting products_stockQuantity_check STILL EXISTS after the inventory
    migration. An additive migration that silently loosened it would be the worst outcome of
    this release.

ENUM StockMovementType — WIRED in v1.8.0:
  OPENING_BALANCE, MANUAL_ADD, MANUAL_REMOVE, STOCK_COUNT, DAMAGE_LOSS, RETURN_TO_STOCK
Declared but NOT wired (no code path may emit them in v1.8.0):
  PURCHASE_RECEIPT, SALE_FULFILLMENT, SALE_CANCEL_RESTORE, SERVICE_PART_USED

  Use these EXACT names. Do NOT prefix them with FUTURE_. An earlier draft of this prompt said
  FUTURE_PURCHASE_RECEIPT and similar; that was wrong and the plan's names win. The prefix
  would have to be renamed the day the feature ships, and renaming a Postgres enum value on a
  live business database is a far worse migration than adding one. "Not wired" is enforced by
  tests and by the absence of a code path, never by the name.

  They are declared now because adding an enum value later costs another migration. Add a test
  asserting that no v1.8.0 code path can emit any of these four.

====================================================================
BACKEND ACTIONS REQUIRED
====================================================================

  addStock            MANUAL_ADD        increases
  removeStock         MANUAL_REMOVE     decreases
  correctStockCount   STOCK_COUNT       either direction
  markDamagedLost     DAMAGE_LOSS       decreases
  returnToStock       RETURN_TO_STOCK   increases
  getProductInventory
  getProductMovements
  getLowStockProducts
  getInventorySummary

RULES
  - Backend is authoritative. The client never computes a new total.
  - The request carries a POSITIVE integer quantity; the BACKEND applies the sign from the
    movement type. The ONE exception is correctStockCount, which carries a TARGET TOTAL and
    the backend computes the delta. Never accept both a delta and a total in one request.

  - STOCK_COUNT THAT MATCHES THE CURRENT QUANTITY — decided, implement as written.
    If the counted total equals the current stockQuantity, the delta is zero, and the
    nonzero-change constraint would reject the row. Do NOT widen the zero exception to a
    second movement type. Instead: write NO movement, commit nothing, and return a clear
    success-shaped message —
      'Count matches current stock. Nothing to record. /
       الجرد مطابق للمخزون الحالي. لا يوجد ما يُسجَّل.'
    Rationale: an empty ledger row would say nothing happened, because nothing did. Keeping
    exactly ONE zero-change exception (OPENING_BALANCE) is what makes that exception easy to
    reason about. If the business later wants a dated "verified correct on this day" record,
    that is a stock-count-session concept, not a movement — and a separate conversation.
    Test both directions plus the equal case.
  - Validate: positive, integer, non-zero, and within a sane upper bound (reject typos like
    1000000 units).
  - reason is REQUIRED and non-empty for every movement type.
  - Reject any movement against an untracked product with a clear message. Do not silently
    start tracking it.
  - Enabling trackStock on a product with stockQuantity <> 0 must create an OPENING_BALANCE
    movement at that moment. A product whose ledger says 0 and whose field says 12 is a bug.
  - No hidden sales deduction. No hidden supplier receiving. No hidden service consumption.

PERMISSIONS
  Any authenticated employee:  view inventory, scan, view movement history,
                               addStock (reason required, NO admin password),
                               returnToStock (reason required)
  Admin + accountPassword:     removeStock, correctStockCount, markDamagedLost,
                               negative-stock override, changing trackStock OFF for a product
                               that has movement history, changing lowStockThreshold
  The asymmetry is deliberate: adding stock is self-limiting (an inflated count is caught at
  the next shelf glance) while removing stock is how shrinkage gets hidden.
  NEVER store or log accountPassword. Use the existing verifyAdminPassword path exactly.

  THIS POLICY IS APPROVED. The user explicitly approved it on 2026-08-12, with full knowledge
  that it relaxes today's admin+password-for-everything rule in the ADD direction only.
  Implement it as written. Do not re-open the question, and do not extend the relaxation to
  removeStock, correctStockCount or markDamagedLost.

OLD ROUTE
  PATCH /products/:id/stock becomes SETTINGS ONLY: trackStock + lowStockThreshold.
  Quantity changes move to the stock-movement endpoint. This is a behavior change to a shipped
  endpoint. frontend productsApi.updateStock, ProductStockSection and their tests MUST be
  updated in the SAME checkpoint (CP-INV4/CP-INV5) or stock editing breaks. Do not leave a
  second editable quantity field anywhere — that would defeat the single write path.

====================================================================
FRONTEND REQUIRED
====================================================================

1. Inventory page (/inventory): summary cards; search by product name / SKU / barcode;
   filters for low-stock, out-of-stock, tracked, untracked; recent stock movements.
2. Product inventory panel (in the product details drawer): current stock, status badge,
   trackStock, lowStockThreshold, movement history newest-first, and five actions —
   Add stock, Remove stock, Correct count, Damage/loss, Return to stock.
   Every action dialog: quantity + REQUIRED reason + optional note, and it must PREVIEW the
   result ("12 → 17") BEFORE the user confirms.
3. Scanner integration: scanning a barcode/SKU opens the matching product's inventory
   workflow. A SCAN MUST NEVER CHANGE STOCK. The scanned code lands in a LOOKUP field, never
   an action field — a wedge scanner firing into a focused quantity box will happily "receive"
   whatever passes the beam. The employee chooses the action and confirms.
4. Dashboard inventory cards (only if safe): low-stock count, out-of-stock count, recent
   movements. NO valuation, NO money on the dashboard.

Bilingual labels via businessLabels, 'English / عربي' format. Arabic content uses dir="auto".

====================================================================
STRICTLY OUT OF SCOPE — do not build, do not stub, do not "prepare for"
====================================================================

automatic sales stock deduction · automatic supplier receiving · automatic service parts
consumption · COGS · FIFO · weighted average · stock valuation · general ledger · chart of
accounts · expenses · financial truth changes · customer debts/payments · sales-order payment
logic · supplier ledger financial behavior · WhatsApp/customer communication · serial/lot
tracking · purchase orders · multi-location/warehouse · unrelated UI rewrites.

Product.costPrice exists. Do NOT write cost onto movements and do NOT compute valuation. The
moment cost lands in the ledger, someone will read it as COGS, and that is a financial claim
this feature is not prepared to make.

====================================================================
HARD RULES — these override any instinct to be helpful
====================================================================

  1.  Start with CP-INV1 ONLY.
  2.  After EACH checkpoint: STOP and wait for explicit approval. Do not continue.
  3.  Do not skip a checkpoint. Do not merge two checkpoints.
  4.  Do not bundle unrelated features into any checkpoint.
  5.  Do not touch Mobile Scanner v1.7.0 release files, except where a scanner source file
      genuinely must change for inventory lookup compatibility — and say so explicitly when
      you do. Never re-cut or re-version the 1.7.0 release.
  6.  Do not touch customer debts, payments, installments, or receivables.
  7.  Do not touch sales-order payment logic.
  8.  Do not touch supplier financial logic.
  9.  Do not touch Financial Truth Foundation work.
  10. Do not touch the WhatsApp/customer communication feature.
  11. Do not bump the version until CP-INV10 AND explicit user approval. package.json stays
      at 1.7.0 throughout CP-INV1..CP-INV9.
  12. Do not build an installer until explicit user approval at CP-INV10.
  13. Do not commit unless the user approves, and always show the staged file list first.
  14. Do not push.
  15. NEVER run `prisma migrate reset`.
  16. NEVER write destructive SQL: no DROP, no TRUNCATE, no DELETE-based data cleanup, no
      destructive UPDATE of existing business values.
  17. NEVER touch the real business PC database. All migration work is local/dev only, or
      against a RESTORED COPY.
  18. Do not silently fix suspicious data. Report it and ask.
  19. If a checkpoint turns out to be blocked, finish everything in it that is not blocked,
      then say exactly what you left out and why. Do not quietly narrow the scope.

====================================================================
CHECKPOINTS
====================================================================

--- CP-INV1 — BASELINE REVIEW AND RELEASE CLEANLINESS. NO CODE. ---

Write no code. Create no files. Change nothing.

  a) Confirm the Product stock baseline: exact fields, types, defaults, nullability,
     uniqueness. Report anything that differs from the "KNOWN BASELINE" section above.
  b) Report every code path that can currently write Product.stockQuantity. For each: who may
     call it, what it requires (role, password, reason), what it audits, and whether it writes
     an absolute value or a delta.
  c) Confirm no StockMovement/InventoryAdjustment table exists.
  d) Confirm sales orders only READ stock; report where SalesOrderItem.quantity is used and
     what a FUTURE fulfillment deduction would need. Change nothing.
  e) Confirm supplier transactions and service jobs have no stock effect today.
  f) Report the scanner lookup: route, auth, and the EXACT field list it returns. Confirm it
     exposes no price, cost, stock, notes or specifications.
  g) Report every place stock status is currently displayed, and confirm whether the dashboard
     has any stock content.
  h) RELEASE CLEANLINESS: run `git status` and report the working tree. Confirm package.json
     is at 1.7.0.
     The gate is about CODE, not documents. STOP only if there are uncommitted or untracked
     changes under backend/, frontend/, desktop/, or backend/prisma/ that belong to inventory,
     financial-truth, WhatsApp, chart-of-accounts or expense work.
     The following are EXPECTED and are NOT blockers — note them and continue:
       - untracked or modified markdown under claude/ (plans and prompts, including this one)
       - the branch being ahead of origin/main (the v1.7.0 release commit is deliberately
         unpushed)
       - anything under release/ (that path is gitignored)
     Planning documents for excluded features are planning-only. They ship nothing, they
     compile to nothing, and their presence says only that the work was thought about.
  i) Inspect backend/prisma/migrations and backend/prisma/repair. Report the migration
     baseline. ASSUME AS TRUE: the business PC is stable on 1.6.0 with all migrations applied,
     so schema drift is NOT the open problem — data reality is.
  j) Recommend the implementation order and flag anything in the plan the code contradicts.

  DELIVERABLE: a written report ending with (1) the confirmed baseline as a short table,
  (2) top risks in priority order, (3) anything blocking CP-INV2, (4) the open questions the
  user must answer before CP-INV2.
  THEN STOP.

--- CP-INV2 — SCHEMA, MIGRATION, BACKFILL DRAFT ---

  a) Add the StockMovement model and StockMovementType enum to schema.prisma, plus the inverse
     relation on Product. ADDITIVE ONLY: no drops, no renames, no type changes.
  b) Generate the Prisma migration using the LOCAL/DEV workflow only. Never against the
     business PC. Never `migrate reset`.
  c) NO AUTOMATIC BACKFILL. THIS IS A HARD REQUIREMENT, CORRECTED 2026-08-12.
       The existing products.stockQuantity values are NOT verified business data. They came
       from an absolute-overwrite screen with no history and nobody has counted the shelves
       against them. Copying them into OPENING_BALANCE movements would dress unverified data
       as an audited ledger entry — more convincing than the loose number it came from, and
       therefore worse than leaving it alone.

       THE MIGRATION IS SCHEMA-ONLY: table, enum, relations, indexes. It inserts ZERO movement
       rows and modifies ZERO product rows.

       Products are onboarded LATER, per product, only when all five are confirmed: name,
       SKU/barcode (or intentionally blank), active/archived status, trackStock decision, and
       a PHYSICAL COUNT. That is done through the SQL template in release/1.8.0, not by you.

       The three SQL scripts already exist and are the specification — read them before
       writing the migration, and do not duplicate or rewrite them. The TRACKED copies are:
         backend/prisma/repair/inventory-v1.8.0/01_inventory_preflight_report.sql
         backend/prisma/repair/inventory-v1.8.0/02_inventory_opening_balance_template.sql
         backend/prisma/repair/inventory-v1.8.0/03_inventory_reconciliation_check.sql
         backend/prisma/repair/inventory-v1.8.0/README.md
       Duplicates exist under release/1.8.0/ for packaging; that path is GITIGNORED, so the
       backend/prisma/repair/ copies are authoritative. Edit both or neither.
       NOTE: "tracked location" means a version-controlled PATH. The files themselves are
       still untracked (git status '??') because nothing has been committed yet — commits
       require user approval. That is expected, not a problem to fix.
       Do NOT add these to backend/prisma/repair/manifest.json — that file records repairs
       actually applied to a business PC, and two of the three only read.

  c2) TWO CONSEQUENCES YOU MUST DESIGN FOR — with no backfill, every existing product starts
      with a stockQuantity and an EMPTY ledger:

       (i) Reconciliation has THREE outcomes, not two:
             OK                  ledger sum equals stockQuantity
             PENDING_ONBOARDING  no movements at all — EXPECTED, not a failure
             MISMATCH            has movements that do not add up — a REAL defect
           If un-onboarded products reported as failures, everyone would learn to ignore the
           integrity check and it would be useless on the day it mattered.

      (ii) A product with NO OPENING_BALANCE MUST NOT ACCEPT STOCK ACTIONS. Adding 5 units to
           a product whose ledger is empty makes stockQuantity 15 while the ledger sums to 5 —
           permanently unreconcilable. The service layer (CP-INV3) rejects movements against a
           never-onboarded product with:
             'This product needs a verified opening count before stock actions /
              يحتاج هذا المنتج جردًا مؤكدًا قبل حركات المخزون'
           DO NOT auto-create an opening balance from the current stockQuantity at that moment.
           That is the rejected backfill, merely deferred.
  d) SUSPICIOUS ROW REPORT — run detection queries against the LOCAL database and write the
     queries so they can be re-run against a business PC COPY later. Report, with product id /
     SKU / name / value, every row in these categories:
       - stockQuantity < 0            (should be impossible — the CHECK constraint forbids it;
                                      if any row exists, REPORT AND STOP)
       - stockQuantity > 1000         (review threshold)
       - stockQuantity > 10000        (requires an explicit per-row decision)
       - trackStock = true with null/invalid stockQuantity
       - trackStock = false with stockQuantity > 0   (expect real rows here; updateStock
                                      explicitly permits this combination)
       - duplicate or conflicting SKU/barcode
       - archived/inactive products holding stock    (default: DO give them an opening balance
                                      — the stock physically exists)
     Also report the actual distribution of stockQuantity so the 1000/10000 thresholds can be
     tuned to the real catalogue instead of guessed.
     DO NOT FIX ANY OF THEM. DO NOT alter any existing stockQuantity value for any reason.
     Report and ask. Each category needs a user decision before the migration is final.
  e) Draft the repair SQL only if the repo's repair convention genuinely requires it. Read
     backend/prisma/repair/manifest.json first: every entry there is a repair that was actually
     applied on a business PC. Do NOT add a placeholder or no-op entry.
  f) Write the rehearsal checklist for CP-INV9: pre-migration counts, expected post-migration
     movement count, reconciliation assertion, timing.
  g) Tests for the backfill logic if it can be exercised in isolation.

  THEN STOP. Report: migration file path, backfill approach, the suspicious-row report, and
  the exact decisions you need from the user.

--- CP-INV3 — BACKEND SERVICE + TESTS ---

  Implement the stock movement service: addStock, removeStock, correctStockCount,
  markDamagedLost, returnToStock, plus the read helpers. One transaction per change,
  compare-and-set guard, negative guard, before/after recorded, permissions enforced,
  reason required. Reuse runFinancialTransaction and verifyAdminPassword.

  Also implement the reconciliation integrity check and surface it through the existing
  maintenance feature.

  BACKEND TESTS REQUIRED:
    - add stock increases quantity and creates exactly one movement with correct before/after
    - remove stock decreases quantity and creates the movement
    - cannot remove more than available (error names BOTH numbers)
    - correct count records the right signed delta in both directions; zero-delta rejected
    - damage/loss decreases; return to stock increases
    - movement history is newest first
    - low stock detects products at/under threshold; threshold 0 behaves sanely
    - out of stock detects zero
    - untracked products are excluded from low-stock AND rejected for movements
    - an OPENING_BALANCE with quantityChange = 0 is ACCEPTED (verified empty shelf), and the
      product then leaves PENDING_ONBOARDING and can accept later stock actions
    - quantityChange = 0 is REJECTED for MANUAL_ADD, MANUAL_REMOVE, STOCK_COUNT, DAMAGE_LOSS
      and RETURN_TO_STOCK
    - a second OPENING_BALANCE for the same product is rejected by the partial unique index
    - a product with NO movements is classified PENDING_ONBOARDING, never MISMATCH
    - a movement against a never-onboarded product is REJECTED with the onboarding message
    - no code path auto-creates an OPENING_BALANCE from an existing stockQuantity
    - after a verified opening balance, SUM(quantityChange) == stockQuantity
    - products_stockQuantity_check still exists after the migration
    - movement history is append-only: no update/delete path exists; product delete restricted
    - admin/password required for removeStock, correctStockCount, markDamagedLost
    - accountPassword never appears in any audit row, log line, or movement row
    - reason required and non-empty for every movement type
    - compare-and-set: a stale expectedBefore aborts instead of overwriting
    - enabling trackStock on a product with stock creates an OPENING_BALANCE
    - NO sales, debt, payment, supplier or dashboard-financial behavior changed

  THEN STOP.

--- CP-INV4 — API ROUTES + INTEGRATION TESTS ---

  Routes, following the repo's existing feature-folder convention:
    GET  /api/v1/inventory/summary
    GET  /api/v1/inventory/low-stock
    GET  /api/v1/inventory/movements
    GET  /api/v1/products/:id/inventory
    POST /api/v1/products/:id/stock-movements     <- the ONLY quantity write path
    PATCH /api/v1/products/:id/stock              <- repurposed: settings only

  Update frontend productsApi.updateStock, ProductStockSection and their tests IN THIS
  CHECKPOINT so nothing breaks.

  Integration tests: happy paths, permission failures, validation failures, negative-stock
  rejection, untracked rejection, and proof that no route other than the movement endpoint can
  change a quantity.

  THEN STOP.

--- CP-INV5 — PRODUCT INVENTORY PANEL + STOCK ACTION UI ---

  Panel inside the product details drawer: current stock, status badge (reuse
  ProductStockBadge), trackStock, lowStockThreshold, movement history newest-first showing
  who/when/why and before → after.

  Five action dialogs, each with quantity + required reason + optional note + a "12 → 17"
  preview before confirm, and the admin-password field where policy requires it.

  Rework ProductStockSection: the product form now edits trackStock and lowStockThreshold
  only; quantity becomes read-only there with a link into the movement dialog.

  FRONTEND TESTS: panel renders; movement history renders; each form validates; negative-stock
  error displays; no editable quantity field remains outside the dialogs; Arabic/English labels
  render.

  THEN STOP.

--- CP-INV6 — INVENTORY PAGE ---

  /inventory: summary cards, search by name/SKU/barcode, low-stock and out-of-stock and
  tracked/untracked filters, recent stock movements. Register the route and navigation.

  FRONTEND TESTS: page renders; filters render and filter; search works; recent movements
  render.

  THEN STOP.

--- CP-INV7 — SCANNER LOOKUP INTEGRATION ---

  Scanning a barcode/SKU (physical wedge scanner into the inventory search box, or a Scanner
  Hub event) resolves the product and opens its inventory workflow.

  A SCAN CHANGES NO STOCK. The code lands in a lookup field, never an action field.
  Unresolved scan: "Product not found / لم يتم العثور على المنتج" plus the scanned code and a
  manual search option. Never auto-create a product from a scan.

  TESTS: scanner lookup opens the inventory workflow; scanning alone changes no stock; the scan
  payload still exposes no price/cost/stock/notes/specifications.

  THEN STOP.

--- CP-INV8 — DASHBOARD INVENTORY CARDS ---

  Low-stock count, out-of-stock count, recent movements, linking to /inventory.
  Counts only — no valuation, no money, no change to any existing dashboard financial number.

  ALSO: frontend/src/features/dashboard/config/module-registry.ts already has an
  Inventory / المخزون tile at 'NEXT' status with no route. Flip it to 'LIVE' with route
  '/inventory'. Do not add a second tile.

  TESTS: cards render; counts correct; existing dashboard financial totals unchanged.

  THEN STOP.

--- CP-INV9 — MIGRATION REHEARSAL + RELEASE DOCS ---

  Execute the rehearsal checklist against a RESTORED COPY of the business PC database. Never
  the live business PC. If no copy is available, say so and stop — do not substitute the
  laptop database and call it proven.

  Record: pre-migration counts (products, tracked, tracked with stockQuantity > 0), migration
  duration, post-migration movement count, reconciliation result (expect zero discrepancies),
  and the suspicious rows found in REAL data.

  Write release/1.8.0 docs: RELEASE_NOTES.md, the migration/repair notes, the backup-first
  instruction, and the manual verification checklist.

  MANUAL TEST SCRIPT to include:
    create a tracked product; add stock; remove stock; attempt an invalid removal; correct the
    count; mark damage/loss; return to stock; scan the product; check movement history;
    restart the app; confirm stock persists; confirm debts/payments/dashboard financial totals
    are unchanged.

  THEN STOP.

--- CP-INV10 — FINAL RELEASE REVIEW ONLY ---

  Full review: scope cleanliness, test suite green, no excluded-scope files touched, migration
  additive, backfill proven on real data copy, no financial behavior changed.

  DO NOT bump the version to 1.8.0 unless the user explicitly approves after reading the review.
  DO NOT build the installer unless the user explicitly approves after reading the review.
  DO NOT commit until the user approves the staged file list.

  THEN STOP.

====================================================================
START HERE
====================================================================

CP-INV1 IS COMPLETE (2026-08-12) and its findings are folded into this prompt and the plan.
The business gate is answered: the user confirms unknown stock is a real cost, so no two-week
probe is required.

BEGIN CP-INV2. Author the schema, the additive migration and the backfill against the
LOCAL/DEV database, and deliver the suspicious-row report. Touch no business PC database.
Then STOP and wait for approval.
```

---

## Notes for the human running this prompt

- **Re-paste the whole prompt at each checkpoint**, naming the checkpoint you are authorizing ("Proceed with CP-INV3"). A long agent session drifts; the hard rules are what keep it inside the release boundary.
- **CP-INV2's suspicious-row report is the real decision point.** Expect `trackStock = false` products carrying leftover quantities — that is the most common shape of the problem and it needs your ruling, not the agent's.
- **CP-INV9 is not optional and the laptop cannot satisfy it.** If there is no restored copy of the business PC database when you reach it, the honest outcome is to pause the release, not to accept a laptop run as proof.
- **The business gate comes first.** §2 of the plan asks whether unknown stock is actually costing money. Running CP-INV1 before that question is answered is fine — it is review-only — but CP-INV2 onwards spends real effort on a feature that may not be needed.
