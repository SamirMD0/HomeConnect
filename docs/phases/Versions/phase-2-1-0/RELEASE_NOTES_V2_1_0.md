# HomeConnect v2.1.0 — Pricing Cards

A category-agnostic replacement for the printed product label. The
`ProductLabel` you know still ships and still works; alongside it, a new
template-driven **pricing card** renderer prints modern shelf cards for TVs,
appliances, small appliances, and everything in between — from the same
product data.

One renderer, many templates. Every card is a **PricingCardTemplate** row
(validated JSON) combined with a product and a resolved price. Templates,
feature icons, brand logos, and the company logo are admin-managed data:
adding a new "Dolby Vision" badge or an LG logo is a settings screen, not a
code change.

## What ships in this release

### The renderer, the blocks, and the templates
- `<PricingCard>` — one React component reads the template config and emits
  mm-accurate DOM. Blocks (`CompanyLogo`, `BrandMark`, `Title`, `Model`,
  `Dimensions`, `Specs`, `Image`, `Features`, `Price`, `ValidUntil`, `Sku`,
  `Barcode`, `Footer`) collapse cleanly when a product does not carry the
  data — the same template renders a TV, a washing machine, and a trimmer
  without any `if (category === …)` branching.
- Four templates seed on first migrate: **TV Large Card** (148 × 105 mm),
  **Appliance Shelf Card** (105 × 74 mm), **Compact Legacy** (58 × 40 mm),
  and **Legacy Large** (72 × 50 mm). The two legacy templates are tuned to
  match the printed output of the pre-v2.1.0 label.
- Barcode rendering reuses `barcode-geometry.ts` unchanged: 0.375 mm module
  at 203 DPI on the XP-80T, digits under the bars equal the encoded value.
  The secret price code is never in the barcode payload.

### Admin catalogs and settings
- **Shop profile** at `/settings/pricing-cards/shop-profile` — company logo,
  tagline, currency + display format, default template, default valid-until
  days, snapshot policy, and rollout mode.
- **Feature icons** at `/settings/pricing-cards/feature-icons` — grid of the
  17 seeded icons plus admin add/edit/archive of new ones. SVG is sanitized
  server-side (script tags and `on*` handlers stripped). Icon codes are
  immutable after save so per-product highlights never lose their reference.
- **Brand logos** at `/settings/pricing-cards/brand-logos` — a lookup keyed
  by canonical brand name. "Add from products" pulls the top ten uncovered
  brands by product count so admins fill the highest-ROI gaps first.
- **Pricing card templates** at `/settings/pricing-cards` — list every
  template with its paper mode, size, feature cap, spec-key count, and
  archived state; open one in a two-pane editor with a live preview against
  a sample product picker (TV, washer, fridge, trimmer, minimal, long-title).

### Product form
- The product form gains a **Feature highlights** section between
  Specifications and Pricing. Admins pick 0–8 icons from the catalog, add
  an optional short value ("9 kg"), drag entries up and down, and remove
  them. Employees see the section read-only. Saves route through the
  dedicated `PATCH /products/:id/features` endpoint with admin-password
  verification.

### Employee print flow
- Single card at `/products/:id/pricing-card` — template picker, copies,
  valid-until (defaults to today + template days → shop days), per-print
  feature toggles, live preview, admin-only secret pricing panel, best-
  effort print snapshot on success.
- Sheet print at `/products/pricing-cards?ids=…` — the selected products
  render on an A4 sheet using the current template scaled to sheet mode.
- Both entry points appear alongside the legacy label buttons in the
  product drawer and the bulk-actions bar.

### Data & auditing
- Every mutation across shop profile, brand logos, feature icons, templates,
  and per-product highlights runs through the existing admin-password chain
  and writes a `ServiceAudit` row under `SHOP_PROFILE`, `BRAND_LOGO`,
  `PRICING_CARD_FEATURE_ICON`, or `PRICING_CARD_TEMPLATE`.
- Every printed card can, optionally, be snapshotted to
  `PricingCardPrint` (product id, template id, resolved fields, valid-until,
  currency, pricing preset id) so the exact card can be reprinted later
  even if the product's price changed. The toggle lives on the shop
  profile; snapshotting is on by default and never blocks the print if it
  fails.

## Rollout mode

The shop profile carries a `pricingCardRolloutMode` with three options:

- **BOTH** (default) — legacy `Print label` and new `Print pricing card`
  buttons both appear in the drawer and the bulk-actions bar. Employees
  choose per print.
- **LEGACY_ONLY** — pricing-card entry points are hidden and direct card
  URLs redirect to their legacy mirror. Nothing about the pricing-card
  backend is turned off; the switch is entirely presentational.
- **TEMPLATE_ONLY** — legacy label entry points are hidden and direct label
  URLs redirect to their pricing-card mirror.

Flip the mode from Settings → Shop profile → Rollout mode. Each save goes
through the admin-password chain and is audited under `SHOP_PROFILE`.

## Migrations

All additive, all deployed by `npx prisma migrate deploy`:

1. `20260920100000_add_shop_profile` — singleton `shop_profiles` table +
   seeded row + `SHOP_PROFILE` audit type.
2. `20260920100200_seed_shop_profile_logo` — reads the on-disk company logo
   into `shop_profiles.logo_bytes` on first deploy.
3. `20260920101000_add_brand_logos` — `brand_logos` catalog + `BRAND_LOGO`
   audit type.
4. `20260920102000_add_pricing_card_feature_icons` — `pricing_card_feature_icons`
   catalog seeded with 17 icons + `PRICING_CARD_FEATURE_ICON` audit type.
5. `20260920103000_add_pricing_card_templates` — `pricing_card_templates`
   table seeded with the four templates + `PRICING_CARD_TEMPLATE` audit
   type + shop-profile default pointer.
6. `20260920104000_add_product_pricing_card_features` — per-product
   ordered highlights (max 8) keyed by icon code (not FK, so archiving an
   icon does not lose history).
7. `20260920105000_add_pricing_card_prints` — optional print snapshot
   table with product/template FKs and the `snapshot` JSON.
8. `20260920200000_update_legacy_template_visuals` — brings the compact
   and large legacy templates to `borderPx=1`, `sectionDividers=true` so
   they match the pre-v2.1.0 label at 58 × 40 and 72 × 50 stock.

No existing column is dropped or retyped. Every new column is nullable or
defaulted; existing rows need no backfill.

## Hardware QA gate (mandatory before shipping)

Automated tests cover the payload, geometry, sanitizer, and template
config. Physical print + scan is a manual gate that only the operator can
close. Do not ship this release until every row is a pass.

| # | Template | Stock / Printer | Barcodes to scan | Result |
|---|---|---|---|---|
| 1 | TV Large Card | XP-80T · 148 × 105 mm | one barcode, 5 cm and 20 cm | ☐ |
| 2 | Appliance Shelf Card | XP-80T · 105 × 74 mm | one barcode, 5 cm and 20 cm | ☐ |
| 3 | Compact Legacy 58 × 40 | XP-80T thermal roll | one barcode, 5 cm and 20 cm | ☐ |
| 4 | Legacy Large 72 × 50 | XP-80T thermal roll | one barcode, 5 cm and 20 cm | ☐ |
| 5 | Any sheet template | Office A4 printer | twelve barcodes on one page | ☐ |
| 6 | Compact Legacy vs. current `ProductLabel` | XP-80T, side-by-side | visual comparison — "indistinguishable" | ☐ |
| 7 | Legacy Large vs. current `ProductLabel` | XP-80T, side-by-side | visual comparison — "indistinguishable" | ☐ |

Every scan must succeed on the first try. Every visual comparison must be
called indistinguishable by the operator. Record the outcome above and
attach photographs of any failure to the ticket that blocks the release.

## Upgrade

Install-over-the-top from v2.0.1. `npx prisma migrate deploy` runs the eight
migrations in order. The shop profile seeds itself, the default template
seeds itself, `pricingCardRolloutMode` defaults to `BOTH`, and no product
row needs a backfill.
