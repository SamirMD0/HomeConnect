# Migration audit

65 bundled migrations; 33 committed migrations differ from main, plus the uncommitted CSV-import migration (34 release-scope SQL files). Inspected ordering, SQL, defaults, nullability, indexes, FK actions, enum ordering and data updates. Full-chain safety results: evidence/migration-scan.json. Scanner flags the intentional legacy DROP; it was not silenced.

## Execution

- Fresh CI database: all 65 deployed in 12.649 seconds. Fresh browser database: 5.761 seconds. See migrate-ci.log and migrate-browser.log.
- A fresh database needs seed/config bootstrap after users exist: default VAT migration deliberately cannot create user-owned rates before the first user. The browser fixture now mirrors LB_STANDARD 11% and LB_ZERO configuration.
- Real business backup restored in isolation. No failed/pending migrations, but two checksum mismatches. The backup already contained all candidate migration records, so applyPending returned an empty list: this is NOT proof of a populated old-main-to-current upgrade.
- Repeated recovery timing and status: evidence/recovery-rehearsal.json. Current backend health succeeds on the restored copy despite checksum warnings. Health does not certify migration consistency.
- Original counts, payment hash and monetary totals are retained in source-before.json, restored-before.json and restored-after.json. No source writes were issued.

## Blocking history mismatch

`20260924100000_add_appliance_shelf_thermal_template`: stored checksum `863e3e6e201cd7c99d499a9fe0c5f83ceb8a51ab9e1ea5b185adbcc41259219a` exactly equals the original LF SQL at commit `4aa36bc`. Commit `e9bbeda` edited that historical migration from 120×80 to 76×50. HEAD checksum is `c0aadf8748468470579ed69df9a9ad28114c2f4044c070de039649e22a283330`. The subsequent refinement targets 76×50 only. An installation retaining the original 120×80 seed can therefore miss the refinement. This restored copy currently has 76×80; it does not demonstrate that every earlier install converges.

`20260914180000_add_product_categories`: stored checksum matches the CRLF encoding of current SQL; HEAD/disk LF differs. This is an explained line-ending mismatch, not evidence of changed DDL. It still needs a reviewed, deterministic history policy; do not simply mark checksums resolved.

No applied migration or `_prisma_migrations` checksum was altered by this audit. Required next step: agree an immutable historical baseline plus an idempotent forward migration that distinguishes untouched old seeds from operator-customized templates, rehearse both states, and resolve metadata only with explicit evidence/approval.

### 2026-09-28 update — synthetic rehearsal complete, awaiting real-shape rehearsal

- Draft forward migration `20260928010000_reconcile_thermal_template_variants` written at `<scratchpad>/thermal-reconcile/candidate-migration.sql`. **Not committed** to `backend/prisma/migrations/`.
- Customization guard derived from the actual historical seed definitions (git `4aa36bc` variant A, git `e9bbeda` variant B), not a guessed list: strict equality on every seed-owned field (`name`, `paperMode`, `paperSize`, `configVersion`, `specKeyOrder`, `defaultValidityDays`, plus variant-specific `description`, `cardWidthMm`, `cardHeightMm`, `featureMax`, and the full `config` JSONB).

**Candidate migration review (2026-09-28):**

| Concern | Finding |
|---|---|
| Transactional safety | Prisma runs each `.sql` file inside an implicit transaction; the `CREATE TABLE IF NOT EXISTS` and `DO $reconcile$ … $$` are one logical unit and roll back together on any error. No unhandled exceptions in the DO block (all branches complete). No SAVEPOINT/subtransaction gymnastics needed. |
| Customization preservation | Guard is strict `=` on all seed-owned fields; JSONB equality uses PostgreSQL's canonical form, so key order and whitespace do not confuse it. Skipped-row branch touches nothing and emits a `SKIPPED_CUSTOMISED` note with the exact `diffFields`. |
| Repeat behaviour | `ALREADY_CURRENT` short-circuits the UPDATE when the row already matches variant C. Verified in rehearsal scenario 8b. |
| Audit-table compatibility | `_thermal_template_reconcile_notes` is a plain table with `BIGSERIAL PRIMARY KEY`. Leading underscore aligns with `_prisma_migrations` but does not conflict with it. **Not** added to `schema.prisma`; a future `prisma db pull` would flag it as an unknown table, which is acceptable for an ops-only audit trail but should be documented in the migration comment header and in the ops runbook so nobody removes it later. |
| Concurrency | Migrations do not run in parallel; the row-level UPDATE is compatible with concurrent reads from the running app. No advisory-lock needed. |
| Failure mode of the UPDATE | The only way the UPDATE can fail is a constraint violation on the fixed target columns (all values are literals or come from `variant_c_config`). No FK or unique-index change; the row keeps its stable UUID id. |

**Evidence that would close blocker #1 in full (still missing):**

1. Rehearsal against a **real** 120×80-era snapshot — a redacted copy of a customer database from before commit `e9bbeda`. Synthetic fixtures reproduce the seed state exactly but not the ambient database (audit rows, FK graph size, tax profile shape, etc.).
2. Rehearsal that exercises the `pricing_card_templates` row alongside **live product assignments** — a product with `pricingCardTemplateId = '20000000-0000-4000-8000-000000000005'` must remain functional after the geometry change. The rehearsal DB did not seed products against the template.
3. Verification that `prisma migrate status` / `prisma migrate deploy` report only the expected two drifted rows on a real installation after the forward migration lands — synthetic DB was migrated fresh so it has no historical drift to observe.
4. Behaviour after a rolled-back prior attempt: if `_thermal_template_reconcile_notes` already exists with a partial batch of notes, the migration should still be safe. Not exercised.
5. Backup / restore round-trip: pg_dump + pg_restore of the rehearsal DB, then run migration on the restore, then compare — not performed.
6. Operator handoff of `SKIPPED_CUSTOMISED` diffs: **implemented 2026-09-28** via the read-only admin maintenance panel and `GET /api/v1/admin/maintenance/thermal-reconcile-notes`. This route returns `READY` with notes or `TABLE_ABSENT` before migration. An operator with an admin token can run `curl.exe -H "Authorization: Bearer <admin-token>" http://127.0.0.1:3001/api/v1/admin/maintenance/thermal-reconcile-notes`. The pending migration has not been applied to the business database.
7. Historical checksum allowlist code path (P1): **implemented locally 2026-09-28** in `classifyMigrations` and `MigrationExecutor.applyPending`, with tests. `npm run audit:migration-drift` shares the JSON policy and the release-audit runner invokes it before `test:ci`. A disposable clone with the thermal checksum replaced by zeros caused the helper to exit 1 and print the migration name. Prisma's own tooling does not use this application allowlist.

### Additional synthetic rehearsal, 2026-09-28

- Scenario 12: PostgreSQL 18 `pg_dump` of the disposable rehearsal DB, full `pg_restore` into a **new** disposable DB, then candidate SQL: converged variant A to 76×80. The initial attempt to restore a full table into a populated DB failed on duplicates; the corrected isolated restore passed.
- Scenario 13: variant B with a customised layout stayed at 76×50 after both the shipped refinement SQL and the candidate; the candidate recorded `SKIPPED_CUSTOMISED` with `diffFields=['config']`.
- Scenario 14: a newly created synthetic old-main DB applied 63 staged migrations through the original variant A SQL from git `4aa36bc`, with the refinement migration absent from `_prisma_migrations`. Applying the candidate SQL alone converged 120×80 to 76×80 and wrote `CONVERGED_FROM_VARIANT_A`. Disposable database `hc_audit_test_oldmain_1790583850051` retained. Script: `scripts/release-audit-old-main-rehearsal.ts`.
- These are synthetic fixtures. No real 120×80-era customer snapshot or installed-version upgrade rehearsal has been tested.

None of the above are executed in this session. Owner approvals in RELEASE_BLOCKERS.md #1.

## Per-migration review (timestamp prefixes)

| Prefix | Review |
|---|---|
| 20260827090000 | Nullable supplier/receiving idempotency keys; unique indexes allow legacy NULLs. |
| 20260830183000 | Irreversible DROP transactions/types. Historical zero-row confirmation is documented; no runtime nonempty guard. Source already lacks table. Older populated legacy datasets require explicit preflight. |
| 20260901090000 | USD default + rate=1/base backfills; existing native values retained. Positive FX and whole-LBP constraints. |
| 20260903120000 | Add VAT tables/profiles; historical lines zero-rated without changing total. One active default partial unique index. |
| 20260906150000 | Additive VAT configuration seed using existing admin; ON CONFLICT preserves rows. Fresh userless DB requires seed later. |
| 20260908120000 | Changes ALL false product inclusive flags to true; historical sales untouched, but intentionally exclusive product configuration is not preserved. Acceptance needed for old-main upgrade. |
| 20260909100000 | Historical delivery exempt/zero VAT, new default standard; business settings additive. |
| 20260911120000 | Return enums/tables, append-only offsets, unique replay keys, positive quantities, target exclusivity and restrictive FKs. Aggregate over-return enforcement also relies on transactional services. |
| 20260914123000 | Nullable supplier dueDate + status/due index, no money rewrite. |
| 20260914140000 | Nullable payment customer plus valid source constraints/triggers; no counter-history backfill. |
| 20260914160000 | Nullable credit limit with nonnegative check. |
| 20260914180000 | Categories, root/sibling casefold uniqueness, restrictive tree FK; nullable product category. CRLF mismatch above. |
| 20260918120000 | Single legacy secret-preset flag with partial unique index. |
| 20260918121000 | Generates EAN13 only for NULL barcode, retries collisions, preserves manufacturer codes. |
| 20260918122000 | New secret eligibility seeded from legacy flag; settings/encoding tables, restrictive FKs, no SKU rewrite. |
| 20260918123000 | Enum value isolated from its use in following migration. |
| 20260918123100 | Idempotent staged-discount encoding seed. |
| 20260920100000 | Shop singleton/config, constrained currency/validity/logo size, rollout default BOTH. |
| 20260920100200 | Bundled logo fills only wholly NULL logo fields. |
| 20260920101000 | Brand logo uniqueness and upload-size metadata; no existing brand conversion. |
| 20260920102000 | Icon table and 17 seeds with code/size bounds, attribution FKs. |
| 20260920103000 | Template size/config bounds, four seeds; default assigned only when NULL. |
| 20260920104000 | Feature positions 1..8 per product; product delete cascades; no icon FK supports missing-icon fallback. |
| 20260920105000 | Print snapshots constrained size/copies/currency, restrictive product/template/user FKs. |
| 20260920200000 | Seed-ID legacy border/divider overwrite lacks exact-config guard; customization risk. |
| 20260920210000 | Nullable product template assignment; delete SET NULL. |
| 20260920211000 | JSON category defaults initially empty; validation is application-level. |
| 20260920220000 | Refresh icon SVG by code (overwrites edited shipped codes), guarded grid-layout conversion. |
| 20260920230000 | Price prominence only when absent; header sizes guarded partly by original size. |
| 20260921100000 | TV centered layout only if layout absent. |
| 20260921110000 | Appliance centered layout only if layout absent. |
| 20260924100000 | Thermal seed modified after application; BLOCKER above. |
| 20260924110000 | Guarded 76×50 → 76×80 refinement; does not cover original 120×80 history. |
| 20260926130000 | Add import drafts and unique source/normalized external identity; no existing products rewritten. Product deletion cascades external identifiers; import reference SET NULL. |

MigrationExecutor applies bundled pending SQL transactionally per migration; it does not itself invoke the arbitrary-SQL safety scanner. Existing checksum mismatches are reported but do not prevent applying other pending entries. Do not treat successful health or applyPending as a clean history verdict.
