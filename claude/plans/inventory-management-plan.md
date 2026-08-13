# Inventory Management — Planning Document

**Release target:** **HomeConnect v1.8.0** — Manual Stock Movement Ledger + Low Stock Visibility + Scanner Lookup Integration.
**Status:** **CP-INV1 through CP-INV10B are complete.** CP-INV10A corrected the helper-SQL/documentation blockers, and CP-INV10B confirmed that document-linked sales deduction and supplier receiving are deferred. Final release authorization was granted: `package.json` is now 1.8.0 and the v1.8.0 installer has been built. The release is staged for review and remains uncommitted pending explicit commit approval.
**Date:** 2026-08-13
**Scope:** Inventory visibility + a manual stock movement ledger. Not ERP inventory, not valuation, not COGS, not purchase orders.
**Revised:** 2026-08-13 — final manual-inventory boundary approved; version bumped and installer packaged pending commit approval.
**Build prompt:** [claude/prompts/codex-inventory-v1.8.0-build.md](../prompts/codex-inventory-v1.8.0-build.md) — the checkpoint-by-checkpoint implementation prompt derived from this plan.

## Release sequence

| Version | Contents | State |
|---|---|---|
| **1.6.0** | Scanner Hub desktop (LAN listener, pairing, sessions, hardening) | **installed and stable on the business PC** |
| **1.7.0** | Mobile Scanner phone app; desktop functionally identical to 1.6.0 | committed (`bf3fa0e`), installer built, **not yet installed** |
| **1.8.0** | **Inventory Management — this plan** | **CP-INV10B complete; installer built; pending commit approval** |

**v1.8.0 must not be bundled with:** Mobile Scanner release work · WhatsApp/customer communication · Financial Truth Foundation · Lebanese Chart of Accounts · expenses · customer debt/payment changes · sales-order payment logic · supplier financial logic · service-job financial truth work.

---

## Business PC Data and Migration Status Note

*Added 2026-08-12. This section supersedes the earlier migration-history risk framing in this document.*

### Current state of the two machines

| | Business PC | Laptop |
|---|---|---|
| HomeConnect version | **1.6.0**, stable | development / testing |
| Migration status | **all migrations applied through 1.6.0** | current |
| Data | **the real business data — substantially more of it** | small, synthetic, not representative |
| Role | production | code correctness only |

**All migrations are applied on the business PC up to 1.6.0.** Schema drift is therefore *not* the outstanding problem it was previously treated as in this plan.

### The actual risk: data reality, not schema drift

The risk that remains is **data volume and data reality**, and it is not addressed by anything the laptop can tell us:

- The laptop proves that a migration **runs**. It cannot prove that a migration **produces correct results on the real product catalogue** — the one with years of accumulated rows, legacy values, half-configured products, and quantities entered through the old absolute-overwrite path.
- Automatic `OPENING_BALANCE` backfill is cancelled. The remaining concern is whether the additive migration preserves the real catalogue unchanged and whether the four-state reconciliation and controlled bulk helper behave correctly on a restored copy.
- Migration *timing* on a large table is also only measurable against real row counts.

**Therefore: the additive inventory migration and corrected helper/reconciliation scripts must be rehearsed on a backup/copy of the business PC database before they are allowed near the business PC itself.** Laptop testing is necessary and not sufficient. The migration creates no opening balances and changes no product rows.

Backup before migration remains mandatory, and the backup must be verified restorable, not merely created.

### Release scope separation

- **HomeConnect 1.6.0** is the version currently installed on the business PC.
- **Mobile Scanner has been prepared as 1.7.0** — committed as `bf3fa0e`, installer built in `release/1.7.0/`, **not yet installed on the business PC**. Its desktop build is functionally identical to 1.6.0; the phone app pairs with either.
- **Inventory is v1.8.0** — a later, separate release, after the business gate (§2) and after the migration rehearsal above.
- Nothing in the inventory work may modify, re-cut, or re-version the 1.7.0 release. If a scanner file must change for inventory lookup compatibility, that is a normal source change in 1.8.0 — it does not reopen 1.7.0.

**Do not combine, in a single release:**

1. the Mobile Scanner release,
2. the inventory migration,
3. Financial Truth Foundation work.

Each touches a different part of the system, and a combined release makes a rollback decision impossible: if something goes wrong on the shop floor, nobody will be able to say which of the three caused it, and rolling back one means rolling back all three.

### Recommended current roadmap

1. ~~Finish the final review of Mobile Scanner.~~ **Done** — reviewed and committed as 1.7.0 (`bf3fa0e`).
2. Install 1.7.0 on the business PC when convenient, or skip it — the phone app pairs with 1.6.0 identically. Either way, this decision is independent of inventory.
3. Run the inventory business gate (§2) on real business products, using the stock fields that already exist in 1.6.0. **No code, no install, no migration required for this step.**
4. Back up / copy the business PC database.
5. Rehearse the additive inventory migration and corrected reconciliation/helpers against that copied business PC data (§8 checklist). Do not auto-create opening balances.
6. Only then implement and release the Inventory `StockMovement` ledger as **v1.8.0**, on its own.

Step 3 and steps 4–5 are independent and can overlap. Step 6 depends on both. Implementation checkpoints CP-INV1 → CP-INV10 are in §15; the Codex build prompt drives them.

---

## 1. Current state review — answers to the ten baseline questions

Verified against the repo, not assumed.

| # | Question | Answer |
|---|---|---|
| 1 | Does `Product` have the fields? | **Yes, all of them.** [schema.prisma:618](backend/prisma/schema.prisma#L618): `sku String @unique` (required), `barcode String? @unique`, `trackStock Boolean @default(false)`, `stockQuantity Int @default(0)`, `lowStockThreshold Int?`, `costPrice Decimal(12,2)?`, `specifications Json?`, `specificationNotes`. |
| 2 | Absolute field or movement history? | **Absolute field only.** `stockQuantity` is set, never incremented. |
| 3 | Any `StockMovement` / `InventoryAdjustment` table? | **No.** Nothing of the kind exists in the schema. |
| 4 | Do sales orders reduce stock? | **No.** [sales-orders.repository.ts:24-26](backend/src/features/sales/sales-orders/sales-orders.repository.ts#L24) only *selects* `trackStock`/`stockQuantity`/`lowStockThreshold` to display in `ProductLinePicker`. `SalesOrderItem` carries `quantity` and an optional `productId` but has zero stock effect. |
| 5 | Do supplier transactions increase stock? | **No.** `SupplierTransaction` is a balance/payable record with no line items and no product link. |
| 6 | Do service jobs consume stock? | **No.** `ServiceJob` has a `productId` relation but never decrements quantity. |
| 7 | Is barcode scanning available? | **Yes.** `GET /products/scan` ([products.routes.ts:23](backend/src/features/service/products/products.routes.ts#L23)) is open to any authenticated user by design, backed by `ProductsService.scanLookup`. Scanner Hub exists as a full feature (sessions, pairing, events, rate limiting) under `backend/src/features/scanner/`. |
| 8 | Product labels with numeric barcodes? | **Yes.** `LabelBarcodeSource` enum with `AUTO` default, plus label export/print pages. |
| 9 | Low-stock alerts shown anywhere? | **Partially — status only, no alerting.** `deriveProductStockStatus` ([product-stock.ts](backend/src/features/service/products/product-stock.ts)) returns `NOT_TRACKED / OUT_OF_STOCK / LOW_STOCK / IN_STOCK`, rendered by `ProductStockBadge` in the product grid, table and details drawer, plus a direct in-stock badge in the sales-order `ProductLinePicker`. There is **no dashboard card, no low-stock page, no low-stock filter, no report**, and `backend/src/features/dashboard/` contains no reference to stock. **Correction (CP-INV1):** the dashboard *does* carry an `Inventory / المخزون` tile at `'NEXT'` status with no route ([module-registry.ts:24](frontend/src/features/dashboard/config/module-registry.ts#L24)) — a placeholder, not operational stock content. **CP-INV8 must flip it to `'LIVE'` with route `/inventory`.** |
| 10 | Are stock changes audited? | **Yes, and more strictly than expected.** `PATCH /products/:id/stock` → `ProductsService.updateStock` ([products.service.ts:420](backend/src/features/service/products/products.service.ts#L420)) runs inside `runFinancialTransaction` and requires `assertServiceAdmin` **plus** `verifyAdminPassword` **plus** a `reason`, then writes a `ServiceAudit` row with `action: CHANGE_STOCK` and `beforeValues`/`afterValues` stock snapshots. |

### The finding that shapes this whole plan

**The current design is strict where it hurts and loose where it matters.**

Every stock change today — including "we received 5 fridges" — requires an **admin account, the admin password, and a written reason**, and it is expressed as an **absolute overwrite**: the employee types the new total, not what changed. The audit trail records `{qty: 12} → {qty: 17}` but never "+5, purchase from supplier X".

That combination produces the classic failure mode:

- Routine receiving is too heavy to do in the moment → it gets deferred → it gets forgotten.
- Because the entry is an absolute set, the person typing it is *guessing the new total*, which quietly overwrites anything that happened in between.
- Once numbers drift, nobody trusts them, so nobody maintains them, and the field decays to decoration.

So the diagnosis is not "HomeConnect has no inventory." It is: **HomeConnect has a stock number that is expensive to update and structurally unable to explain itself.** Inventory v1 should fix the shape of the entry (deltas, typed movements, reasons) and reconsider the friction on the safe direction (adding stock), while keeping the strict controls where they belong (removals, corrections, damage).

Note also: `ServiceAudit` already gives an append-only history of stock edits. A `StockMovement` table is therefore **not needed for audit** — it is needed for *arithmetic and reporting*: signed deltas, typed movement categories, references to source documents, and a reconcilable ledger. Being honest about that distinction keeps the scope small.

---

## 2. Should this be built at all? — the ERP positioning gate

The ERP positioning document's rule applies: the right question is *which single unknown is currently costing the business money*, not *how do we become an ERP*.

Before CP-INV2, the user should answer question 1 in §11 honestly. There is a cheap way to settle it without building anything, and **it uses only the product stock fields that already ship in 1.6.0** — no migration, no new code, nothing to install on the business PC:

**The inventory business gate**

1. Choose ~30 fast-moving or otherwise important products.
2. Enable `trackStock` for them using the existing 1.6.0 product stock fields.
3. Count the current physical stock and enter it.
4. Use the system normally for about two weeks.
5. Count again.
6. Record whether the system's numbers were useful or wrong — and *why* each wrong one was wrong (never entered? entered as the wrong total? sold without anyone updating it?).
7. Decide: **is unknown stock actually costing the business money?**

**If the gate proves inventory matters** — the numbers drifted, or step 5 could not even be attempted because nobody trusted step 3 — continue with `StockMovement` ledger planning and implementation.

**If it does not** — the numbers held, or the drift was harmless — delay the inventory migration and spend the effort on safer workflow improvements instead.

Step 6 is the part that carries the real information. A drift of "we thought 12, we have 9" is a number; *why* those three went missing is what tells you whether a movement ledger would have caught it. **Do not skip to CP-INV2 on the assumption that inventory is obviously valuable.**

---

## 3. Core concept — stored quantity + append-only movement ledger

**Recommended (matches the user's instinct, and matches how the repo already handles financial records):**

- `Product.stockQuantity` **stays** as the fast-read current quantity.
- `StockMovement` is added as the **append-only ledger** of every change.
- Both are written **in one database transaction** — the repo already has `runFinancialTransaction` for exactly this pattern.
- Every movement records `quantityBefore` and `quantityAfter`, so the ledger is self-checking.

Pure derivation (`SUM(quantityChange)` on every read) is rejected: product lists, pickers and the scanner all read stock on hot paths, and a local single-shop app gains nothing from the recomputation.

**The reconciliation invariant:** for every tracked product,
`OPENING_BALANCE + Σ(quantityChange) == Product.stockQuantity`, and the most recent movement's `quantityAfter == Product.stockQuantity`.

This should be exposed as a **Stock integrity check** in the existing `backend/src/features/maintenance/` module, and asserted in tests. It is what makes the dual-write design safe rather than merely fast: if the two ever diverge, the app can say so instead of quietly lying.

### Concurrency

Desktop app and phone scanner can both act. Use, inside the transaction:

```
updateMany({ where: { id, stockQuantity: expectedBefore }, data: { stockQuantity: after } })
→ assert count === 1, else abort with a "stock changed, please retry" error
```

This is a compare-and-set guard with no raw SQL and no `FOR UPDATE`. On conflict, **fail loudly and re-read** — never retry blindly with a stale `before`, because that is precisely how a lost update happens.

---

## 4. Data model plan

### New model — `StockMovement`

```
id             String    @id @default(uuid()) @db.Uuid
productId      String    @db.Uuid          → Product, onDelete: Restrict
movementType   StockMovementType
quantityChange Int                          // signed: +5 / -3; zero ONLY for OPENING_BALANCE
quantityBefore Int
quantityAfter  Int
reason         String    @db.Text           // required, non-empty
note           String?   @db.Text
referenceType  String?                      // 'SALES_ORDER' | 'SERVICE_JOB' | 'SUPPLIER' | 'MANUAL'
referenceId    String?   @db.Uuid
createdById    String?   @db.Uuid          → User?, onDelete: Restrict
createdAt      DateTime  @default(now())

@@index([productId, createdAt])
@@index([movementType, createdAt])
@@index([createdAt])
@@map("stock_movements")
```

`Int` throughout — appliances are whole units. No `Decimal`, no fractional quantities. If a future product needs fractions (cable by the meter), that is a separate decision, not a silent widening.

### The zero-quantity opening balance — settled 2026-08-12

An earlier draft said `quantityChange` may **never** be zero. CP-INV2 found that this makes a physically-counted empty shelf unrecordable: verified count `0` → `OPENING_BALANCE(0)` → rejected → the product stays `PENDING_ONBOARDING` forever → and because un-onboarded products refuse stock actions, **a product genuinely holding nothing could never receive its first unit.** A real deadlock, caught before any schema was written.

**Rule:** `quantityChange <> 0` for every movement type **except** `OPENING_BALANCE`, which may be zero.

The never-zero rule exists to stop meaningless no-op movements — someone clicking *Add 0 units* and littering the ledger. That concern applies to the four manual types. It does not apply to an opening balance, which is once per product, idempotency-guarded, and where zero carries real information: *counted on this date by this person, found none*.

I also considered exempting zero-stock products from the onboarding gate instead (arithmetically, a product at 0 with an empty ledger does reconcile). Rejected: it discards the "we verified none" record, and it turns one uniform rule into a conditional that the reconciliation's "activity without opening balance" check would also have to special-case.

### Database constraints on the new table

`stock_movements` is brand new, so CHECK constraints on it are purely additive and carry none of the risk that changing `products` would. Use them — the repo already does this on `products`, and a constraint is worth more than a service-layer guard because it survives every future code path:

```sql
CHECK ("quantityBefore" + "quantityChange" = "quantityAfter")
CHECK ("quantityBefore" >= 0 AND "quantityAfter" >= 0)
CHECK ("quantityChange" <> 0 OR "movementType" = 'OPENING_BALANCE')
CHECK ("movementType" <> 'OPENING_BALANCE' OR "quantityBefore" = 0)
CHECK (btrim("reason") <> '')
```

Plus a **partial unique index** making duplicate opening balances structurally impossible rather than merely detectable:

```sql
CREATE UNIQUE INDEX "stock_movements_one_opening_balance_per_product"
  ON "stock_movements" ("productId")
  WHERE "movementType" = 'OPENING_BALANCE';
```

Prisma cannot express a partial unique index in the schema, so it goes in the migration as raw SQL — normal, additive, and it retires section 5 of the reconciliation script from "a check that might fail" to "a check that cannot fail".

**Inverse relations:** `Product.stockMovements StockMovement[]` **and** `User.stockMovements StockMovement[]`. Prisma requires the inverse on both sides of the `createdBy` relation; omitting the `User` side will fail validation.

**No `negativeAllowed` column.** An earlier draft carried one, for an admin override that let stock go negative. **That override is cancelled** — see §7. With negative stock impossible, a flag that can never be true is dead weight in an append-only ledger, and its presence would invite someone to wire it up later without revisiting the constraint question.

**`createdById` is nullable, deliberately.** Every *app-initiated* movement carries the acting user, and the service layer enforces that. The controlled bulk onboarding helper may run without a designated app user, in which case `NULL` honestly means “controlled system onboarding”; it must never invent a real person's identity. The automatic migration backfill is cancelled and creates no movements.

### New enum — `StockMovementType`

**v1 active:** `OPENING_BALANCE`, `MANUAL_ADD`, `MANUAL_REMOVE`, `STOCK_COUNT`, `DAMAGE_LOSS`, `RETURN_TO_STOCK`

**Reserved, not yet emitted:** `PURCHASE_RECEIPT`, `SALE_FULFILLMENT`, `SALE_CANCEL_RESTORE`, `SERVICE_PART_USED`

Declaring the future values in the enum now is deliberate: adding an enum value later is another migration against the business database. Declaring them costs nothing and no code path emits them in v1.8.0 — a fact enforced by a test, not by naming.

**No `FUTURE_` prefix — these are the final names.** A prefix would have to be renamed the day the feature ships, and renaming a Postgres enum value on a live business database is a materially worse migration than adding one. "Reserved" is a property of the code paths, not of the identifier. (An earlier draft of the Codex build prompt said `FUTURE_PURCHASE_RECEIPT` and similar; that has been corrected to match this section.)

### Not added in v1

- **`InventoryLocation` / warehouse** — one shop, one stock pool. Adding a location dimension now means every query, every UI and every movement carries a field that is always the same value. Add it only when a second physical location actually exists (open decision 6).
- **Serial/lot tracking, valuation layers, cost snapshots on movements.** Note: `Product.costPrice` exists, so a *future* valuation report is possible, but v1 must not write cost onto movements — the moment cost lands in the ledger, people will read it as COGS, and that is a financial claim this feature is not prepared to make.

### Product model changes

**None.** `trackStock`, `stockQuantity`, `lowStockThreshold` already exist and are correct. Adding an inverse relation `stockMovements StockMovement[]` is a schema-file-only change with no column impact.

---

## 5. Verified onboarding — automatic backfill cancelled

> **Settled 2026-08-12:** automatic copying of existing `stockQuantity` values into `OPENING_BALANCE` movements is cancelled. The schema migration is additive and schema-only: it creates no movements and changes no product row.

### Explicit verified onboarding

The existing `products.stockQuantity` values are **not verified business data**. They were entered through an absolute-overwrite screen with no history, and nobody has counted the shelves against them.

Copying those numbers into `OPENING_BALANCE` movements would dress unverified data as an audited ledger entry — signed, timestamped, and far more convincing than the loose number it came from. That is *worse* than leaving the number alone, because the next person would believe it. **The physical count is the truth; the old `stockQuantity` is only a hint about which products to go and count.**

**The Prisma migration is therefore schema-only.** It creates the table, the enum, the relations and the indexes. It inserts **zero** movement rows and modifies **zero** product rows.

Products are onboarded afterwards, in small batches, per product, only once all five conditions hold:

1. product name confirmed as the real product
2. SKU / barcode confirmed, or confirmed as intentionally blank
3. active / archived status confirmed
4. `trackStock` decision confirmed
5. **physical count confirmed by someone who counted the units**

Onboarding sets `quantityBefore = 0`, `quantityChange = quantityAfter = verified count`, records the superseded prior quantity in the movement `note`, and aligns `products.stockQuantity` to the counted number. Until then the product's `stockQuantity` is left exactly as it is: not zeroed, not tracked-toggled, not touched.

**CP-INV9B application flow:** normal product onboarding is available inside the app through the admin-only **Verify Opening Count / تأكيد الجرد الافتتاحي** action. The action accepts a physical count (including zero), reason/note and account password, then creates the single `OPENING_BALANCE`, enables `trackStock`, aligns `stockQuantity`, and records the acting administrator in one transaction. **Opening balance is created only through this explicit verified opening-count transaction. It never copies an existing `stockQuantity` automatically. Enabling `trackStock` alone also never copies or creates an opening balance.**

The SQL opening-balance template remains available for controlled bulk onboarding only. It is not the normal daily product-onboarding interface.

### The consequence that must be designed for: pre-onboarding products

With no automatic backfill, existing products begin with an empty ledger. Their state is determined by the four-state classifier; normal untracked zero-stock products are not onboarding work. Two rules follow:

1. **Reconciliation has four outcomes** — `NOT_IN_INVENTORY` (untracked, zero quantity, no movements), `PENDING_ONBOARDING` (tracked or carrying a quantity but lacking an opening balance), `OK` (opening ledger reconciles), and `MISMATCH` (movement history exists but does not reconcile). Normal untracked catalogue products must never inflate the onboarding queue.

2. **A product with no `OPENING_BALANCE` must not accept stock actions.** If an employee adds 5 units to a product whose ledger is empty, `stockQuantity` becomes 15 while the ledger sums to 5 — permanently unreconcilable, and no later count can explain the gap. The service layer must reject movements against a product that has never been onboarded, with a clear message:
   `This product needs a verified opening count before stock actions / يحتاج هذا المنتج جردًا مؤكدًا قبل حركات المخزون`
   and route the user to the opening-count flow. Auto-creating an opening balance from the current `stockQuantity` at that moment is exactly the rejected backfill, merely deferred — do not do it.

### SQL artifacts

Three authoritative tracked scripts live in `backend/prisma/repair/inventory-v1.8.0/`; packaging copies are refreshed into gitignored `release/1.8.0/`:

| File | What it does | Safety |
|---|---|---|
| `01_inventory_preflight_report.sql` | Reports current stock state: headline counts, quantity distribution, negative stock, untracked-with-stock, active/inactive with stock, >1000 and >10000, missing and duplicate identifiers, onboarding progress. | **Read only.** SELECT only. |
| `02_inventory_opening_balance_template.sql` | Controlled bulk-onboarding template with an **empty** product list. Applies physical counts for explicitly listed product ids only. Guards on unknown ids and negative counts, completely skips already-onboarded products, and defaults to `ROLLBACK`. | Writes only newly-onboarded listed products; never infers a count, deletes data, or touches financial tables. |
| `03_inventory_reconciliation_check.sql` | `NOT_IN_INVENTORY` / `PENDING_ONBOARDING` / `OK` / `MISMATCH` summary, plus last-movement drift, broken movement rows, duplicate opening balances, activity-without-opening-balance, pending queue, and a check that the negative-stock constraint still exists. `OK` requires an opening balance. | **Read only.** |

### Suspicious rows must be reported, never silently fixed

The preflight and controlled onboarding process will meet data that does not fit the model. **It must report those rows and stop for a decision — it must not quietly normalize them.** The schema migration never cleans or backfills product data.

Categories the preflight must detect and list, with product id / SKU / name / value:

| Category | Why it matters | Default disposition (user confirms at CP-INV2) |
|---|---|---|
| `stockQuantity < 0` | The DB CHECK constraint (§7) makes this impossible unless the constraint was bypassed. If any row appears, something is badly wrong. | **Report and stop.** Do not migrate until explained. |
| `stockQuantity > 1000` | Almost certainly a typo through the old absolute-overwrite path. | Report for eyeball review; never copy it automatically. |
| `stockQuantity > 10000` | For an appliance shop this is not a plausible on-hand count. | **Report and require a physical count** before onboarding. |
| `trackStock = true` with `stockQuantity` null/invalid | Nothing sensible to open the ledger with. `NOT NULL DEFAULT 0` should prevent it; verify. | Report; expect zero rows. |
| **`trackStock = false` with `stockQuantity > 0`** | The most common real case, and `updateStock` explicitly permits it (CP-INV1 confirmed the route accepts `trackStock = false` alongside a positive quantity). Gets no opening movement, so enabling tracking later diverges the two truths immediately. | Leave the quantity untouched, create no movement, and **list every row** so the user knows which products will need an opening balance when tracking is switched on. |
| Duplicate or conflicting SKU/barcode | Scanner lookup resolves by both, and `scanLookup` already returns `alsoMatchedSku` for the cross-collision case. A collision makes "which product did I just adjust?" ambiguous. | Report. Do not deduplicate. |
| Archived/inactive products holding stock | Decide whether they carry an opening balance or are excluded. | **Give them an opening balance.** The stock physically exists; excluding it would make the ledger disagree with the shelf. |

The thresholds above are starting values — CP-INV2 should report the actual distribution of `stockQuantity` on real data so they can be tuned to the catalogue rather than guessed.

The decision on each category belongs to the user, not to whoever runs a script. Under no circumstances may the migration infer an opening count from an existing `stockQuantity`.

---

## 6. API plan

Existing style: feature folders under `backend/src/features/`, routes/controller/service/repository/validator + colocated tests.

| Method | Route | Auth | Notes |
|---|---|---|---|
| `GET` | `/api/v1/inventory/summary` | any authenticated | tracked count, low-stock count, out-of-stock count, recent movements |
| `GET` | `/api/v1/inventory/low-stock` | any authenticated | tracked products at/below threshold + out of stock, searchable |
| `GET` | `/api/v1/inventory/movements` | any authenticated | global ledger, filters: product, type, date range, user |
| `GET` | `/api/v1/products/:id/inventory` | any authenticated | current stock, status, threshold, movement history (product stock card) |
| `POST` | `/api/v1/products/:id/stock-movements` | see §7 | **the single write path**: `{ movementType, quantity, reason, note?, referenceType?, referenceId?, allowNegative?, accountPassword? }` |
| `PATCH` | `/api/v1/products/:id/stock` | admin + password *(existing)* | **repurposed → settings only**: `trackStock`, `lowStockThreshold`. Quantity changes move to the endpoint above. |

**The `PATCH /products/:id/stock` change is a behavior change to a shipped endpoint** and must be called out at release: after this, that route can no longer set a quantity directly. That is the point — one write path means the ledger cannot be bypassed — but the frontend `productsApi.updateStock` ([products.api.ts:40](frontend/src/features/products/api/products.api.ts#L40)) and `ProductStockSection` both call it today and must be updated in the same checkpoint, or stock editing breaks.

**Write-path requirements**

- Backend is authoritative; the client never computes the new total.
- The request carries a **delta** (`quantity`, always positive) plus a `movementType` that determines the sign. `STOCK_COUNT` is the sole exception: it carries a **target total**, and the server computes the delta. Never let the client send both a delta and a total.
- **A `STOCK_COUNT` that matches the current quantity writes no movement.** The delta would be zero, and the zero exception belongs to `OPENING_BALANCE` alone — widening it to a second type makes the rule hard to reason about. Return `Count matches current stock. Nothing to record. / الجرد مطابق للمخزون الحالي. لا يوجد ما يُسجَّل.` A ledger row saying nothing happened is worse than no row, because nothing did. A dated "verified correct today" record would be a stock-count-*session* concept, not a movement — future work, not this release.
- Integer validation: positive, non-zero, within a sane bound (reject 1,000,000-unit typos).
- Whole thing inside `runFinancialTransaction`, with the compare-and-set guard from §3.
- Reject the movement if it would drive a tracked product below zero, unless an admin explicitly overrode (§7).
- Untracked products: reject stock movements outright with a clear message rather than silently tracking them.
- Response returns the updated stock summary so the UI never guesses.
- **No delete endpoint, no update endpoint.** The ledger is append-only. A mistaken movement is corrected by a compensating movement with a reason — never by erasure.

---

## 7. Permissions, negative stock, and safety

### Current policy

Everything requires admin + `accountPassword` + reason. That is the existing security posture, and **loosening it is the user's decision, not an implementation detail** (open decisions 4 and 5).

### Approved policy — settled 2026-08-12

| Action | Direction | Policy |
|---|---|---|
| View inventory, scan, view history | — | any authenticated user |
| `MANUAL_ADD` (receiving) | increases | **employee allowed, reason required, no password** — this is the change that makes the feature survive contact with daily work |
| `RETURN_TO_STOCK` | increases | employee allowed, reason required |
| `MANUAL_REMOVE` | decreases | **admin + password + reason** |
| `STOCK_COUNT` correction | either | **admin + password + reason** |
| `DAMAGE_LOSS` | decreases | **admin + password + reason** |
| Negative-stock override | — | **Does not exist.** Cancelled — see §7 negative stock. |
| Change `lowStockThreshold` / `trackStock` | — | admin (password per existing policy) |
| Archive/delete a product holding stock | — | admin, blocked while `stockQuantity > 0` unless zeroed through a movement first |

The asymmetry is deliberate: **adding stock is self-limiting** (an inflated count gets caught the next time someone looks at the shelf) while **removing stock is how shrinkage gets hidden**. Guard the direction that can conceal a loss.

This was put to the user as an explicit choice on 2026-08-12, with the alternative (keep admin+password on everything, receiving stays a manager task) stated plainly. The user chose the asymmetric policy above. It is approved, not assumed.

### Negative stock — settled: forbidden absolutely in v1.8.0

**Decided 2026-08-12 on the strength of a CP-INV1 finding.** The database already forbids it:

```sql
-- migrations/20260804090000_add_product_sku_stock_specifications/migration.sql:39
ADD CONSTRAINT "products_stockQuantity_check" CHECK ("stockQuantity" >= 0)
```

The admin negative-stock override proposed in earlier drafts is therefore **cancelled**, not deferred. Implementing it would require dropping or replacing a live CHECK constraint on the business database — exactly the kind of non-additive migration this release forbids. Trading a hard database guarantee for an occasional convenience is a bad deal: the constraint is the last line of defence if a service-layer guard is ever bypassed, and it costs nothing while stock stays non-negative.

Consequences:

- No `negativeAllowed` column (§4).
- The service layer rejects any movement that would drive stock below zero. The DB constraint stays as the backstop, never as the primary error path — users must see a clear message, not a Postgres constraint violation.
- Untracked products are exempt because no movement may target them at all.
- **A test must assert the constraint still exists after the inventory migration.** An additive migration that silently loosened it would be the worst possible outcome of this release.

UI message, bilingual — one message, no override path:

- `Cannot remove 5 units — only 2 available / لا يمكن سحب 5 قطع — المتوفر 2 فقط`

If the business later genuinely needs negative stock (goods sold before receipt is recorded), that is a separate change with its own constraint migration and its own conversation — not a flag smuggled in here.

### Non-negotiables

- No silent stock changes, ever — every change produces a movement row.
- No automatic deduction from sales orders in v1.
- No automatic receiving from supplier transactions in v1.
- No hard delete of movements; no cascade delete from `Product` (`onDelete: Restrict`).
- Never store or log `accountPassword` — follow the existing `verifyAdminPassword` path exactly.

---

## 8. Migration and release safety — the biggest risk in this plan

**This feature requires a migration, and that is where it can fail.**

*Revised 2026-08-12.* An earlier draft of this section treated the business PC's migration history as the blocker. That framing is out of date: **the business PC is stable on 1.6.0 with all migrations applied**, and the repo's `backend/prisma/repair/` convention exists if a hand-run path is ever needed again. The real risk has moved from *schema drift* to *data reality*.

### What the rehearsal gates — authoring vs. releasing

**The real-data rehearsal gates the RELEASE, not the writing of the migration.** An earlier draft of this section said the rehearsal was a prerequisite "before CP-INV2"; that was written when CP-INV2 meant *migration plan only, no code*. Under the current checkpoint structure CP-INV2 authors real migration files, and it would be circular to demand a rehearsal of a migration that does not exist yet.

The correct sequencing:

| Stage | What happens | Data used |
|---|---|---|
| **CP-INV2** | Write the schema-only additive migration and controlled-onboarding helper draft. Run the **detection queries** and deliver the suspicious-row report. | local/dev database |
| **CP-INV3 – CP-INV8** | Build and test the feature. | local/dev database |
| **CP-INV9** | **Rehearse the additive migration and reconciliation on a restored copy of the business PC database.** | copy of real data |
| **CP-INV9B** | Implement and accept in-app verified opening-count onboarding and four-state reconciliation. | isolated acceptance database |
| **CP-INV10 / 10A / 10B** | Final review found and corrected helper/document blockers; the integration review then deferred document-linked sales deduction and supplier receiving to a future release. Final bump/package authorization was granted separately. | — |

**Nothing may be installed on the business PC until CP-INV9 has passed on a restored copy.** That is the hard gate. Writing the migration earlier is not only allowed, it is required — you cannot rehearse what you have not written.

Requirements:

1. **The migration and corrected helper/reconciliation scripts must be proven against a newly restored copy of the business PC database before release.** A laptop run is not a substitute for the real catalogue. Automatic opening-balance backfill is cancelled.
2. **Additive only** — one new table, one new enum, and inverse relations. No product-row writes, drops, column type changes, renames, or resets.
3. **Backup before migration**, verified restorable — restore it somewhere and open it — before anything runs on the business PC.
4. **Verify after migration**: run the integrity check (§3) immediately and confirm every tracked product reconciles. That is the go/no-go signal.
5. **Do not bundle this release with the Financial Truth Foundation work.**
6. **Do not bundle with the Mobile Scanner release.** Mobile Scanner is finished but unreleased and should ship on its own version bump, separately and probably first (see the Business PC Data and Migration Status Note near the top).

Recommended release shape: inventory ships alone, after a full verified backup, with the integrity check as the acceptance gate.

**Where the SQL scripts live.** The authoritative files are tracked in `backend/prisma/repair/inventory-v1.8.0/`. Packaging copies live in gitignored `release/1.8.0/` and must be refreshed from the tracked source. **Do not add the helpers to `manifest.json` unless one is actually applied to the business PC** — the manifest records applied repairs, not packaged reports/templates.

### CP-INV9 rehearsal — EXECUTED 2026-08-12 on real business data

Restored `homeconnect-2026-08-12-133854-manual.backup` (the only file in the backup folder absent from the local app's index, i.e. copied from the business PC) into scratch database `homeconnect_rehearsal_real` on `localhost:5433`. The business PC and the dev database were never touched.

**Confirmed as real business data:** 90 products · 167 customers · 124 debts · 112 payments · 32 installment plans · 20 sales orders · 22 service jobs · 7 suppliers · 25 applied migrations (a fully-migrated 1.6.0).

| Check | Result |
|---|---|
| Restore | clean, 3.0s, exit 0 |
| Migration (`20260812090000_add_stock_movements`) | applied in **6.6s**, only that one |
| Product fingerprint before → after | `d98729f2…` → `d98729f2…` **identical** |
| Products / customers / debts / payments after | 90 / 167 / 124 / 112 — unchanged |
| `stock_movements` rows created | **0** |
| Enum values / CHECKs / FKs / indexes / partial unique | 10 / 5 / 2 / 5 / 1 |
| `products_stockQuantity_check` | still present |
| Reconciliation | 0 OK · 0 pending · **90 NOT_IN_INVENTORY** · **0 MISMATCH** |

**The headline finding: on real business data, not one product is tracked.** All 90 have `trackStock = false`, `stockQuantity = 0`, and no `lowStockThreshold`. Zero rows in every suspicious category — no negatives, no untracked-with-stock, no high quantities, no SKU/barcode collisions, no blank SKUs, no inactive-with-stock.

Two consequences that outrank everything else in this plan:

1. **The migration is provably safe, and the onboarding design has nothing to onboard.** The verified-opening-balance work was the right call on principle, but on this data there is no stale quantity to protect against — the shop has never used the stock fields. Risk to existing data: none, demonstrated.

2. **v1.8.0 ships an empty inventory system.** Every one of the 90 products needs `trackStock` enabled *and* a verified opening count before it can do anything. The release delivers no value on install day; it delivers value only after someone counts shelves. That is a business commitment, not a software one, and it should be planned before the installer is built.

**Only 4 of 90 products have a barcode.** Scanner lookup on the shop floor will be effectively SKU-only, so the inventory scan workflow must not assume barcodes — and printing SKU labels may be a prerequisite for the scanner path to be useful at all.

**A defect this rehearsal caught:** section 1 of the reconciliation script classified all 90 products as `PENDING_ONBOARDING` while sections 1b and 7 reported 0, because those filtered to `trackStock OR stockQuantity > 0`. On the laptop's 2 tracked products the disagreement was invisible. Fixed by adding a fourth bucket, `NOT_IN_INVENTORY`, for products that are untracked and empty: they are not waiting to be counted, and counting them as "pending" would have shown the shop a 90-item work queue that does not exist. **Verify the app's own `pendingOnboarding` counter (inventory service / dashboard cards) uses the same four-way classification** — if it inherited the two-way logic, the dashboard will overstate the queue in exactly the same way.

**Rehearsal checklist for the corrected release files**

- restore a copy of the business PC database onto a non-production machine
- record `COUNT(*)` of products, of `trackStock = true`, and of `trackStock = true AND stockQuantity > 0` **before** migrating
- run the schema-only migration; record wall-clock duration and confirm the product fingerprint is unchanged
- confirm the migration creates zero `OPENING_BALANCE` rows
- run the corrected four-state integrity check; expect zero mismatches
- physically count the first controlled app-onboarding batch rather than inferring it from legacy quantities

---

## 9. Frontend plan

**New page:** `Inventory / المخزون` at `/inventory`, registered in [App.tsx](frontend/src/App.tsx#L66) alongside `products`.

- summary cards: tracked products · low stock · out of stock · movements today
- search + scan input (accepts scanner keyboard-wedge input directly)
- filters: low stock · out of stock · tracked · untracked
- recent movements list (product, type, ±qty, who, when, reason)

**Product Inventory Panel** — inside the product details drawer, extending the existing `Stock / المخزون` section at [ProductDetailsDrawer.tsx:91](frontend/src/features/products/components/ProductDetailsDrawer.tsx#L91):

- current quantity, `ProductStockBadge` (reuse — already exists), threshold
- movement history (newest first) with before → after per row
- action buttons: Add stock · Remove stock · Correct count · Damage/loss · Return to stock
- each action opens a small dialog: quantity, **required reason**, optional note, and — for the guarded actions — the existing admin-password field pattern
- the dialog shows `12 → 17` **before** the user confirms. Preview the result, always.

**`ProductStockSection`** ([ProductStockSection.tsx](frontend/src/features/products/components/ProductStockSection.tsx)) must be reworked: today it edits quantity as a free number field in the product form. After v1, the product form edits **`trackStock` and `lowStockThreshold` only**, and quantity becomes read-only there with a "Adjust stock" link into the movement dialog. Its subtitle — *"Basic recorded quantity only; no automatic stock movements"* — gets replaced. Leaving a second editable quantity field anywhere would defeat the single-write-path rule.

**Dashboard:** a low-stock/out-of-stock card in the existing dashboard alerts area (which currently has no stock content at all), linking to the Inventory page.

**Labels:** extend `businessLabels` with an `inventory` group, following the existing `'English / عربي'` single-string convention.

---

## 10. Scanner integration

Reuse what exists — `GET /products/scan` and the Scanner Hub session/event infrastructure. No changes to the Mobile Scanner app internals.

Flow:

1. Scan a barcode or SKU (physical wedge scanner into the Inventory page search box, or a phone scan arriving as a Scanner Hub event).
2. Product resolves → the Product Inventory Panel opens with current stock and status.
3. Employee picks an action, types a quantity and a reason, confirms.

**A scan never changes stock.** Scanning identifies; a human decides. This is not a nicety: a wedge scanner that fires into a focused quantity field will happily "receive" whatever passes the beam, and the resulting ledger is worse than no ledger. The scan lands in a lookup field that is not an action field.

Unresolved scan → "Product not found / لم يتم العثور على المنتج" plus the scanned code, with an option to search manually. Never auto-create a product from a scan.

---

## 11. Open decisions for the user

> **Decisions 1, 3, 4 and 5 were settled by the user on 2026-08-12.** They are recorded here as closed; do not re-open them in later checkpoints.

1. **Is unknown stock currently costing money?** → **DECIDED: yes.** The user confirms from day-to-day experience; the two-week probe in §2 is waived and CP-INV2 is authorized. §2 is retained as the reasoning record, not as a pending gate.
2. **Inventory now, or after the Mobile Scanner app?** → *Recommend after.* Mobile Scanner is **finished but unreleased**; it should get its final review and its own separate version bump first. Inventory is far more useful once scanning is reliable, and shipping them together would make a shop-floor rollback undiagnosable.
3. **Forbid negative stock?** → **DECIDED: yes, absolutely, with no override** (§7). CP-INV1 found the DB already enforces `stockQuantity >= 0` via a CHECK constraint; the proposed admin override is cancelled rather than deferred, because it would require a non-additive constraint migration.
4. **May employees add stock without the admin password?** → **DECIDED: yes.** `MANUAL_ADD` and `RETURN_TO_STOCK` are employee-permitted with a required reason and no password. The user approved this on 2026-08-12 knowing it relaxes today's policy in the add direction only.
5. **Must removing stock require the admin password?** → **DECIDED: yes**, unchanged from today. `MANUAL_REMOVE`, `STOCK_COUNT` and `DAMAGE_LOSS` keep admin role + account password + reason.
6. **One location or several?** → *Recommend one.* No `InventoryLocation` until a second real location exists.
7. **Store `stockQuantity` or derive it?** → *Recommend stored + ledger in one transaction*, with the integrity check.
8. **Link stock to sales/service/supplier now?** → *Recommend manual only in v1*, with `referenceType`/`referenceId` available so an employee can attach a sales order or service job by hand.
9. **Defer valuation/cost reports?** → *Recommend yes, firmly.* `costPrice` exists, which makes it tempting; a valuation number that isn't COGS-correct will be read as profit and will be wrong.
10. **Separate release from financial-truth and mobile-scanner work?** → *Recommend yes, firmly* (§8 and the Business PC Data and Migration Status Note). Three separate releases: Mobile Scanner (likely 1.7.0, user's call, not now), then inventory, with Financial Truth Foundation on its own track.

---

## 12. Reports

**v1:** low stock · out of stock · stock movement report (filter by product/type/date/user) · product stock card (single-product statement) · recent adjustments.

**Deferred:** valuation, COGS, inventory aging, purchase receiving, warehouse transfers, dead-stock analysis.

---

## 13. Testing plan

**Backend**
- `MANUAL_ADD` increases `stockQuantity` and writes exactly one movement with correct `quantityBefore`/`quantityAfter`
- `MANUAL_REMOVE` decreases likewise
- removal beyond available is rejected for tracked products; error names both numbers
- `STOCK_COUNT` accepts a target total and computes the correct signed delta (both directions, and zero-delta rejected)
- `DAMAGE_LOSS` and `RETURN_TO_STOCK` write correct types and signs
- movement on an untracked product is rejected
- opening balance is created only by the explicit admin verified opening-count transaction; toggling `trackStock` never copies the existing quantity or silently creates a movement
- **reconciliation invariant**: `Σ(quantityChange) == stockQuantity`, and last `quantityAfter == stockQuantity`
- compare-and-set guard: a stale `expectedBefore` aborts rather than overwriting
- movements are append-only — no delete/update path exists; deleting a product with movements is restricted
- low-stock summary respects `lowStockThreshold`; out-of-stock detects zero; **untracked products never appear in either**
- threshold of `0` behaves sanely (0 stock = out of stock, not low stock)
- admin password required for the guarded actions; **password never appears in any audit, log, or movement row**
- reason is required and non-empty for every movement type
- history sorted newest first; pagination stable

**Frontend**
- Inventory page, summary cards, low-stock/out-of-stock filters render
- product inventory panel + movement history render
- each action dialog renders, previews `before → after`, and requires a reason
- negative-stock error message displays with both quantities
- scanner lookup opens the panel and changes no stock
- product form no longer offers a free-text quantity field
- Arabic/English labels render; Arabic content uses `dir="auto"`

**Manual (on a copy of business data)**
- create a tracked product, set opening stock, scan it, add, remove, correct the count, try to over-remove, mark damaged, return to stock
- verify movement history reads as a coherent story with names and reasons
- verify the low-stock alert and dashboard card
- restart the app and confirm stock and history are intact
- run the integrity check and confirm zero discrepancies
- confirm debts, payments, sales order totals and dashboard financial numbers are unchanged

---

## 14. Out of scope for v1

Full ERP inventory · FIFO/weighted average · COGS · GL/accounting postings · purchase orders · supplier bills with line items · automatic sales deduction · automatic supplier receiving · warehouse transfers · multi-location · serial/lot tracking · barcode generation changes · profit calculation · tax/VAT · reorder-point automation · supplier lead times · Mobile Scanner app changes beyond existing lookup.

---

## 15. Checkpoints

These are the checkpoints the Codex build prompt executes. **Each one ends in a hard stop and waits for approval.** No checkpoint may be skipped or merged into its neighbour.

| ID | Scope | Exit gate |
|---|---|---|
| **CP-INV1** | **Review only, no code.** Confirm the §1 baseline, the scanner/sales/supplier/dashboard reality, and release cleanliness (working tree contains no inventory/financial/WhatsApp work). | User answers open decisions 1–5 and the CP-INV2 suspicious-row questions. |
| **CP-INV2** | `StockMovement` model + `StockMovementType` enum + **schema-only additive** Prisma migration + controlled-onboarding helper draft. **Local/dev migration workflow only** — never the business PC. | Suspicious-row report delivered (§5); automatic backfill remains cancelled. §8 rehearsal checklist written. |
| **CP-INV3** | Backend stock movement service: one transaction, compare-and-set guard, negative guard, before/after, permissions. Backend unit tests. | Reconciliation invariant passes. |
| **CP-INV4** | Inventory API routes + integration tests; `PATCH /products/:id/stock` repurposed to settings-only. | Single write path proven — no route can change a quantity except the movement endpoint. |
| **CP-INV5** | Product inventory panel + the five stock action dialogs; `ProductStockSection` reworked. | No editable quantity field remains anywhere outside the movement dialogs. |
| **CP-INV6** | Inventory page: summary cards, low-stock/out-of-stock filters, search, recent movements. | |
| **CP-INV7** | Scanner lookup → inventory workflow. | Scanning still changes no stock on its own. |
| **CP-INV8** | Dashboard inventory cards (counts and recent movements only). | No valuation, no money on the dashboard. |
| **CP-INV9** | Migration rehearsal executed against a **copy** of business PC data; `release/1.8.0/` docs and repair notes. | Schema-only migration preserved the product fingerprint and created zero movements; backup/restore verified. |
| **CP-INV9B** | Admin-only in-app verified opening count; `NOT_IN_INVENTORY` / `PENDING_ONBOARDING` / `OK` / `MISMATCH` classification. | **Implemented and accepted:** zero/nonzero onboarding works; duplicate/unauthorized/invalid attempts fail; actions unlock; untracked zero-stock products do not inflate pending. |
| **CP-INV10** | Final release review. Initial review found helper-SQL/documentation blockers. | **Completed after CP-INV10A corrections.** |
| **CP-INV10A** | Fix controlled-bulk rerun safety, four-state reconciliation SQL, helper docs, plan contradictions, and release-note draft. | **Completed and verified.** |
| **CP-INV10B** | Review product, customer, order, supplier, ledger, and dashboard integration boundaries. | **Completed:** v1.8.0 remains manual inventory; document-linked sales and supplier flows are future work. |
| **Final bump/package** | Bump root application metadata to 1.8.0, verify, build installer, and selectively stage the approved release. | **Version and installer complete; pending commit approval.** |

**Start with CP-INV1 only.** The build prompt is [claude/prompts/codex-inventory-v1.8.0-build.md](../prompts/codex-inventory-v1.8.0-build.md).

---

## 16. Codex implementation prompt — CP-INV1 only

> **Superseded for build work.** The full checkpoint-by-checkpoint build prompt now lives in
> [claude/prompts/codex-inventory-v1.8.0-build.md](../prompts/codex-inventory-v1.8.0-build.md) and covers CP-INV1 → CP-INV10.
> Use that file. The prompt below is kept as the standalone review-only variant, for the case where you want CP-INV1
> run in isolation without handing over the whole build.

```text
You are working in the HomeConnect repository.

Start CP-INV1 only. This is a REVIEW AND BASELINE checkpoint.
Read and report. Do not build anything.

CONTEXT
We are planning Inventory Management v1: inventory visibility plus a manual,
append-only stock movement ledger. Not full ERP inventory, no valuation, no COGS,
no purchase orders, no automatic deduction from sales or receiving from suppliers.
See claude/plans/inventory-management-plan.md.

DO NOT
- Do not implement any code.
- Do not create or modify Prisma migrations.
- Do not modify backend/prisma/schema.prisma or the Product model.
- Do not touch sales order financial logic or totals.
- Do not touch customer debts, payments, or installments.
- Do not touch the Mobile Scanner app.
- Do not run builds, do not bump version, do not generate an installer, do not commit.

REVIEW AND REPORT ON
1. Product stock baseline
   - Confirm the exact current fields on Product: trackStock, stockQuantity,
     lowStockThreshold, costPrice, sku, barcode, specifications. Report types,
     defaults, nullability, and uniqueness.
2. Current stock write path
   - backend/src/features/service/products/products.service.ts (updateStock),
     products.validator.ts, products.routes.ts, products.controller.ts.
     Report exactly who may change stock today, what is required (admin role,
     account password, reason), what is written to ServiceAudit, and confirm
     whether the change is recorded as an absolute value or as a delta.
   - Report every other code path that can write stockQuantity, if any.
3. Movement history
   - Confirm no StockMovement or InventoryAdjustment table exists, and report
     whether ServiceAudit CHANGE_STOCK rows are sufficient to reconstruct
     quantities (not just before/after snapshots of a settings object).
4. Sales orders
   - backend/src/features/sales/sales-orders/. Confirm whether stock is read only
     (for display) or actually deducted. Report where SalesOrderItem.quantity is
     used, and what would have to change for future fulfillment deduction.
     Do not change anything.
5. Suppliers
   - Confirm SupplierTransaction has no product line items and no stock effect.
6. Service jobs
   - Confirm ServiceJob does not consume product stock today, and report whether
     its productId relation implies a unit is physically consumed.
7. Scanner
   - Confirm GET /products/scan exists, who may call it, and what it returns.
     Report how a scan could open a product inventory panel WITHOUT changing stock.
     Do not modify the scanner or the mobile scanner app.
8. Low stock surfaces
   - Report every place stock status is currently shown (badges, drawers, lists)
     and confirm whether the dashboard has any stock content at all.
9. Migration risk (most important)
   - Inspect backend/prisma/migrations and backend/prisma/repair.
     CONTEXT YOU MUST ASSUME AS TRUE: the business PC is stable on HomeConnect
     1.6.0 with ALL migrations applied through 1.6.0. Schema drift is not the
     open problem. The laptop has far less data than the business PC and is used
     for development only. Mobile Scanner is finished but UNRELEASED and must not
     be bumped or mixed into inventory work.
    - Report what an additive StockMovement migration and explicit verified
      onboarding would need in order to be proven safe against REAL business PC
      data, and what queries would establish the pre-migration baseline (counts of
     products, tracked products, and tracked products with stockQuantity > 0).
   - State plainly that INSTALLING ON THE BUSINESS PC is blocked until that
     rehearsal is done on a restored copy of the business PC database. Authoring
     the migration at CP-INV2 is NOT blocked — you cannot rehearse a migration
     that does not exist yet. List what the rehearsal must
     demonstrate.
10. Recommended sequence
   - Given the above, recommend the implementation order and flag anything in the
     plan that the code contradicts.

OUTPUT
A written report only. No code changes. End with:
(a) the confirmed baseline as a short table,
(b) the top risks in priority order,
(c) anything that blocks CP-INV2.
```
