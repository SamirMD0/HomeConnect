# Codex Implementation Prompt — Sales Orders / طلبات البيع

Copy everything below the line into Codex.

---

You are implementing a new feature in the **HomeConnect** repository (Node/Express + Prisma/Postgres backend, React 19 + TypeScript frontend, Electron desktop shell).

## Your source of truth

Read this file first and treat it as the specification:

```
claude/plans/sales-orders-plan.md
```

It contains the full design: business cases, status model, data model, API contract, payment/debt/installment integration, UI layout, dashboard integration, admin policy, audit design, validation rules, tests, 13 checkpoints, and the exact file list. **Do not redesign it.** If you believe part of it is wrong, stop and say so in your response before writing code — do not silently deviate.

Also read `docs/UI_GUIDELINES.md` before writing any frontend code. It is one page and it is binding.

## What you are building

A **Sales Orders module** that records every sale the shop actually makes: walk-in, walk-in-with-delivery, and phone order. Order number, linked customer, one or more product lines, backend-calculated money, a fulfillment workflow, a payment picture, admin edit/cancel with audit, and a dashboard analytics section.

This is **not** e-commerce. There is no cart, no checkout, no self-service, no payment gateway, no customer-facing state. Every order is created by a staff member on behalf of a customer.

The module **owns commercial and fulfillment state**. It does **not** own receivables. Debts and installment plans remain the property of the existing financial module and are created only by an explicit user action.

## Non-negotiable rules

1. **All money math goes through `backend/src/features/financial/domain/money.ts`.** Use `parseMoney`, `multiplyMoney`, `subtractMoney`, `sumMoney`, `compareMoney`, `moneyToApiString`. Any new file that imports `Decimal` and does its own arithmetic is wrong. Columns are `Decimal @db.Decimal(12, 2)`, matching `Debt.originalAmount`.

2. **All money crosses the API as a decimal string**, produced by `moneyToApiString`. Never as `number`. No JavaScript float math on money, anywhere, at any layer. The frontend types every money field as `string`.

3. **The backend calculates every total. The client is never trusted.** The frontend sends `quantity`, `unitPrice`, `discountAmount`, and (for payment) `paidAmount`. If a request body contains `lineTotal`, `itemsSubtotal`, `totalAmount`, `remainingAmount`, or `paymentStatus`, those values are **ignored** — the backend recomputes them. A wizard may show an optimistic preview while typing; the saved response replaces it.

4. **Round once per line, then sum.** `lineTotal = round2(quantity × unitPrice − discountAmount)`, then `itemsSubtotal = Σ lineTotal`, then `totalAmount = itemsSubtotal + deliveryFee`. Summing unrounded values and rounding at the end disagrees by cents, and cents are what customers argue about. Test the `.005` boundary.

5. **A financial record is created only from terms the user supplied.** Per the owner decision in §7.2, an order that is not fully paid **does** create a `Debt` for the remainder, so the money reaches the ledger. That is authorised by the `debtDueDate` the user enters in the wizard's payment step — `Debt.dueDate` is required and non-nullable, so the system can never invent one. A fully-paid cash sale creates **zero** financial records. Installment plans are never created at save time; they remain a separate explicit action. Never write a financial record the user did not specify terms for.

6. **`backend/src/features/financial/` is off-limits with exactly one sanctioned exception:** add an additive optional `tx?: FinancialTransactionClient` parameter to `DebtsService.createDebt` and `InstallmentPlansService.createPlan`, threaded to the repositories (`DebtsRepository.createDebt(data, tx?)` already accepts one; `verifyAdminPassword(..., tx?)` is the existing precedent). Behaviour with the parameter omitted must be byte-identical, and the existing financial tests must pass untouched — do not edit them. Everything else in that folder you call, not change: schedule maths, balance maths, and status derivation stay where they are. Any further financial edit: stop and report.

7. **A converted remainder is counted once, in receivables.** Sales-side money (`SalesOrder.totalAmount`) and receivables (Debt/Installment/PaymentAllocation) are two separate metric families and are never summed into a third figure. The dashboard sales section shows sales-side money only and never shows outstanding receivables — those already live in the customer financial section. Write a test that fails if a receivables figure appears in the sales summary response.

8. **Sales orders never write stock.** Not on create, not on confirm, not on delivery, not on cancel, not on return. `Product.trackStock` / `stockQuantity` / `lowStockThreshold` are **read** to display a hint and a soft warning when `quantity > stockQuantity`. Selling above stock is allowed with a warning, never blocked — real shops sell items arriving tomorrow. The future inventory module owns stock movement; any decrement logic added now collides with it. The precedent is in the schema: `PrepaidPurchase.productId` is commented *"Optional catalog reference. Carries no stock effect."*

9. **`paymentStatus` is derived by the backend and stored, never accepted from the client.** `paidAmount == 0` → `UNPAID`; `0 < paidAmount < totalAmount` → `PARTIALLY_PAID`; `paidAmount == totalAmount` → `PAID`. It is stored only so list queries and the dashboard can index it, and it is recomputed in the same transaction as any money change. `settlement` (`NONE`/`DEBT`/`INSTALLMENT`) is likewise derived from the link fields and kept consistent in the same transaction.

10. **Sensitive mutations require `accountPassword` + `reason`.** The field is named `accountPassword`, not `adminPassword` — match `backend/src/features/service/service-jobs/service-jobs.validator.ts`. Verify with `verifyAdminPassword` from `backend/src/lib/admin-verification.ts` **inside the same transaction as the write**. `reason` uses `userTextSchema({ field: '…', min: 5, max: 1000 })`. Which fields are sensitive is defined by `SALES_ORDER_FIELD_POLICY` in §13 of the plan, shaped exactly like `SERVICE_JOB_FIELD_POLICY`.

11. **The password is never stored, never logged, never echoed, never written into audit JSON.** Confirm `backend/src/lib/redaction.ts` covers the new routes.

12. **Every mutation writes exactly one `SalesAudit` row inside the transaction that performs it.** Never after commit — a crash in between produces an unexplained change. `beforeValues`/`afterValues` carry only the changed keys, money as strings. `changedByName`/`changedByUsername` are denormalised at write time (the `ServiceAudit` precedent) so history survives a user rename.

13. **There is no `DELETE` endpoint and no hard delete of an order.** The UI says *Remove / إزالة*; the backend cancels. Cancelling an order that has a live `debtId` or `installmentPlanId` returns **409** with a message pointing at the financial screen. Editing a `CANCELLED` or `RETURNED` order returns **409** — restore first.

14. **Use the UI primitives.** `Button`, `IconButton`, `Card`, `CardHeader`, `Badge`, `Modal`, `FormField`, `Input`, `Textarea`, `Select`, `Table`, `Pagination`, `PageHeader`, `SectionHeader`, `EmptyState`, `Skeleton`, `BilingualLabel` from the UI barrel. **Import it by relative path** (`../../components/ui`) — there is no `@/` alias in this repo, only `@frontend`, `@backend`, `@desktop`. `docs/UI_GUIDELINES.md` line 40 says `@/components/ui` and is wrong; do not add the alias to make that line true. If a screen declares its own button, card, badge, or input classes, it is wrong. Neutrals are `slate-*` — **never `gray-*`**. Accent is `brand-*`. `success`/`warning`/`danger`/`info` are reserved for **state**, never decoration, never a chart series. Charts use `--viz-*` from `.viz-root`.

15. **Tailwind v4 does not read `tailwind.config.js`** — that file was deleted deliberately. All tokens live in the `@theme` block of `frontend/src/styles/index.css`. A token added anywhere else silently resolves to nothing.

16. **The app is light-only.** Do not add `prefers-color-scheme` blocks or a dark variant.

17. **Do not convert the app to RTL.** Layout stays LTR. Enum labels are single strings of the form `English / العربية` held in `Record<Enum, string>` maps — copy the pattern in `frontend/src/features/service/utils/service-labels.ts` exactly. Any element rendering user-entered text (customer names, manual product names, notes, delivery addresses, audit reasons) gets `dir="auto"`. Money values never get a `dir` attribute. Never assemble a bilingual label by concatenation at render time.

18. **No new dependencies.** `recharts`, `lucide-react`, `zod`, `@tanstack/react-query` are already installed. Do not add a chart library, an icon library, a date library, a state library, or an i18n framework. There is no i18n framework in this project and this feature does not introduce one.

19. **One migration, at CP2.** All **six** enums (`SalesChannel`, `SalesOrderFulfillmentStatus`, `SalesOrderPaymentStatus`, `SalesOrderSettlement`, `SalesAuditRecordType`, `SalesAuditAction`), three models, and the back-relations land together. Do not dribble schema changes across later checkpoints.

20. **Do not modify existing test files to make them pass.** `customers.*.test.ts`, `service-jobs.*.test.ts`, `debts.*.test.ts`, `installment-plans.*.test.ts`, `dashboard*.test.ts`, and `prisma/financial-domain-schema.test.ts` are your regression net. Extend where genuinely needed; they must keep passing untouched.

21. **Do not bump the version and do not generate an installer.** That is a separate, explicitly approved step after CP13.

## Checkpoints

Follow §19 of the plan. Summary:

```
CP1   Read existing patterns, confirm the plan, report conflicts. No code.
CP2   Prisma schema + single migration (6 enums, 3 models, back-relations)
CP3   Domain utilities: order-number, totals, status — pure, Decimal-safe, tested
CP4   Backend create / list / detail / summary / customer-scoped API
CP5   Edit, item endpoints, status, payment, cancel, restore, unlink, audit read
CP6   create-debt + create-installment-plan + optional tx on the 2 financial services
CP7   Dashboard sales summary backend
CP8   Frontend data layer: api, types, schemas, hooks, labels
CP9   Sales Orders page: filters, summary cards, table/card layout, chips
CP10  Create wizard (6 steps) + promote CustomerPicker to shared
CP11  Details page, admin actions, audit list, customer profile section
CP12  Dashboard frontend section + charts
CP13  Responsive/Arabic polish, docs, full verification
```

CP3 comes before any HTTP work deliberately. The totals functions are the highest-risk code in the feature and they are pure — get them green in isolation rather than debugging cent-level drift through a route test at CP9.

**CP1 is complete and its questions are answered** (2026-08-03). The five conflicts
it raised were verified and resolved as follows — these override anything earlier
in this prompt that disagrees:

1. **D1/D2** — an unpaid or partially-paid order creates a `Debt` for the remainder so it reaches the ledger, authorised by the `debtDueDate` collected in the wizard's payment step. No `Payment` row for counter cash. Fully-paid sale creates nothing. Installments stay a separate explicit action. Plan §7.2.
2. **D3** — accepted: one `Debt` **or** one `InstallmentPlan` per order, `@unique`, second conversion 409s until an admin unlinks.
3. **D7** — accepted: `deliveryFee` is inside `totalAmount`, therefore inside `remainingAmount` and any debt created from it.
4. **CP6 atomicity** — resolved by rule 6 above: additive optional `tx` on the two financial services. Do **not** compose the financial repositories from the sales service; that would give this codebase two implementations of debt-creation orchestration.
5. **Six enums, not four** — the prompt was wrong, the plan §9.1 was right. Fixed in rule 19.
6. **No `@/` alias** — correct, use relative imports. Fixed in rule 14. `docs/UI_GUIDELINES.md` line 40 is a documentation bug; leave it, do not add an alias to satisfy it.
7. **The `.005` boundary test** — correct, integer `quantity` × 2dp `unitPrice` cannot produce a half-cent, so that case is unreachable through the sales API. Keep `round2` as a defensive guard, test the boundary directly against the `money.ts` multiply/round contract, and add a sales-level test asserting integer-quantity lines are **exact** (no rounding applied). Say so in the test name so the next reader knows it is deliberate.
8. **CP13 version bump** — correct, excluded. Rule 21 stands; the plan's CP13 mention describes a later, separately approved step.

Two sequencing notes that follow from the above: CP4 builds order creation **without** the debt path and CP6 adds it (CP6 owns the one shared debt-creation function used by both entry points), and the optional-`tx` edit to the financial services happens in CP6, not earlier.

## Implementation details that are easy to get wrong

- **The schema has no `@map` on columns**, so Postgres column names are camelCase. Any raw SQL must quote them: `"orderNumber"`, `"totalAmount"`, `"fulfillmentStatus"`.
- **Multiple relations to `User` require named relations.** `SalesOrderCreatedBy`, `SalesOrderUpdatedBy`, `SalesOrderCancelledBy`, `SalesAuditChangedBy` — Prisma will not compile without them. Add the matching back-relation fields on `User` in the same edit.
- **`onDelete` is not uniform and that is intentional.** `SalesOrderItem → SalesOrder` is `Cascade` (items have no independent meaning and no financial rows point at them — the `ProductImage` precedent). Everything else — customer, product, user, debt, plan — is `Restrict`, matching every existing model.
- **`debtId` and `installmentPlanId` are `@unique`.** That constraint is what makes concurrent double-conversion impossible; do not drop it because Prisma requires a one-to-one back-relation.
- **Order numbers are `SO-YYYY-NNNN`**, copied from `backend/src/features/service/domain/job-number.ts` into `sales/domain/order-number.ts` with its own tests. **Improve one thing:** generate inside the create transaction and retry once on a `P2002` unique violation on `orderNumber`. The service version reads-then-formats and can collide. Do not retrofit this into the service module as part of this feature.
- **Route registration order matters twice.** `customerSalesOrdersRoutes` must be mounted **before** `customersRoutes` in `app.ts` (mirroring `customerServiceJobsRoutes` at line 87), and `GET /sales-orders/summary` must be declared **before** `GET /sales-orders/:salesOrderId` or the literal path is swallowed by the param route.
- **Date comparison goes through `compareBusinessDates`** from `backend/src/features/financial/domain/business-date.ts`. Do not compare date strings or `Date` objects ad hoc. Business dates are `@db.Date` columns and `YYYY-MM-DD` strings across the API; only `createdAt`/`updatedAt`/`changedAt` are timestamps.
- **`SHOP_DIRECT` rejects `deliveryDate` and `deliveryFee`** at validation — it does not silently ignore them. Silent ignoring hides frontend bugs. The wizard skips the delivery step entirely for that channel.
- **Exactly one of `productId` / `manualProductName`** per item, validated in a `superRefine` in the style of `validateJobValues`. Both present is a 400, not a preference.
- **Snapshot catalog fields at creation** (`productNameSnapshot`, `productModelSnapshot`, `skuSnapshot`) so a line still reads correctly after the product is renamed or deactivated.
- **`deliveryAddressSnapshot` never writes back to `Customer`.** It is prefilled from `Customer.address` and edited freely; overwriting the customer profile because of one delivery is a data-quality bug.
- **Delivery state lives in `fulfillmentStatus`.** Do not add a second `deliveryStatus` field. Two overlapping status fields for one physical process is the confusion the two-field design exists to avoid.
- **Removing the last item on an order is a 409**, not a silent no-op. An order with zero items has no meaning.
- **Overpayment is rejected in v1** (`paidAmount <= totalAmount`). Do not quietly clamp it.
- **The orders list shows status, not money detail.** Columns are order number, customer, items, total, payment status, fulfillment status. There are **no** `Paid` / `Remaining` columns — once a debt exists the ledger owns that balance, and two screens showing the same outstanding figure is two screens that can disagree. The full money breakdown lives in the order details drawer.
- **The wizard's payment step collects `debtDueDate`** whenever the order is not fully paid. It is required in that case and rejected when the order is paid in full. This is the field that authorises the debt — without it there is no order.
- **Summary cards come from `GET /sales-orders/summary`.** Never compute a headline figure by summing the paginated rows on screen. Same rule for the dashboard.
- **Top-products chart uses catalog-backed lines only.** Manual product names are free text; grouping on them turns typos into fake products. Label the chart so the exclusion is visible.
- **`IconButton` requires a `label`.** An icon with no accessible name is the classic ERP usability failure.
- **One `primary` button per screen.** Labels above controls; no placeholder-as-label. Errors get an icon **and** text — never colour alone.
- **The cash walk-in path is the performance target:** customer → product → "Paid in full" → Confirm, in under 30 seconds. Steps 2, 4 and 5 of the wizard need defaults good enough that they can be passed through with Enter. If the wizard is slower than the paper it replaces, the feature has failed regardless of how correct the backend is.

## Do not

- Do not implement anything in §18 (out of scope): e-commerce storefront, cart, checkout, payment gateway, inventory management, stock movements, delivery drivers or routing, carrier integration, installation jobs, tax/VAT, profit & loss, COGS, invoice or receipt printing, refunds or credit notes, multi-currency, multi-branch allocation, quotes, reservations, approval chains.
- Do not create a Debt without a user-supplied `debtDueDate`, and never create an `InstallmentPlan` at order-save time — that is always a separate explicit action.
- Do not create any financial record for a fully-paid cash sale.
- Do not allow both a Debt and an InstallmentPlan on one order in v1, and do not allow a second conversion after the first.
- Do not cancel or modify a linked Debt or InstallmentPlan from the sales module — unlinking is admin-only, audited, and leaves the financial record alone.
- Do not fabricate a `Payment` row for the cash paid at the counter. `PaymentAllocation` requires a debt or installment to allocate against; a counter-sale payment has nothing to point at and would corrupt the allocation invariants. The down payment lives on the order, and the debt created from that order is for the **remainder only** — never the full total.
- Do not add a customer name or phone column to `SalesOrder`. `Customer` is the source of truth, read through the relation.
- Do not allow an order without a customer. "Walk-in / unknown" is not supported.
- Do not add an i18n library, and do not switch the layout to RTL.
- Do not add an index for `orderNumber` — the `@unique` constraint already provides one.

## Verification

Run per-checkpoint tests as you go. At CP13 only, run the full suite once:

```
npm run lint
npm run typecheck
npm test
npm run build
npm run prisma:validate
```

All five must pass. If any fail, fix the cause — do not skip, silence, or weaken a test to make it green. Report the actual output.

Tests that must exist and must genuinely fail if the rule breaks:

- Client-supplied `totalAmount` / `lineTotal` is ignored; the backend value wins.
- Integer-quantity lines are **exact** — no rounding applied — and the `.005` rounding contract is tested directly against `money.ts`, not through the sales API where it is unreachable.
- An unpaid order creates exactly one `Debt`, for the remainder, in the same transaction as the order; a fully-paid order creates none.
- If debt creation fails, the order does not exist either (single transaction).
- Every money field in every response is a `string`.
- `PREPAID_PURCHASE`-style exclusions aside, the sales summary contains **no** receivables figure.
- Cancel with a live financial link → 409.
- Second `create-debt` on the same order → 409.
- Sensitive edit without `accountPassword` → 401/403; wrong password → 401.
- Cancel writes exactly one `SalesAudit` row with before/after and reason.
- Editing a cancelled order → 409.
- A failure after the order insert leaves no partial rows (transaction boundary).

**Manual smoke checks a human must run before release** (list them in your CP13 report as outstanding):

1. Direct paid cash sale, timed — under 30 seconds.
2. Unpaid sale with a due date → confirm the debt appears on the ledger/receivables page exactly once, for the right amount.
3. Partial sale → create installment plan for the remainder → verify the schedule amounts and dates.
4. Delivery sale advanced through every fulfillment stage.
5. Phone order with inline customer create, including the duplicate-phone warning.
6. Cancel an order with, and without, a financial link.
7. Admin edit of a confirmed order's price with password + reason; verify the audit entry reads correctly.
8. Dashboard reflects the day's activity with no figure double-counted.

## Reporting

After each checkpoint, state briefly: what you built, which tests you ran and their result, and anything in the plan that turned out to be wrong or under-specified. If you had to deviate, say so explicitly and why.
