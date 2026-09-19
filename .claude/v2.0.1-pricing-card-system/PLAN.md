# Pricing Card System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard-coded `ProductLabel` with a template-driven `PricingCard` renderer that adapts to any product category (TVs, appliances, small appliances, trimmers, …) while preserving the v2.0.1 barcode/secret-price guarantees.

**Architecture:** One renderer, many templates. `PricingCardTemplate` rows carry a validated JSON config; the `<PricingCard>` renderer consumes `(template, binding)` and emits mm-accurate DOM. Feature icons, brand logos, and the company logo are admin-managed data; specs resolve through a canonical-key alias catalog against the existing `Product.specifications Json?` column. Barcodes reuse `barcode-geometry.ts` unchanged.

**Tech Stack:** Prisma (PostgreSQL), Express/Zod backend, React + Tailwind frontend, JsBarcode for barcodes, Electron for direct printing, Vitest for tests.

**Spec:** [ANALYSIS.md](.claude/v2.0.1-pricing-card-system/ANALYSIS.md), [DESIGN.md](.claude/v2.0.1-pricing-card-system/DESIGN.md), [DATA_MODEL.md](.claude/v2.0.1-pricing-card-system/DATA_MODEL.md), [EDITOR_UX.md](.claude/v2.0.1-pricing-card-system/EDITOR_UX.md), [PRINTING.md](.claude/v2.0.1-pricing-card-system/PRINTING.md), [REVIEW.md](.claude/v2.0.1-pricing-card-system/REVIEW.md).

## Global Constraints

- Never mutate `Product.price` from a print action.
- Never embed the secret code in the barcode payload (`products.labels.test.ts:280` invariant).
- Never hard-code the Home Connect logo — read `ShopProfile.logoBytes`.
- Never hard-code a feature icon as a React component — always read `PricingCardFeatureIcon.svg`.
- Never allow the barcode module below 0.25 mm (2 dots at 203 DPI).
- Every mutation on new tables is admin-gated + password + writes a `ServiceAudit` row.
- Migrations are additive-only; no existing column is dropped or retyped.
- No web fonts, no external network fetches during printing.
- SVG uploads sanitized with DOMPurify (`USE_PROFILES: { svg: true }`) at write time.
- All tests use the real Prisma test database (no ORM mocks) — matches the repo convention.
- No new dependency without approval; DOMPurify is the only new npm package.

---

## Phase 0 — Prerequisites (checkpoint before starting)

### Task 0.1: Branch strategy alignment

**Files:**
- Modify: `.claude/v2.0.1-pricing-card-system/PLAN.md` (this file, notes only)

**Interfaces:** none

- [ ] **Step 1:** Confirm with the user whether this ships on `hotfix/v2.0.1-barcode-labels` (adds to the ongoing hotfix) OR on a new `feature/v2.1.0-pricing-cards` branch cut from the tip of the hotfix. **Recommendation:** cut a feature branch. The hotfix should stay narrowly scoped to barcode-label fixes.
- [ ] **Step 2:** Confirm rollout mode default: `ShopProfile.pricingCardRolloutMode = BOTH` at first release (both label and card systems available). Legacy retirement is a later ticket.
- [ ] **Step 3:** Confirm currency plan: single-currency via `ShopProfile.currencyCode` (default `USD`). Real dual-currency is deferred.
- [ ] **Step 4:** Confirm DOMPurify addition (server-side sanitizer for SVG icons). If disallowed, use a hand-rolled SVG allowlist parser and expand this task.

#### Phase 0 outcomes

- Branch: `feature/v2.1.0-pricing-cards` off `hotfix/v2.0.1-barcode-labels` — user answer (verbatim): `approved`
- Rollout: default `ShopProfile.pricingCardRolloutMode = BOTH` at first release — user answer (verbatim): `approved`
- Currency: single-currency via `ShopProfile.currencyCode` (default `USD`), dual-currency deferred — user answer (verbatim): `approved`
- Dependency: add `isomorphic-dompurify` for server-side SVG sanitization — user answer (verbatim): `approved`

---

## Phase 1 — Schema & backend foundations

### Task 1.1: Add `ShopProfile` singleton

**Files:**
- Create: `backend/prisma/migrations/20260920100000_add_shop_profile/migration.sql`
- Modify: `backend/prisma/schema.prisma` (add `ShopProfile` model + enums + User relation)
- Create: `backend/src/features/shop/shop-profile.repository.ts`
- Create: `backend/src/features/shop/shop-profile.service.ts`
- Create: `backend/src/features/shop/shop-profile.validator.ts`
- Create: `backend/src/features/shop/shop-profile.controller.ts`
- Create: `backend/src/features/shop/shop-profile.routes.ts`
- Create: `backend/src/features/shop/shop-profile.routes.test.ts`
- Modify: `backend/src/server.ts` (or wherever routes are mounted) to mount `/shop-profile`

**Interfaces:**
- Consumes: existing `User`, `verifyAdminPassword`, `ServiceAudit`.
- Produces:
  - `getShopProfile(): Promise<ShopProfileDto>` — returns `{ id, name, tagline, hasLogo, logoMimeType, logoByteSize, currencyCode, currencyDisplay, defaultPricingCardTemplateId, defaultCardValidityDays, snapshotPrintedCards, pricingCardRolloutMode }`.
  - `updateShopProfile(input, actor)` — accepts partial fields except id/logoBytes.
  - `updateShopProfileLogo(bytes, mimeType, actor)` — uploads bytes.
  - Types exported from `backend/src/features/shop/shop-profile.types.ts`.

- [ ] **Step 1:** Add the model + enums to `schema.prisma` following DATA_MODEL §2.1. Add `shopProfileUpdated User[] @relation("ShopProfileUpdatedBy")` to `User`.
- [ ] **Step 2:** Generate the migration SQL: `npx prisma migrate dev --create-only --name add_shop_profile` and inspect the SQL.
- [ ] **Step 3:** Extend the migration to `INSERT INTO shop_profiles (id, name, currency_code, ...) VALUES ('4c2b1e9f-8c4b-4a2f-8a10-30c9a04c6d21', 'Home Connect', 'USD', …) ON CONFLICT DO NOTHING;`. Leave `logo_bytes` NULL; a later migration seeds it from disk.
- [ ] **Step 4:** Write failing tests in `shop-profile.routes.test.ts`: getting returns the seeded singleton; updating without admin password 401s; updating with admin password writes a `ServiceAudit`.
- [ ] **Step 5:** Implement repository (`findSingleton()`, `updateSingleton(data)`), service (admin password + audit), validator, controller, routes. Match the shape of `label-secret-config.service.ts`.
- [ ] **Step 6:** Add `SHOP_PROFILE` to `ServiceAuditRecordType` in a small enum migration `20260920100100_add_shop_profile_audit_type`.
- [ ] **Step 7:** Run tests: `npx vitest run backend/src/features/shop/shop-profile.routes.test.ts`. All pass.
- [ ] **Step 8:** Commit: `feat(shop): add ShopProfile singleton with logo and currency`.

### Task 1.2: Seed company logo from repo file

**Files:**
- Create: `backend/prisma/migrations/20260920100200_seed_shop_profile_logo/migration.sql`
- Create: `backend/scripts/seed-shop-profile-logo.ts` (invoked from migration via `psql \i` OR a plain post-migrate script)

**Interfaces:** none

- [ ] **Step 1:** Read `homeconnects-logo.webp` from repo root, base64-encode, embed the bytes in the migration via `UPDATE shop_profiles SET logo_bytes = decode('…', 'base64'), logo_mime_type = 'image/webp', logo_byte_size = <len> WHERE id = '4c2b1e9f-…' AND logo_bytes IS NULL;`.
- [ ] **Step 2:** Verify locally: `npx prisma migrate deploy`, then `SELECT length(logo_bytes) FROM shop_profiles;` returns the file size.
- [ ] **Step 3:** Commit: `feat(shop): seed shop profile logo from repo file`.

### Task 1.3: Add `BrandLogo` catalog

**Files:**
- Create: `backend/prisma/migrations/20260920101000_add_brand_logos/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/features/brand-logo/brand-logo.{repository,service,validator,controller,routes,routes.test}.ts`
- Modify: `backend/src/server.ts` to mount `/brand-logos`
- Create: `backend/src/features/brand-logo/brand-key.ts` — exports `normalizeBrandKey(name: string): string` — MUST match the normalization used by `groupBrandSpellings` in `products.repository.ts:76` (extract that logic into a shared helper if needed and refactor the repository to call it — same commit).

**Interfaces:**
- Produces:
  - `listBrandLogos({ activeOnly? })`, `getByCanonical(name)`, `upsert({displayName, canonicalName?, bytes, mimeType}, actor)`, `archive(id, actor)`.
  - `normalizeBrandKey(brand: string | null): string | null` — the single source of truth.

- [ ] **Step 1:** Extract brand normalization into `brand-key.ts`; refactor `groupBrandSpellings` to use it. Failing test first: `expect(normalizeBrandKey('  Samsung ')).toEqual('samsung')`; `expect(normalizeBrandKey(null)).toBeNull()`.
- [ ] **Step 2:** Add `BrandLogo` model per DATA_MODEL §2.2. Migration.
- [ ] **Step 3:** Failing routes test: list is empty; POST with logo bytes + admin password creates a row; canonical name collision returns 409; SVG or malformed image bytes rejected by `product-image.ts` reused validator (extract MIME+magic-byte check into a shared helper if needed).
- [ ] **Step 4:** Implement repository/service/validator/controller/routes. Reuse the `MAX_PRODUCT_IMAGE_BYTES` pattern; enforce `MAX_LOGO_BYTES = 512 * 1024`.
- [ ] **Step 5:** Add `BRAND_LOGO` to `ServiceAuditRecordType` in the same enum migration bundle from Task 1.1 (or a follow-up if that migration is already merged).
- [ ] **Step 6:** Tests pass. Commit: `feat(brand): add BrandLogo catalog with shared brand key normalizer`.

### Task 1.4: Add `PricingCardFeatureIcon` catalog

**Files:**
- Create: `backend/prisma/migrations/20260920102000_add_pricing_card_feature_icons/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/seed-data/pricing-card-icons/*.svg` (17 seed files)
- Create: `backend/src/features/pricing-card/feature-icon/{feature-icon.repository,feature-icon.service,feature-icon.validator,feature-icon.controller,feature-icon.routes,feature-icon.routes.test}.ts`
- Create: `backend/src/features/pricing-card/feature-icon/sanitize-svg.ts` — wraps DOMPurify with `USE_PROFILES: { svg: true }` server-side (`isomorphic-dompurify`).
- Modify: `package.json` to add `isomorphic-dompurify`.

**Interfaces:**
- Produces:
  - `listFeatureIcons({ activeOnly?, category? })`, `getByCode(code)`, `createFeatureIcon(input, actor)`, `updateFeatureIcon(id, input, actor)`, `archiveFeatureIcon(id, actor)`.
  - `sanitizeSvg(input: string): string` — throws on empty / malformed / script-bearing SVG.

- [ ] **Step 1:** Approval checkpoint: add `isomorphic-dompurify` (or fall back to a hand-rolled allowlist parser — see Task 0.1 step 4). Assume approved for the plan.
- [ ] **Step 2:** Failing test in `sanitize-svg.test.ts`: rejects empty, rejects `<script>` tags, keeps `<path>`, keeps `<g>`, strips `on*` attributes.
- [ ] **Step 3:** Implement `sanitize-svg.ts`.
- [ ] **Step 4:** Add model per DATA_MODEL §2.3.
- [ ] **Step 5:** Author the 17 seed SVGs (single-color, currentColor fills, 24×24 viewBox). Store under `backend/prisma/seed-data/pricing-card-icons/`. Names match the code list in DATA_MODEL §2.3.
- [ ] **Step 6:** Migration: create table + INSERT the seed rows (SVG contents read at migration-generation time and embedded).
- [ ] **Step 7:** Failing routes test: `GET` lists seeded icons; unauthenticated POST fails; admin POST with SVG containing `<script>` fails; admin POST with clean SVG creates a row.
- [ ] **Step 8:** Implement service/validator/controller/routes.
- [ ] **Step 9:** `PRICING_CARD_FEATURE_ICON` enum extension.
- [ ] **Step 10:** Tests pass. Commit: `feat(pricing-card): add feature-icon catalog with 17 seed icons`.

### Task 1.5: Add `PricingCardTemplate` and its config validator

**Files:**
- Create: `backend/prisma/migrations/20260920103000_add_pricing_card_templates/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/features/pricing-card/template/pricing-card-template-config.z.ts` — Zod schema per DATA_MODEL §4.
- Create: `backend/src/features/pricing-card/template/pricing-card-template-config.test.ts`
- Create: `backend/src/features/pricing-card/template/{template.repository,template.service,template.validator,template.controller,template.routes,template.routes.test}.ts`
- Create: `backend/prisma/seed-data/pricing-card-templates/{tv-large,appliance-shelf,compact-legacy,large-legacy}.json`

**Interfaces:**
- Produces:
  - `listTemplates({ activeOnly? })`, `getById(id)`, `createTemplate(input, actor)`, `updateTemplate(id, input, actor)`, `archiveTemplate(id, actor)`.
  - `PricingCardTemplateConfigZ` — Zod schema exported for renderer + frontend share.
  - `parseTemplateConfig(json): PricingCardTemplateConfig` — throws on invalid.

- [ ] **Step 1:** Write the Zod schema exactly per DATA_MODEL §4. Include `.max(16 * 1024)` byte guard via `.refine(v => JSON.stringify(v).length <= 16 * 1024, …)`.
- [ ] **Step 2:** Failing schema tests: minimum valid config parses; missing `configVersion` fails; oversized (> 16 KB) fails; wrong currency enum fails.
- [ ] **Step 3:** Add model per DATA_MODEL §2.4. Add reverse relation `ShopProfile.defaultPricingCardTemplate`.
- [ ] **Step 4:** Author four seed templates as JSON files (see DESIGN §14 for the four).
- [ ] **Step 5:** Migration: create table + INSERT four templates + `UPDATE shop_profiles SET default_pricing_card_template_id = 'tv-large-uuid' WHERE default_pricing_card_template_id IS NULL;`.
- [ ] **Step 6:** Failing routes test: list returns 4 seeded; admin CRUD works; config validation rejects malformed payloads with a structured error.
- [ ] **Step 7:** Implement service/validator/controller/routes. `PRICING_CARD_TEMPLATE` audit type.
- [ ] **Step 8:** Tests pass. Commit: `feat(pricing-card): add PricingCardTemplate with validated JSON config and 4 seed templates`.

### Task 1.6: Add `ProductPricingCardFeature` per-product highlights

**Files:**
- Create: `backend/prisma/migrations/20260920104000_add_product_pricing_card_features/migration.sql`
- Modify: `backend/prisma/schema.prisma` (add model + relation on `Product`)
- Modify: `backend/src/features/service/products/products.validator.ts` (accept optional `featureHighlights` on create + update)
- Modify: `backend/src/features/service/products/products.service.ts` (persist highlights)
- Modify: `backend/src/features/service/products/products.repository.ts` (include highlights in loads)
- Create: `backend/src/features/service/products/product-pricing-card-features.ts` — pure normalize/validate; `MAX_PRODUCT_FEATURES = 8`.
- Modify: `backend/src/features/service/products/products.routes.test.ts` (extend for highlights)
- Create: `backend/src/features/service/products/product-pricing-card-features.test.ts`

**Interfaces:**
- Consumes: `PricingCardFeatureIcon.code` (validated exists at write time).
- Produces:
  - `ProductPricingCardFeatureInput { iconCode, label?, value?, position }`.
  - `normalizeProductPricingCardFeatures(entries): sorted, deduped, positions 1..N`.
  - Product payload gains `featureHighlights: ProductPricingCardFeature[]` in the detail response.

- [ ] **Step 1:** Failing pure-fn test: normalizes positions, deduplicates iconCode + position, drops empties, enforces max 8.
- [ ] **Step 2:** Implement normalizer.
- [ ] **Step 3:** Add model, migration.
- [ ] **Step 4:** Failing routes test: create product with 3 highlights → returns them ordered; update replaces; delete-all works; invalid iconCode → 400; > 8 → 400; non-admin cannot set highlights (matches existing pricing/spec authorization pattern where admin gates non-notes edits on existing products).
- [ ] **Step 5:** Wire into validator + service + repository + tests.
- [ ] **Step 6:** Commit: `feat(products): add per-product pricing-card feature highlights`.

### Task 1.7: Add `PricingCardPrint` snapshot table

**Files:**
- Create: `backend/prisma/migrations/20260920105000_add_pricing_card_prints/migration.sql`
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/features/pricing-card/print-snapshot/{print-snapshot.repository,print-snapshot.service,print-snapshot.validator,print-snapshot.controller,print-snapshot.routes,print-snapshot.routes.test}.ts`

**Interfaces:**
- Produces:
  - `recordPrint({ productId, templateId, snapshot, validUntil, copiesPrinted, hiddenPricingPresetId?, encodingPresetId? }, actor)` — writes when `ShopProfile.snapshotPrintedCards`.
  - `listPrintsForProduct(productId, limit): PricingCardPrint[]`.
  - Snapshot `.refine` guard at 8 KB.

- [ ] **Step 1:** Failing routes test: with snapshot enabled, POST writes a row; with snapshot disabled, POST returns `{ recorded: false }` and no row; snapshot > 8 KB rejected; unknown product/template 404.
- [ ] **Step 2:** Migration + model.
- [ ] **Step 3:** Implement service.
- [ ] **Step 4:** Tests pass. Commit: `feat(pricing-card): add optional print snapshot table`.

### Task 1.8: Canonical spec catalog

**Files:**
- Create: `backend/src/features/pricing-card/spec-catalog.ts` — `CANONICAL_SPEC_KEYS`, `resolveSpec(specs, canonicalKey, extraAliases?)`.
- Create: `backend/src/features/pricing-card/spec-catalog.test.ts`

**Interfaces:**
- Produces:
  - `CANONICAL_SPEC_KEYS: { readonly [K in Key]: { aliases: readonly string[]; unit?: string } }`.
  - `normalizeSpecLabel(label: string): string` — lower-case, punctuation-stripped, whitespace-collapsed.
  - `resolveSpec(specs, canonicalKey, extraAliases?): { label: string; value: string; unit?: string } | null`.
  - `parseDimensions(specs, extraAliases?): { widthMm?, heightMm?, depthMm? }`.

- [ ] **Step 1:** Failing tests: resolves `"Capacity (kg)"` → the `capacity_kg` entry; unit attached; alias override wins over base alias; case+punctuation insensitive; missing → null. `parseDimensions("60 x 85 x 55 cm")` returns each axis in mm.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Commit: `feat(pricing-card): add canonical spec catalog and tolerant resolver`.

### Task 1.9: Extend `toLabelPayload` for template mode

**Files:**
- Modify: `backend/src/features/service/products/products.service.ts` — `toLabelPayload(product, options, template?)`. When template provided, add `resolvedSpecs`, `features`, `brand` object, `currency`, `validUntil` (echoed from request), `templateId`, `dimensionsMm`.
- Modify: `backend/src/features/service/products/products.validator.ts` — extend `productLabelQuerySchema` and `productLabelsQuerySchema` with optional `templateId` (uuid) and `validUntil` (`YYYY-MM-DD`).
- Modify: `backend/src/features/service/products/products.routes.ts` — accept the new params.
- Modify: `backend/src/features/service/products/products.labels.test.ts` — assert the no-template path is unchanged (allow-list at line 80 stays intact); assert the with-template path returns the extended shape.
- Modify: `backend/src/features/service/products/products.controller.ts` — thread the new options.

**Interfaces:**
- Consumes: template + spec-catalog + `BrandLogo.getByCanonical` + `PricingCardFeatureIcon.getByCode` + `ShopProfile.currencyCode`.
- Produces: extended `ProductLabelData` per DATA_MODEL §5.

- [ ] **Step 1:** Failing test: without `templateId`, response keys exactly match today's allow-list.
- [ ] **Step 2:** Failing test: with `templateId=<tv-large>`, response includes `resolvedSpecs` (matching template's `specKeyOrder`), `features` (in position order, `iconSvg` inlined), `brand: { canonicalName, displayName, hasLogo }`, `currency: { code, display, symbol }`, `validUntil` echoed.
- [ ] **Step 3:** Failing test: unknown `templateId` → 404. Archived template → warning `TEMPLATE_INACTIVE` + still renders. Feature icon deactivated after highlight created → returns entry with `iconMissing: true` and no `iconSvg`.
- [ ] **Step 4:** Implement, taking care to keep the no-template code path bit-identical.
- [ ] **Step 5:** All existing label tests still pass. Commit: `feat(products): extend label payload for pricing-card templates`.

### Task 1.10: Extend `toLabelPayload` for print-snapshot response

**Files:**
- Modify: `backend/src/features/service/products/products.service.ts` — add `POST /products/pricing-cards/print-snapshot` route wiring to `PricingCardPrintService.recordPrint`.
- Modify: `backend/src/features/pricing-card/print-snapshot/print-snapshot.routes.test.ts` — end-to-end shape check.

- [ ] **Step 1:** Route lives under `/products/pricing-cards/print-snapshot` for symmetry with the existing labels routes.
- [ ] **Step 2:** Failing test: after a print, `GET /products/:id/pricing-cards/prints` lists the snapshot.
- [ ] **Step 3:** Implement + commit.

---

## Phase 2 — Frontend renderer & shared types

### Task 2.1: Frontend types + Zod share

**Files:**
- Create: `frontend/src/features/pricing-card/types/pricing-card.types.ts` — mirrors backend `ProductLabelData` extensions.
- Create: `frontend/src/features/pricing-card/api/pricing-card.api.ts` — client for template + feature-icon + brand-logo + shop-profile endpoints.
- Create: `frontend/src/features/pricing-card/hooks/usePricingCard.ts`, `useShopProfile.ts`, `usePricingCardTemplates.ts`, `useFeatureIcons.ts`, `useBrandLogos.ts`.
- Optionally share the Zod config schema from backend via a symlink `frontend/src/features/pricing-card/schema/template-config.z.ts` (or copy + a test that asserts they stay in sync).

- [ ] **Step 1:** Copy the Zod config schema to frontend; add a `template-config-parity.test.ts` that imports both and asserts a canonical minimum payload parses identically in both.
- [ ] **Step 2:** Type + API client + hooks. React-Query keys mirror the existing product hooks style.
- [ ] **Step 3:** Commit.

### Task 2.2: `<PricingCard>` renderer + block library

**Files:**
- Create: `frontend/src/features/pricing-card/components/PricingCard.tsx` — top-level renderer.
- Create: `frontend/src/features/pricing-card/components/blocks/{CompanyLogo,BrandMark,Title,Model,Dimensions,Specs,Features,Image,Price,ValidUntil,Sku,Barcode,Footer}.tsx`.
- Create: `frontend/src/features/pricing-card/components/PricingCard.css` (imported once from `styles/index.css`).
- Create: `frontend/src/features/pricing-card/components/PricingCard.test.tsx` — snapshot suite per template × sample.
- Create: `frontend/src/features/pricing-card/samples/*.ts` — sample products (TV, washer, fridge, trimmer, minimal, huge).

- [ ] **Step 1:** Failing snapshot test: renders TV Large template with the TV sample; asserts DOM includes brand text, price, all four features, barcode SVG, valid-until.
- [ ] **Step 2:** Failing snapshot test: minimal product (no image, no dimensions, no features) still renders — no empty rows, no NaN in styles.
- [ ] **Step 3:** Implement the renderer: reads template config, iterates blocks in region order, passes CSS custom properties (see PRINTING §3).
- [ ] **Step 4:** Implement each block. `Features` uses `dangerouslySetInnerHTML` for icons (already sanitized server-side).
- [ ] **Step 5:** `Barcode` block wraps `barcode-geometry.ts` verbatim — pass `template.config.barcode.targetWidthMm` as the available width.
- [ ] **Step 6:** All snapshot tests pass. Commit.

### Task 2.3: Print CSS surfaces

**Files:**
- Modify: `frontend/src/styles/index.css` — add `.pricing-card` and `.pricing-card-page` rules (mirror `.product-label` / `.label-page`).
- Create: `frontend/src/features/pricing-card/components/PricingCardPage.tsx` — sheet host analogous to `ProductLabelSheet`, reusing `label-sheet-layout.ts`.
- Create: `frontend/src/features/pricing-card/utils/print-pricing-cards.ts` — Electron/browser bridge analogous to `print-labels.ts`.

- [ ] **Step 1:** Add global CSS. No `@page` here — surfaces inject their own.
- [ ] **Step 2:** Implement sheet host. Reuse `chunkIntoPages`, `usePreviewScale`.
- [ ] **Step 3:** Print bridge — Electron path calls `window.electronAPI.printLabels({ widthMm, heightMm })` today; extend `desktop/src/label-print.ts` to accept up to 210 mm.
- [ ] **Step 4:** Commit.

### Task 2.4: Raise Electron mm bounds

**Files:**
- Modify: `desktop/src/label-print.ts` — `labelPrintOptions()` bound raised from `<= 150` to `<= 210`.
- Modify: `desktop/src/preload.test.ts`, add `label-print.test.ts` if missing.
- Modify: `desktop/src/index.ts` — no change to `labels:exportPdf` semantics, but assert A6/A5 sizes work end-to-end via manual test on real Electron.
- Modify: frontend numeric input bounds in the print-settings controls: `.max(210)`.

- [ ] **Step 1:** Failing test: passing `widthMm: 200` no longer throws.
- [ ] **Step 2:** Raise the bound. Ensure `< 20 mm` still rejected. Commit.

---

## Phase 3 — Employee print flow

### Task 3.1: Employee print route (single)

**Files:**
- Create: `frontend/src/pages/products/ProductPricingCardPage.tsx` — `/products/:id/pricing-card`.
- Modify: `frontend/src/App.tsx` / router config — add the route.
- Modify: `frontend/src/features/products/components/ProductDetailsDrawer.tsx` — add "Print pricing card" button next to the legacy "Print label".
- Create: `frontend/src/pages/products/ProductPricingCardPage.test.tsx`.

- [ ] **Step 1:** Failing test: renders template picker (default from `ShopProfile`), copies input, valid-until, feature toggles, preview. Print button disabled until template loaded.
- [ ] **Step 2:** Implement using the hooks + `<PricingCard>`. Reuse `LabelSecretPrintControls` (admin-only) verbatim; wire to the new endpoint's secret-preview variant.
- [ ] **Step 3:** After successful print, POST to snapshot endpoint (best-effort, non-blocking).
- [ ] **Step 4:** Commit.

### Task 3.2: Employee print route (sheet)

**Files:**
- Create: `frontend/src/pages/products/ProductPricingCardsPage.tsx` — `/products/pricing-cards?ids=…`.
- Modify: `frontend/src/features/products/components/ProductBulkActionsBar.tsx` — add "Print pricing cards" action.

- [ ] **Step 1:** Failing test: with 3 ids, renders 3 preview cards in the current template's grid; page count updates.
- [ ] **Step 2:** Implement. Reuse `PricingCardPage` sheet host.
- [ ] **Step 3:** Commit.

---

## Phase 4 — Admin editor

### Task 4.1: Shop profile settings page

**Files:**
- Create: `frontend/src/pages/settings/ShopProfilePage.tsx`.
- Create: `frontend/src/features/pricing-card/components/ShopProfileForm.tsx` + `.test.tsx`.

- [ ] **Step 1:** Failing test: loads singleton; edits require admin password; logo upload preview + save works; commits refresh the query cache.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Commit.

### Task 4.2: Feature icon catalog page

**Files:**
- Create: `frontend/src/pages/settings/FeatureIconsPage.tsx`.
- Create: `frontend/src/features/pricing-card/components/FeatureIconGrid.tsx`, `FeatureIconEditor.tsx`, `SvgUploadField.tsx`.

- [ ] **Step 1:** Failing test: displays 17 seeded icons; add new via SVG paste; malformed SVG rejected with server error rendered; category filter works.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Commit.

### Task 4.3: Brand logo catalog page

**Files:**
- Create: `frontend/src/pages/settings/BrandLogosPage.tsx`.
- Create: `frontend/src/features/pricing-card/components/BrandLogoEditor.tsx`, `BrandsMissingLogosPanel.tsx`.

- [ ] **Step 1:** Failing test: list empty; "Add from products" pulls top 10 uncovered brands; add + preview + save.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Commit.

### Task 4.4: Template editor page

**Files:**
- Create: `frontend/src/pages/settings/PricingCardTemplateEditorPage.tsx`.
- Create: `frontend/src/features/pricing-card/components/{TemplateControlsForm,TemplatePreviewPane,SpecKeyOrderList,SampleProductPicker}.tsx`.
- Create: `frontend/src/features/pricing-card/components/PricingCardTemplateEditor.test.tsx`.

- [ ] **Step 1:** Failing test: loads TV Large template; toggling "hide brand" updates preview live; save requires admin password + reason; "Save as new" clones instead of overwrites.
- [ ] **Step 2:** Implement each control per EDITOR_UX §2. Preview reuses `<PricingCard>`.
- [ ] **Step 3:** Commit.

### Task 4.5: Product form — feature highlights section

**Files:**
- Modify: `frontend/src/features/products/components/ProductFormDialog.tsx`.
- Create: `frontend/src/features/products/components/ProductFeatureHighlightsEditor.tsx` + `.test.tsx`.

- [ ] **Step 1:** Failing test: section renders empty state; picker shows icons grouped by category; drag reorders; save persists.
- [ ] **Step 2:** Implement. Admin-only editing on existing products (matches pricing/spec pattern).
- [ ] **Step 3:** Commit.

---

## Phase 5 — Migration & rollout

### Task 5.1: Rollout gate

**Files:**
- Modify: `ProductDetailsDrawer.tsx`, `ProductLabelPage.tsx`, `ProductLabelsPage.tsx` — check `ShopProfile.pricingCardRolloutMode`; hide legacy buttons in `PRICING_CARD_ONLY`, hide new buttons in `LEGACY_ONLY`.

- [ ] **Step 1:** Failing test per surface × rollout mode.
- [ ] **Step 2:** Implement.
- [ ] **Step 3:** Commit.

### Task 5.2: Compact-Legacy & Large-Legacy visual parity

**Files:**
- Modify: `backend/prisma/seed-data/pricing-card-templates/compact-legacy.json` and `large-legacy.json` until the rendered card is visually indistinguishable from the current `ProductLabel` at those sizes.

- [ ] **Step 1:** Manual QA against production labels. Iterate until parity.
- [ ] **Step 2:** Update templates via a data migration `20260920200000_update_legacy_template_visuals` (idempotent `UPDATE …`).
- [ ] **Step 3:** Commit.

### Task 5.3: Docs, release notes, migration guide

**Files:**
- Modify: `README.md`, `docs/…` as fits the repo.
- Create: `docs/release-notes/v2.1.0-pricing-cards.md`.

- [ ] **Step 1:** Document the rollout modes and how to switch.
- [ ] **Step 2:** Include screenshots of the new editor and print flow.
- [ ] **Step 3:** Commit.

### Task 5.4: End-to-end scan test on real hardware

**Files:** none (manual)

- [ ] **Step 1:** Print each seeded template at nominal size on the XP-80T. Scan every barcode with a store scanner. Any failure → open a bug, do not release.
- [ ] **Step 2:** Print a sheet template on the office A4 printer; scan.
- [ ] **Step 3:** Document results in the release notes.

---

## Self-review notes

- Every spec requirement in the user's brief maps to at least one task above:
  - Company logo → Tasks 1.1, 1.2, 4.1.
  - Brand display → Tasks 1.3, 4.3, block `BrandMark`.
  - Feature icons → Tasks 1.4, 1.6, 4.2, 4.5, block `Features`.
  - Category-adaptive rendering → Tasks 1.8, 1.9, 2.2 (via canonical spec catalog + template `specKeyOrder`).
  - Valid until → Tasks 1.9, 2.2 (block `ValidUntil`), 3.1 (per-print picker).
  - Secret code preserved → Task 1.9 (payload preserves current fields) + block `Sku` (uses `formatStaffLabelCode`).
  - Barcode preserved → Task 2.2 block `Barcode` reuses `barcode-geometry.ts` unchanged.
  - Template editor → Task 4.4; controlled slots per EDITOR_UX §2.
  - Preview → Tasks 2.2, 3.1, 4.4.
  - Printing → Tasks 2.3, 2.4, 3.1, 3.2.
  - Snapshotting → Tasks 1.7, 3.1 (best-effort POST after print).
  - Backwards compatibility → Task 5.1 (rollout gate), Task 5.2 (legacy templates).
- Task granularity: each task ends with a commit + independently testable deliverable; setup steps (schema + repository + service) fold into the task whose deliverable needs them.
- Type consistency: `iconCode`, `staffLabelCode`, `barcodeValue`, `currencyCode`, `validUntil`, `templateId` names are used identically across all tasks and the DATA_MODEL doc.

## Estimated effort (rough calendar)

| Phase | Tasks | Effort (dev-days) |
| ----- | ----- | ----------------- |
| 0     | 1     | 0.5               |
| 1     | 10    | 6–8               |
| 2     | 4     | 4–5               |
| 3     | 2     | 2–3               |
| 4     | 5     | 5–7               |
| 5     | 4     | 2–3 + hardware QA |
| **Total** | **26 tasks** | **20–27 dev-days** |
