# HomeConnect v1.0.7 — Product Management (completion plan)

> **Status:** Approved plan. Planning document only — no code written.
> Implementation begins at CP1 (§17).
> **Version stays 1.0.7** — this completes the in-flight release, no bump.

---

## Context

The v1.0.7 service/product work is already substantially built and **uncommitted**
on `main` (last commit is `ed04042 chore: release v1.0.6`). Verified state today:

**Backend — largely complete.**
`backend/src/features/service/products/` has routes, controller, service,
repository, validator, plus `products.routes.test.ts` and
`products.validator.test.ts`. `Product` exists in
[schema.prisma](backend/prisma/schema.prisma) with the migration
`20260729090000_add_service_and_product/`. Archive/restore, audit via
`ServiceAudit` (`recordType = PRODUCT`), barcode-uniqueness 409, admin password
via `verifyAdminPassword` in [backend/src/lib/admin-verification.ts](backend/src/lib/admin-verification.ts),
and the sensitive-field split via `PRODUCT_FIELD_POLICY` in
[service-policy.ts](backend/src/features/service/authorization/service-policy.ts)
are all working.

**Frontend — plumbing exists, management surface does not.**
[products.api.ts](frontend/src/features/service/api/products.api.ts),
[useProducts.ts](frontend/src/features/service/hooks/useProducts.ts) (4 hooks),
`ProductPicker`, `ProductLabel` (jsbarcode CODE128 + text fallback), and
`/products/:id/label` with a 1–40 copies control all work. Bilingual labels
follow the `'Product Name / اسم المنتج'` pattern in
[business-labels.ts](frontend/src/shared/labels/business-labels.ts).

**The actual gap:** there is **no Products page**. Products can only be created
inline from a service job, cannot be browsed, edited, corrected, archived, or
restored from the UI, and there is no nav entry. The backend endpoints for
edit/archive/restore exist and are untouched by any frontend code.

**Intended outcome:** a clean, responsive Products section that exposes the
already-built backend, plus the small backend additions needed to make that page
useful (richer filters, sorting, actor names, duplicate warning, related service
jobs).

### Decisions locked in this session

| Decision | Choice |
|---|---|
| Code location | **Extract to `frontend/src/features/products/`**; `features/service/` imports from it |
| Duplicate name+model+brand | **Soft warning with override** — never blocks; barcode stays a hard 409 |
| Dashboard product cards | **Deferred to v1.0.8**; nav entry still added. Version stays 1.0.7 |
| `discount` semantics | **Fixed decimal amount** — already implemented and validated (`discount ≤ price`). Not changing. UI must label it "Discount amount" |

---

## 1. Version goal

Complete Product Management inside v1.0.7 so the workshop can manage its product
catalogue end-to-end from the UI, without touching the shipped service-job
behaviour and without opening the door to inventory/POS scope.

Success criteria:

- A `/products` page lists, searches, filters, and sorts products.
- Add / edit / archive / restore all work from the UI, with admin password +
  reason enforced on sensitive fields exactly as the backend already requires.
- A details drawer shows the full record including who created/updated it.
- Labels print from the list (single and multi-select), not only from a deep link.
- The service-job product selector searches by name, model, brand, **and barcode**,
  and service job details links through to the product.
- No duplicate barcodes; near-duplicates warn but never block.

---

## 2. Product management scope

**Already done — do not rebuild:**
Product model + migration, create/list/get/patch/archive/restore/label/audit
endpoints, barcode 409, admin-password + audit on sensitive fields, decimal-safe
money handling, `ProductPicker`, `ProductLabel` with CODE128, label page with
copies.

**To build:**

*Backend (small):*
1. List filters: `brand`, `hasBarcode`, `sortBy`, `sortOrder`.
2. `GET /products/check-duplicate` — soft duplicate warning.
3. `GET /products/:id/service-jobs` — related jobs for the details drawer.
4. Include `createdBy` / `updatedBy` actor names in the detail response.
5. Fix the float comparison in `validateDiscount` (see §18).

*Frontend (the bulk):*
6. Extract product code into `features/products/`.
7. `ProductsPage` — table, search, filters, active/archived toggle, row actions.
8. `ProductFormDialog` — create and edit, with password+reason when sensitive.
9. `ProductDetailsDrawer` — full record, actor info, audit history, related jobs.
10. `ProductArchiveDialog` / `ProductRestoreDialog`.
11. Multi-select label printing from the list.
12. Nav entry + `/products` route.
13. Mutation hooks: update, archive, restore, audit, related jobs.

---

## 3. Explicitly out of scope

Stock quantities, inventory movement, supplier entities, purchase orders, POS
checkout, online shop sync, accounting integration, automatic debt creation from
product price, physical barcode-scanner workflows beyond typing/searching barcode
text, label template designer, product images, categories, variants, price
history, bulk import/export, product merge tooling.

**Also deferred:** dashboard product cards and `GET /products/summary` (v1.0.8),
and "convert manual service-job product into a Product record" (already noted as
future work in the service plan).

---

## 4. Product data rules

The model is already migrated and **must not change** in this scope:

| Field | Required | Type | Status |
|---|---|---|---|
| `id` | yes | uuid | done |
| `name` | **yes** | String, 1–200 | done |
| `model` | **yes** | String, 1–120 | done |
| `barcode` | no | String? `@unique`, 4–64 | done |
| `brand` | no | String?, ≤120 | done |
| `price` | no | `Decimal(12,2)?` | done |
| `discount` | no | `Decimal(12,2)?` | done |
| `isActive` | yes | Boolean, default `true` | done |
| `notes` | no | Text?, ≤2000 | done |
| `createdById` / `updatedById` | yes / no | uuid FK → User | done |
| `createdAt` / `updatedAt` | yes | timestamp | done |

`barcode String? @unique` in PostgreSQL allows many `NULL`s but no two equal
values — exactly the required behaviour, no partial index needed.

**No schema migration in this scope.** Everything below is additive query/API/UI
work against the existing tables.

---

## 5. Duplicate / barcode rules

### Barcode — hard block (already built)

- Trimmed, 4–64 chars, `^[A-Za-z0-9-]+$`
  ([products.validator.ts:11-18](backend/src/features/service/products/products.validator.ts#L11-L18)).
- Empty/absent allowed for any number of products.
- Duplicate non-empty barcode → `ServiceConflictError` with `field: 'barcode'`,
  checked both pre-insert and via the `P2002` mapper
  ([products.service.ts:257-264](backend/src/features/service/products/products.service.ts#L257-L264)).
- Never auto-generated.
- List search uses `startsWith` on barcode and `contains` on name/model/brand
  ([products.repository.ts:22-30](backend/src/features/service/products/products.repository.ts#L22-L30)) —
  keep this; prefix matching is what makes a scanned/typed barcode resolve
  instantly.

### Near-duplicate — soft warning (new)

`GET /api/v1/products/check-duplicate?name=&model=&brand=` returns:

```jsonc
{ "matches": [ { "id": "...", "name": "...", "model": "...", "brand": "...", "isActive": true } ] }
```

- Case-insensitive exact match on `name` + `model`, with `brand` compared only
  when supplied (treat `null` and `''` as "not supplied").
- Returns at most 5 matches. **Never** returns an error — it is advisory.
- The create dialog calls it on blur of the `model` field and shows an inline
  amber notice: *"A similar product already exists"* with a link to the match and
  a **Continue anyway** action. Submission is never blocked.
- Archived matches are included and marked, so staff restore rather than
  re-create.

> **Route ordering matters:** `check-duplicate` must be registered **before**
> `productsRoutes.get('/:productId')` in
> [products.routes.ts:19](backend/src/features/service/products/products.routes.ts#L19),
> or Express will match it as a `productId` and fail uuid validation with a
> confusing 400.

---

## 6. Price and discount rules

**`discount` is a fixed decimal amount, not a percentage.** This is already
implemented and shipped in the uncommitted work — `Decimal(12,2)`, validated
`discount ≤ price` — and changing it now would require a migration plus reworking
validation. Locking it in.

Required follow-through:

- Every UI label reads **"Discount amount"**, never bare "Discount", so the
  business is never guessing. Bilingual: `'Discount Amount / قيمة الخصم'`.
- The details drawer shows the derived **net price** (`price − discount`) as
  read-only helper text when both are present, so the amount interpretation is
  self-evident on screen.

Decimal safety (existing conventions, keep):

- API money in and out as **strings**; regex
  `^(?:0|[1-9]\d*)(?:\.\d{1,2})?$` at the edge.
- Server-side arithmetic/comparison via `parseMoney` / `compareMoney` /
  `moneyToApiString` from
  [money.ts](backend/src/features/financial/domain/money.ts).
- **No JS `number` anywhere in a money path.** The frontend treats price and
  discount as opaque strings — it must not compute net price in JS floats;
  net price comes from the backend, or is computed with a string-safe helper.
- `price` and `discount` both optional and independently nullable.

---

## 7. Product label printing plan

Already working: [ProductLabel.tsx](frontend/src/features/service/components/ProductLabel.tsx)
renders CODE128 into an SVG via `jsbarcode` with a `barcodeFailed` state that
falls back to plain barcode text, and
[ProductLabelPage.tsx](frontend/src/pages/service/ProductLabelPage.tsx) provides
a 1–40 copies control and `window.print()`.

**Additions only:**

1. **Print from the list.** A printer icon per row → `/products/:id/label`.
2. **Multi-select print.** Checkbox column + "Print labels (n)" action →
   `/products/labels?ids=a,b,c`. New page fetches each label payload and renders
   them into the existing `.product-label-grid`. Cap at 40 ids; ignore unknown
   ids rather than erroring the whole sheet.
3. **Print CSS review** in [index.css](frontend/src/styles/index.css) — confirm
   `@page` sizing, that `.no-print` is respected, and that labels don't split
   across page breaks (`break-inside: avoid`).
4. **Arabic-safe label font** — see §13.

Keep: no designer, no server-side PDF, no per-product templates.
Physical printer verification stays a manual step (§ Verification).

---

## 8. Product UI plan

New feature folder, per the locked decision:

```
frontend/src/features/products/
├── api/products.api.ts              (moved from features/service/api/)
├── types/product.types.ts           (extracted from service.types.ts)
├── schemas/product.schemas.ts       (new — zod, mirrors backend validator)
├── hooks/useProducts.ts             (moved + extended)
├── utils/product-labels.ts          (new — bilingual display strings)
└── components/
    ├── ProductsTable.tsx            (new — desktop)
    ├── ProductMobileCard.tsx        (new — mobile)
    ├── ProductFilters.tsx           (new)
    ├── ProductFormDialog.tsx        (new — create + edit)
    ├── ProductDetailsDrawer.tsx     (new)
    ├── ProductStatusBadge.tsx       (new)
    ├── ProductArchiveDialog.tsx     (new)
    ├── ProductRestoreDialog.tsx     (new)
    ├── ProductDuplicateWarning.tsx  (new)
    ├── ProductPicker.tsx            (moved)
    └── ProductLabel.tsx             (moved)
```

`features/service/` imports products from here. Blast radius of the move is
**9 files** (verified): `App.tsx`, `ProductLabelPage.tsx`, and 7 files under
`features/service/`. Purely mechanical import-path updates.

### Pages

- `frontend/src/pages/products/ProductsPage.tsx` → route `products`
- `frontend/src/pages/products/ProductLabelsPage.tsx` → route `products/labels`
- `ProductLabelPage.tsx` **moves** to `pages/products/` (route path unchanged:
  `products/:id/label`)

### Products page layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Products / المنتجات                        [ + Add product ]   │
├─────────────────────────────────────────────────────────────────┤
│  🔍 search…    Brand ▾   Barcode: All ▾   ● Active ○ Archived   │
│  ☑ 3 selected                        [ 🖨 Print labels (3) ]     │
├────┬──────────────┬─────────┬────────┬──────────┬───────┬───────┤
│ ☐  │ Name         │ Model   │ Brand  │ Barcode  │ Price │  ⋯    │
├────┼──────────────┼─────────┼────────┼──────────┼───────┼───────┤
│ ☐  │ مروحة سقف     │ CF-52   │ Ariete │ 89016…   │ 45,000│ ⋯     │
│ ☐  │ Samsung Fridge│ RT28K   │Samsung │ —        │   —   │ ⋯     │
└────┴──────────────┴─────────┴────────┴──────────┴───────┴───────┘
                                              ◀ 1 2 3 ▶
```

Row actions (`⋯`): View details · Print label · Edit · Archive/Restore.
Archived rows render muted with a `ProductStatusBadge`.

Follow the desktop-table / mobile-card split already proven by
[ReceivablesTable.tsx](frontend/src/features/receivables/components/ReceivablesTable.tsx)
and `ReceivableMobileCard.tsx`, and reuse `Table`, `Pagination`, `EmptyState`,
`Modal` from [frontend/src/components/ui/](frontend/src/components/ui/).

### Form dialog

Fields: name*, model*, brand, barcode, price, discount amount, notes.
When editing **sensitive** fields (name, model, barcode, brand, price, discount)
the dialog reveals **Reason** + **Account password**, mirroring
[EditDebtDialog.tsx](frontend/src/features/customer-financial/components/EditDebtDialog.tsx)
exactly — including mapping server field errors back via `setError`.
Editing `notes` alone requires neither. The dialog decides this client-side using
a shared copy of the sensitive-field list, but the backend remains the authority.

### Details drawer

Right-side drawer: name/model/brand, barcode, price + discount amount + net
price, status badge, notes, created/updated by + timestamps, audit history
(admin only, reusing the pattern of
[ServiceJobAuditList.tsx](frontend/src/features/service/components/ServiceJobAuditList.tsx)),
and a **Related service jobs** list. Actions: Print label, Edit, Archive/Restore.

---

## 9. Backend API plan

Existing endpoints stay as-is. Changes are additive.

| Method | Path | Status | Change |
|---|---|---|---|
| `GET` | `/api/v1/products` | exists | **extend filters** (below) |
| `POST` | `/api/v1/products` | exists | unchanged — creation is not password-gated |
| `GET` | `/api/v1/products/check-duplicate` | **new** | soft warning; register **before** `/:productId` |
| `GET` | `/api/v1/products/:id` | exists | **include** `createdBy`/`updatedBy` names |
| `PATCH` | `/api/v1/products/:id` | exists | unchanged |
| `POST` | `/api/v1/products/:id/archive` | exists | unchanged |
| `POST` | `/api/v1/products/:id/restore` | exists | unchanged |
| `GET` | `/api/v1/products/:id/label` | exists | unchanged |
| `GET` | `/api/v1/products/:id/audit` | exists | unchanged |
| `GET` | `/api/v1/products/:id/service-jobs` | **new** | related jobs, paginated |
| `DELETE` | — | — | **never** |

### Extended list query

`productListQuerySchema` gains:

```ts
brand:     z.string().trim().max(120).optional(),
hasBarcode: z.enum(['true','false']).optional().transform(...),   // null-check filter
sortBy:    z.enum(['name','model','brand','price','createdAt','updatedAt']).default('name'),
sortOrder: z.enum(['asc','desc']).default('asc'),
```

Repository: map `sortBy`/`sortOrder` to `orderBy`, always appending
`{ id: 'asc' }` as a stable tiebreaker so pagination can't drop or repeat rows.
`brand` filters with `equals … mode:'insensitive'`; `hasBarcode` maps to
`{ barcode: { not: null } }` / `{ barcode: null }`.

> Keep the existing `page`/`pageSize` names. Your brief said `limit` — the rest of
> this codebase uses `pageSize` (financial, receivables, service jobs) and the
> frontend `ProductFilters` type already does too. Consistency wins; renaming
> would churn working code for nothing.

### `GET /products/:id/service-jobs`

Returns `{ items, total, page, pageSize }` of jobs where `productId = :id`,
newest `serviceCreatedDate` first, default `pageSize: 10`. Reuses the existing
service-job serializer so the drawer renders the same shape the service list
already knows.

### Detail response actor names

`ProductsRepository.findById` gains
`include: { createdBy: { select: { fullName, username } }, updatedBy: { … } }`.
`serializeProduct` currently spreads `...product`
([products.service.ts:229](backend/src/features/service/products/products.service.ts#L229));
it must explicitly project fields once relations are included, otherwise the
whole nested user object leaks into the response.

---

## 10. Frontend API / hooks plan

`productsApi` gains `checkDuplicate`, `serviceJobs`, and typed filter params.

`useProducts.ts` gains — the four write hooks that make the page functional:

```ts
productKeys.audit(id)          // new
productKeys.serviceJobs(id)    // new
productKeys.duplicate(q)       // new

useUpdateProduct()      // invalidates list + detail
useArchiveProduct()     // invalidates list + detail
useRestoreProduct()     // invalidates list + detail
useProductAudit(id)     // admin-only, enabled by role
useProductServiceJobs(id)
useCheckProductDuplicate()   // manual trigger, not auto-fetched
```

All mutations invalidate `productKeys.all` on success, matching the existing
`useCreateProduct` pattern.

`ProductFilters` type extends to `{ search, isActive, brand, hasBarcode, sortBy,
sortOrder, page, pageSize }`.

URL-state sync for filters follows
[receivables-query.ts](frontend/src/features/receivables/utils/receivables-query.ts)
so filters survive refresh and back-navigation.

---

## 11. Service job integration

Service jobs keep working exactly as they do — **manual product text stays fully
supported and is never forced into the Product table.**

Improvements only:

1. **`ProductPicker` search** already hits `GET /products?search=`, which the
   repository matches against name/model/brand/barcode — so barcode search
   works today. Verify and cover with a test rather than rebuilding.
2. **Link through.** In service job details, when `productId` is set, the product
   name becomes a link opening the product details drawer (or `/products?focus=<id>`).
3. **Related jobs.** The product details drawer lists that product's service jobs
   via the new endpoint — the reverse direction of the same relation.
4. **Picker shows archived state.** Archived products are excluded from picker
   results by default (`isActive=true`), so staff can't attach a retired product
   to a new job.

The inline "Add product" escape hatch inside `ProductPicker` stays — it is why
product creation is deliberately not password-gated.

---

## 12. Admin password / audit plan

**Nothing new to build on the backend.** The mechanism is complete and correct:

- `verifyAdminPassword` in [admin-verification.ts](backend/src/lib/admin-verification.ts)
  — bcrypt compare, ADMIN role check, throttling, `AdminVerificationLog` rows.
  Password is compared, never stored.
- Sensitive-field decisions centralised in `PRODUCT_FIELD_POLICY`
  ([service-policy.ts:7](backend/src/features/service/authorization/service-policy.ts#L7)).
- Password verification + mutation + audit write all run inside one
  `runFinancialTransaction`, so an applied change can never lack an audit row.
- `ServiceAudit` with `recordType = PRODUCT` records `recordId`, `changedById`,
  `changedByName`/`Username`, `changedAt`, `action`, `reason`,
  `beforeValues`/`afterValues` (changed keys only, money stringified).
  Actions in use: `CREATE`, `UPDATE_DETAILS`, `ARCHIVE`, `RESTORE`.

**Frontend work only:** every sensitive action dialog collects Reason (5–1000)
+ Account password and surfaces server field errors. The audit list in the
details drawer renders `field: old → new`, admin-only.

Password-gated: price, discount, barcode, model, name, brand, archive, restore.
Not gated: create, and `notes`-only edits.

---

## 13. Arabic text support

The bilingual convention already exists — single strings like
`'Product Name / اسم المنتج'` in
[business-labels.ts:72-79](frontend/src/shared/labels/business-labels.ts#L72-L79),
which already covers name, model, brand, barcode, price, printLabel.

Work needed:

1. **Add missing keys** to the existing `product` block: `discountAmount`,
   `notes`, `status`, `active`, `archived`, `addProduct`, `editProduct`,
   `archiveProduct`, `restoreProduct`, `products` (nav), `netPrice`,
   `duplicateWarning`. Same `'English / عربي'` format — do **not** introduce an
   i18n framework.
2. **`dir="auto"`** on every user-entered value: product name, model, brand,
   notes — in the table, drawer, form inputs, picker results, and the label.
   `ProductLabel` already does this on the `<article>`; extend to the individual
   fields so a mixed Arabic-name/Latin-model row renders each correctly.
3. **`user-text` class** on user-entered content, matching existing usage in
   [CustomerProfilePage.tsx](frontend/src/pages/customers/CustomerProfilePage.tsx).
4. **Print font.** Add a print-scoped font stack for `.product-label`:
   `Tahoma, Arial, 'Segoe UI', sans-serif` — Tahoma renders Arabic reliably on
   Windows and prints cleanly on thermal stock.
5. **Sorting caveat.** `sortBy=name` uses Postgres collation; Arabic names will
   not interleave with Latin names in a "natural" way. Acceptable for v1.0.7 —
   flagged in §18, not solved.

No full app translation — that stays whatever the existing Arabic-label task
defines.

---

## 14. Dashboard / navigation integration

**Navigation** — add to `navItems` in
[DashboardLayout.tsx:19-25](frontend/src/layouts/DashboardLayout.tsx#L19-L25):

```ts
{ name: 'Products / المنتجات', path: '/products', icon: Package },  // lucide-react
```

Placed directly after `Service`, since the two are used together. Visible to all
roles — employees browse and print labels; admin-only actions are gated inside
the page, not by hiding the nav entry.

Routes added to [App.tsx](frontend/src/App.tsx) inside the protected block:

```tsx
<Route path="products" element={<ProductsPage />} />
<Route path="products/labels" element={<ProductLabelsPage />} />
<Route path="products/:id/label" element={<ProductLabelPage />} />   // existing, page file moves
```

**Dashboard** — deferred to v1.0.8 per your decision. No `GET /products/summary`,
no product cards. Explicitly avoiding the trap of counting from a paginated
frontend page, which would report wrong totals.

---

## 15. Data validation rules

Backend rules are implemented; the frontend zod schema in
`features/products/schemas/product.schemas.ts` must **mirror** them so users get
inline errors before a round trip, with the backend staying authoritative.

| Field | Rule |
|---|---|
| `name` | required, trimmed, 1–200, `userTextSchema` |
| `model` | required, trimmed, 1–120 |
| `barcode` | optional; 4–64; `^[A-Za-z0-9-]+$`; unique → 409 on `barcode` |
| `brand` | optional, ≤120 |
| `price` | optional; `^(?:0\|[1-9]\d*)(?:\.\d{1,2})?$`; ≥ 0 |
| `discount` | optional; same money regex; **≤ `price`** when both present |
| `notes` | optional, ≤2000 |
| `reason` | 5–1000, required on sensitive changes and archive/restore |
| `accountPassword` | required on sensitive changes and archive/restore |
| list `page`/`pageSize` | positive ints, `pageSize` ≤ 100, default 25 |

Cross-cutting: unknown keys stripped; empty string normalised to `null` for all
optional fields (so clearing a field in the edit form actually clears it, rather
than storing `''`); PATCH with zero mutable fields → 400.

---

## 16. Testing strategy

### Backend (extend existing test files)

`products.validator.test.ts` — new filter params (`brand`, `hasBarcode`,
`sortBy`, `sortOrder`) incl. rejection of an invalid `sortBy`; `discount > price`
rejected; **Arabic** name/brand/notes accepted; empty-string → `null`
normalisation.

`products.routes.test.ts` — `check-duplicate` resolves before `/:productId`
(regression guard for the route-ordering trap); `check-duplicate` returns 200
with an empty array rather than 404 when nothing matches; `/service-jobs`
paginates; no `DELETE` route is registered; `403` for employee on
archive/restore; sensitive PATCH without `reason`/`accountPassword` → 400.

New `products-db.integration.test.ts` — duplicate barcode → 409 not 500; sorting
is stable across pages; archive → restore writes two audit rows with correct
before/after; a wrong password leaves **zero** mutation and one `FAILURE` row in
`admin_verification_logs`; `Decimal` values round-trip as strings through audit
JSON.

### Frontend

Extend `service.components.test.tsx` / new
`features/products/components/products.components.test.tsx`:

- Products page renders; empty state; archived filter switches the result set.
- Form validation: name/model required; discount > price blocked; Arabic input
  accepted and rendered with `dir="auto"`.
- Sensitive edit reveals reason + password; server field errors map onto the
  right inputs.
- Archive/restore confirmation flow.
- Duplicate warning appears and **Continue anyway** still submits.
- Multi-select → print labels builds the right id list.
- `ProductPicker` finds a product by barcode (guards the §11 claim).
- `ProductLabel` omits the barcode block when absent; falls back to text on
  render failure.

### Full verification — once, at the end

```
npm run lint
npm run typecheck
npm run test
npm run build
npm run prisma:validate
```

*(Confirm these script names exist in `package.json` at CP1 — `prisma:validate`
in particular may not be defined yet.)*

---

## 17. Implementation checkpoints for Codex

Reordered from your draft: the folder extraction (CP2) comes before any new UI,
so nothing gets written twice; backend work is grouped ahead of the frontend it
unblocks.

| CP | Scope | Done when |
|---|---|---|
| **CP1** | Confirm gaps against working tree. Verify `npm` script names; confirm `lucide-react` exports `Package`; confirm `ProductPicker` barcode search works today | Written confirmation; plan amended if reality differs |
| **CP2** | **Extract** `features/service/{api,hooks,components,types}` product code → `features/products/`. Pure move + import updates across the 9 known files | Typecheck clean, existing service tests pass **unchanged**, zero behaviour change |
| **CP3** | Backend list filters (`brand`, `hasBarcode`, `sortBy`, `sortOrder`) with stable `id` tiebreaker | Validator + route tests green |
| **CP4** | Backend `GET /products/check-duplicate` (registered **before** `/:productId`) and `GET /products/:id/service-jobs` | Route-ordering regression test green |
| **CP5** | Backend detail response includes `createdBy`/`updatedBy` names; `serializeProduct` projects explicitly. Fix `validateDiscount` float comparison (§18) | No nested user object leaks; money comparison is decimal-safe |
| **CP6** | Frontend types, zod schemas, extended `ProductFilters`, and the 6 new hooks | Typecheck clean; hooks unit-tested against mocked responses |
| **CP7** | `ProductsPage`: table + mobile cards + search + filters + active/archived + pagination + URL state + nav entry + route | Filters survive refresh; mobile layout matches receivables quality |
| **CP8** | `ProductFormDialog` (create + edit) with conditional reason/password, plus `ProductDuplicateWarning` | Employee can create and edit notes; only admin can change price/barcode |
| **CP9** | `ProductDetailsDrawer`: full record, net price, actor info, audit list, related service jobs | Drawer renders old → new audit entries; related jobs paginate |
| **CP10** | `ProductArchiveDialog` / `ProductRestoreDialog` | Round-trip archive → restore works; both audited |
| **CP11** | Label printing from list: per-row action + multi-select `/products/labels`; print CSS + Arabic print font | Labels print, page-break clean, Arabic legible |
| **CP12** | Service job integration: product link-through, picker excludes archived, barcode-search test | Service job details links to product; picker test green |
| **CP13** | Bilingual label keys, `dir="auto"` audit across all product surfaces | No untranslated product string remains |
| **CP14** | Focused tests, docs update, full verification suite | All five commands green |

CP2–CP5 are backend/refactor only and verifiable without any UI.

---

## 18. Risks and open decisions

### Defects found in the existing code — fix during this work

1. **Float comparison in discount validation.**
   [products.validator.ts:34](backend/src/features/service/products/products.validator.ts#L34)
   uses `Number(values.discount) > Number(values.price)`, which contradicts the
   project's decimal-safe rule. The service layer re-checks correctly with
   `compareMoney`, so this is belt-and-braces rather than a live bug — but it can
   emit a wrong validation message at high precision. Replace with a string/
   Decimal comparison. **CP5.**
2. **`serializeProduct` spreads `...product`**
   ([products.service.ts:229](backend/src/features/service/products/products.service.ts#L229)).
   Harmless today, but the moment `findById` includes `createdBy`/`updatedBy`
   relations it will leak whole nested user objects into the API response.
   Must switch to explicit projection **in the same checkpoint** as the include.
   **CP5.**
3. **Route-ordering trap.** Adding `GET /products/check-duplicate` after
   `GET /:productId` yields a confusing uuid-validation 400. Ordering is
   load-bearing and needs a regression test. **CP4.**

### Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **The CP2 extraction touches working, uncommitted service code** | Could break shipped v1.0.7 service behaviour with no commit to fall back to | Do CP2 as a pure mechanical move, no behaviour edits; existing service tests must pass unchanged before proceeding. **Strongly recommend committing the current v1.0.7 work before CP2 starts** — there is currently no restore point |
| **Sensitive-field list duplicated client-side** | UI and backend could disagree about what needs a password | Backend stays authoritative and returns a clear 400; the client copy is a UX affordance only. Cover the mismatch case with a test |
| **Password fatigue** | Staff share the admin password | Create and notes-only edits stay ungated, consistent with the service-job decision |
| **`discount` interpreted as a percentage by staff** | Wrong prices on printed labels | Label every field "Discount amount" + show derived net price in the drawer (§6) |
| **Arabic sort order** | Arabic and Latin names don't interleave naturally under Postgres collation | Accepted for v1.0.7; revisit with a collation or normalised sort key if the business complains |
| **Near-duplicate accumulation** | Catalogue quality decays; no merge tool exists or is planned | Soft warning includes archived matches so staff restore instead of re-creating |
| **Multi-select label print with many ids** | Slow page, oversized URL | Cap at 40 ids, matching the existing copies cap |

### Open decisions

1. **Label physical size** — still unconfirmed from the previous plan
   (50mm × 30mm assumed). Needed before CP11's physical verification.
2. **Currency symbol on labels** — `ProductLabel` currently hardcodes `$`
   ([ProductLabel.tsx:19](frontend/src/features/service/components/ProductLabel.tsx#L19)).
   Confirm the correct currency and formatting; likely wrong for this business.
3. **`prisma:validate` script** — confirm it exists (CP1) or drop it from the
   verification list.

---

## 19. Exact files likely to change

### Backend — modified (no new files, no migration)

| File | Change |
|---|---|
| [products.validator.ts](backend/src/features/service/products/products.validator.ts) | `brand`/`hasBarcode`/`sortBy`/`sortOrder`; duplicate-check query schema; decimal-safe discount compare |
| [products.repository.ts](backend/src/features/service/products/products.repository.ts) | Filter + sort mapping w/ stable tiebreaker; `findByNameModelBrand`; `findById` relation include |
| [products.service.ts](backend/src/features/service/products/products.service.ts) | `checkDuplicate`, `serviceJobs`; explicit `serializeProduct` projection |
| [products.controller.ts](backend/src/features/service/products/products.controller.ts) | 2 handlers |
| [products.routes.ts](backend/src/features/service/products/products.routes.ts) | 2 routes — `check-duplicate` **before** `/:productId` |
| [products.routes.test.ts](backend/src/features/service/products/products.routes.test.ts), [products.validator.test.ts](backend/src/features/service/products/products.validator.test.ts) | Extend |
| `backend/src/features/service/products/products-db.integration.test.ts` | **New** |

### Frontend — moved

```
features/service/api/products.api.ts        → features/products/api/products.api.ts
features/service/hooks/useProducts.ts       → features/products/hooks/useProducts.ts
features/service/components/ProductPicker.tsx → features/products/components/
features/service/components/ProductLabel.tsx  → features/products/components/
Product* types out of features/service/types/service.types.ts
                                            → features/products/types/product.types.ts
pages/service/ProductLabelPage.tsx          → pages/products/ProductLabelPage.tsx
```

### Frontend — new

```
features/products/schemas/product.schemas.ts
features/products/utils/product-labels.ts
features/products/components/{ProductsTable,ProductMobileCard,ProductFilters,
  ProductFormDialog,ProductDetailsDrawer,ProductStatusBadge,ProductArchiveDialog,
  ProductRestoreDialog,ProductDuplicateWarning}.tsx
features/products/components/products.components.test.tsx
pages/products/{ProductsPage,ProductLabelsPage}.tsx
```

### Frontend — modified

| File | Change |
|---|---|
| [App.tsx](frontend/src/App.tsx) | 2 new routes + import path updates |
| [DashboardLayout.tsx](frontend/src/layouts/DashboardLayout.tsx#L19-L25) | 1 nav item (`Products / المنتجات`, `Package`) |
| [business-labels.ts](frontend/src/shared/labels/business-labels.ts#L72-L79) | ~12 new bilingual product keys |
| [index.css](frontend/src/styles/index.css) | Label print sizing, page-break, Arabic print font |
| `features/service/` — `CreateServiceJobDialog.tsx`, `service.components.test.tsx`, `types/service.types.ts`, `ServiceJobsTable.tsx` | Import path updates; product link-through |
| `frontend/src/pages/service/ServiceJobDetailsPage.tsx` | Product link-through |

### Docs

`docs/phases/phase-1-0-7/` — add a product-management section.
**No version bump.** `package.json` stays at the current v1.0.7 value.

---

## Verification

Run once at the end (CP14), then a manual pass:

```
npm run lint && npm run typecheck && npm run test && npm run build && npm run prisma:validate
```

Manual, on a real machine with the label printer:

1. **Nav & list** — `/products` loads from the sidebar. Search `RT28`, filter by
   brand, toggle Active/Archived, sort by price desc, page through. Confirm no
   row repeats or disappears across pages (stable-sort check).
2. **Create + duplicate warning** — add "مروحة سقف" / `CF-52` / Ariete, price
   `45000`, discount `5000`, barcode `8901643123456`. Confirm Arabic renders
   right-to-left in the table. Add a second product with the same name+model:
   confirm the amber warning appears, links to the first, and **Continue anyway**
   still saves.
3. **Duplicate barcode** — reuse `8901643123456`: expect an inline error on the
   barcode field, not a generic 500.
4. **Permissions** — as `EMPLOYEE`: create works, notes edit works, price/barcode
   edit and archive are unavailable. As `ADMIN`: change price with a **wrong**
   password → field error, no change, one `FAILURE` row in
   `admin_verification_logs`.
5. **Audit** — repeat with the correct password + reason; the details drawer
   audit list shows `UPDATE_DETAILS`, the reason, and old → new for `price` only.
6. **Archive / restore** — archive with reason; confirm it leaves the Active
   filter, appears under Archived, and no longer appears in the service-job
   `ProductPicker`. Restore and confirm both actions in the audit trail.
7. **Labels** — print a single label; then select 3 products and print from the
   list. Confirm on physical stock: Arabic legible, no label split across pages,
   **barcode scans and returns `8901643123456`**.
8. **Service integration** — in `ProductPicker`, search by barcode and confirm
   the product resolves. Create a job against it, then open the product drawer
   and confirm the job appears under Related service jobs, and that the job
   details page links back to the product.
9. **Manual product still works** — create a job with manual product text only
   and confirm no Product row was created.
