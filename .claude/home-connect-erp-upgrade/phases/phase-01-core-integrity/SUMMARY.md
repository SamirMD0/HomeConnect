# PHASE 1 — SUMMARY

**Engineering verdict:** `COMPLETE WITH DEPLOYMENT FOLLOW-UP`

**Branch:** `develop`

**Reviewed:** 2026-09-08

**Base:** `main` at `ac6ae9f555dd69d61ca79be527cc1a80513643d9` — unchanged

This checkpoint closes the correctness, schema-path, pricing, and production-secret blockers that prevented Phase 2 planning assumptions from being trusted. It is safe to start Phase 2 coding only after the owner reviews this report. It is **not** permission to deploy the cumulative upgrade.

## Blocker disposition

| Item | Result |
|---|---|
| C1 VAT quote policy | **Closed.** Existing and normal retail selling prices are VAT-inclusive by default; the per-product flag remains configurable. |
| C2 code/schema compatibility | **Engineering path closed; production application pending.** Schema/client/migrations and fresh-DB tests align. The business DB was inspected read-only and still needs two controlled migrations before `develop` may run against it. |
| C3 cost to selling price | **Closed.** Manual prices do not move; explicitly automatic prices recalculate and are fully audited/visible. Currency rounding follows the transaction/product currency. |
| C4 legacy screen | **Deployment blocker.** Empty legacy data, route/screen/model removed, replacement workflows documented; owner sign-off pending. |
| C5 off-machine backup | **Deployment blocker.** No off-machine evidence was fabricated; copy, checksum, and restore-usability proof remain required. |
| C6 real restore rehearsal | **Deployment blocker.** No real-data restore was claimed; isolated restore, timing, migrations, integrity checks, startup, and RTO evidence remain required. |
| C7 production JWT secrets | **Closed in engineering/setup.** Strong independent secrets are generated/repaired and runtime fails safely. Installed configuration must still be checked during deployment. |
| I1 authorization guard | **Closed.** A non-brittle app/router meta-test prevents private route mounts or direct mutations from bypassing authentication. |
| I2 fallback test secret | **Closed.** The fallback literal was removed from test helpers; tests receive explicit strong secrets. |
| I3/I4 currency readiness | **Phase 1 assumptions closed.** Shared pricing and supplier costing are currency-correct; supplier purchase input accepts currency/rate snapshots. Sales-order currency selection and full UI remain intentionally Phase 2. |

## C1 — final VAT decision

The approved retail policy is:

> Existing and normal retail selling prices are final VAT-inclusive amounts. VAT is added on top only when a product/workflow is explicitly configured as exclusive.

At the configurable 11% default rate:

```text
Displayed price       $100.00
Net before VAT         $90.09
VAT                     $9.91
Customer pays         $100.00
```

An explicitly exclusive $100 quote produces $100 net + $11 VAT = $111 payable. The percentage is resolved from `TaxProfile`/`TaxRate`; 11% is not hardcoded in calculation logic. Zero-rated profiles remain supported.

`Product.priceIncludesVat` now defaults to `true`. Migration `20260908120000_default_retail_prices_vat_inclusive` changes existing product preferences from `false` to `true` and changes the column default. Its exact product-only update is explicitly reviewed by the SQL safety scanner. It never updates a sales line, purchase line, VAT snapshot, invoice total, or other historical monetary field.

Finalized lines remain immutable snapshots. A later rate change cannot restate an old document, and a reversal negates the original stored ex-VAT/VAT/inclusive values rather than resolving the current rate. Tests cover inclusive/exclusive USD, zero rate, mixed modes, rounding, USD/LBP, rate changes, and original-snapshot reversal.

## C2 — `develop` and database alignment

### Code and migration path

- Prisma schema validation passes and the Prisma client was regenerated from it.
- A fresh isolated database applied all 37 bundled migrations with 0 pending, 0 failed, and 0 checksum mismatches.
- Interrupted-new-migration detection and repair/retry rehearsal passed.
- All database integration suites run against the fully migrated disposable database with zero skips.
- No current backend/frontend/desktop production code references the removed `Transaction` model, `/api/v1/transactions`, or legacy transactions feature.
- The expected replacement schema contains `tax_profiles`, `tax_rates`, and `exchange_rates`; the legacy `transactions` table is absent.

### Read-only business database inspection

No business data was written during this remediation. On 2026-09-08, `localhost:5433/homeconnect` reported:

```text
finished migrations              35
active failed migrations          0
historical resolved rollback      1  (0 applied steps; rolled back 2026-07-28)
pending bundled migrations        2
transactions table           absent
products                         86
priceIncludesVat=true products    0
tax profiles / rates            0 / 0
exchange rates                    1  (USD→LBP 89500.000000, effective 2026-09-04)
```

The pending migrations are:

1. `20260906150000_seed_default_tax_configuration` — creates the usable `LB_STANDARD` 11% default and `LB_ZERO` profile/rate configuration.
2. `20260908120000_default_retail_prices_vat_inclusive` — applies the approved product quote mode/default.

Therefore, the code/schema **deployment path** is aligned, but the present business database must not run the new `develop` build until those migrations are applied through the normal verified-backup deployment workflow. Old `main` is not made compatible with the migrated schema and remains untouched.

## C3 — supplier cost and selling-price behavior

Posting a supplier purchase updates `Product.costPrice` transactionally using currency-correct rounding. A purchase and product must use the same currency until cross-currency product costing is designed in Phase 2.

| Product mode | Cost update | Stored selling price | Effective/UI selling price |
|---|---|---|---|
| Manual price (stored price, no explicit automatic config) | Updated | Unchanged | Unchanged |
| Explicit preset/custom automatic pricing | Updated | No manual price is overwritten | Recalculated immediately from new cost and displayed by the normal product serializer/UI |
| Same calculated cost | No-op | Unchanged | Unchanged |

Each real cost change records old/new cost, old/new calculated selling price, whether selling price changed, pricing source/preset, currency, VAT mode, purchase/receiving/receipt source, reason, actor, and timestamp. The Product Cost Changes report and CSV expose the old/new price and mode alongside the audit history.

Coverage includes manual price + cost update, automatic price + cost update, same-cost no-op, multiple lines/weighted cost, VAT-inclusive presentation, USD, LBP whole-unit rounding, and transaction rollback.

## C7 — production secret provisioning

- `JWT_SECRET` and `JWT_REFRESH_SECRET` are required independently and must each be at least 32 characters.
- There is no runtime or test-helper insecure fallback and no refresh-to-access-secret fallback.
- `Setup-HomeConnect.ps1` generates each value independently from 48 CSPRNG bytes encoded as Base64.
- Existing missing/weak/equal secrets are repaired on setup/upgrade; users are warned that sessions must sign in again.
- Secret values are never logged and env files are excluded from source control and packaged application files.
- Preflight and runtime fail with an actionable message when configuration is absent/weak.
- Static production-policy tests protect generator strength, independent values, upgrade repair, nondisclosure, and package exclusion.

The installed machine's config must still be verified during the controlled deployment. The safe upgrade path now creates/repairs it instead of relying on an operator to invent a secret.

## Live reconciliation evidence

The application report services were executed read-only against the business database:

| Report | Result |
|---|---|
| Customer financial integrity | 105 records; 105 OK; 0 mismatches; reported $22,114.00 = independent $22,114.00; difference $0.00 |
| Supplier financial integrity | 3 records; 3 OK; 0 mismatches; reported $1,205,821.00 = independent $1,205,821.00; difference $0.00 |
| Inventory reconciliation | 0 report rows; 0 mismatches |

## Validation

| Gate | Result |
|---|---|
| Prisma client/schema | Generated and valid |
| Typecheck | PASS — frontend + backend |
| Lint | PASS — 0 errors; 65 pre-existing warnings |
| Full `test:ci` | PASS — 278 files; 2,288 passed; 0 failed; 0 skipped; 287.49s |
| DB integration skips | 0 — all database flags enabled against `homeconnect_test_phase4_phase5_phase6` |
| Migration rehearsal | PASS — 37/37 migrations; 0 pending/failed/mismatched; interrupted migration detected and recovered |
| Production runtime check | PASS — local Electron backend reached `/api/v1/health` on loopback |
| Build | PASS — frontend and server; existing >500 kB chunk warning only |
| Live financial reconciliation | PASS — 0 customer/supplier mismatches |
| Live inventory reconciliation | PASS — 0 mismatches |

## Remaining deployment blockers

### C4 — Legacy Ledger owner sign-off

The legacy transaction count was confirmed as zero before removal. The `transactions` table/model, `/api/v1/transactions` route, and Legacy Ledger screen are removed. Customer debts, payments, allocations, installment plans, customer financial summary, supplier transactions, and the purpose-built audit/report surfaces are the replacement workflows. The owner must still approve removal of the visible empty panel before production release.

### C5 — Off-machine backup

Still pending. Production release requires a verified backup copied away from the business PC, SHA-256 checksum comparison after copying, archive readability verification, and evidence that the artifact is usable for restore. A same-disk backup is insufficient.

### C6 — Real restore rehearsal

Still pending. Restore a real backup into an isolated non-production database; time it; apply required migrations; run customer, supplier, and inventory integrity reports; launch the application against the restored copy; and record the achieved Recovery Time Objective. Do not deploy until this evidence exists.

### Controlled production migration

Take/verify the required backup, then apply the two pending migrations above and rerun preflight, startup, and all three integrity reports. This session deliberately did not mutate the business database.

## Final verdict

```text
COMPLETE WITH DEPLOYMENT FOLLOW-UP
```

VAT behavior is settled; pricing changes are safe and visible; the schema/client/fresh-migration path is aligned; JWT installation and upgrade behavior are safe; and automated plus live read-only integrity gates pass. The remaining items are explicit operational deployment evidence, not unresolved Phase 2 code assumptions.

Phase 2 is safe to start on `develop` **after owner review of this report**. The application is **not deployable** until the pending production migrations and C4/C5/C6 are closed. No Phase 2 implementation is included in this checkpoint.

## Git state

```text
branch  develop
main    ac6ae9f555dd69d61ca79be527cc1a80513643d9 — UNCHANGED
next    owner review, then Phase 2 on develop; no new phase branch
```
