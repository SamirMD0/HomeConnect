# HomeConnect — Production-Safe Install, Preflight & Repair Runner

> **Version context (re-synced 2026-08-04).** This plan was written against **v1.0.5**. The project has since shipped through **v1.2.0** (`package.json` at `1.2.0`; `release/` holds installers 1.0.0 → 1.2.0). None of the preflight/migration/repair machinery was ever built, so **every gap in §2 is still live** — the plan's core premise holds. But eight releases of drift have invalidated specific details; §0 records exactly what changed.
>
> **Target version: v1.4.0** (see §0.4 — the unreleased bulk-label-printing work is expected to take 1.3.0).

---

## 0. Sync report — 2026-08-04

Every factual claim below was re-checked against the working tree. This section exists so nobody implements against the 1.0.5-era assumptions.

### 0.1 Still true (verified, no change needed)

| Claim | Verified |
|---|---|
| Packaged app cannot apply migrations | `package.json:36-60` — `extraResources` still ships only `dist/server/backend`, `frontend/dist`, `.prisma/client`. **No `prisma/migrations`, no repairs.** |
| No preflight or maintenance code exists | `backend/src/features/` = backup, dashboard, diagnostics, financial, pricing, reports, sales, service, suppliers. No `preflight/`, no `maintenance/`. |
| `RepairHistory` does not exist | Absent from `schema.prisma`. §10 and §15 remain new work. |
| Backup stack is reusable as described | `backup-operation-lock.ts`, `postgres-tools.ts` (`PostgresToolDiscovery`), `postgres-url.ts` (`parsePostgresConnectionString`), `backup.middleware.ts` (`blockWritesDuringRestore`), `importExternalBackup`, `validateRestore` all present. |
| `BackupType` still needs `PRE_REPAIR` | `backup.types.ts:1` — `'MANUAL' \| 'AUTO' \| 'PRE_RESTORE'`. |
| Lock union still needs `'REPAIR'` | `backup-operation-lock.ts:4,6` — `'BACKUP' \| 'RESTORE'`. |
| Admin password path exists and is reusable | `financial/authorization/account-password.ts` (`verifyAccountPassword`), `lib/admin-verification.ts` (`verifyAdminPassword`), `AdminVerificationLog` → `admin_verification_logs` (`schema.prisma:588-599`). |
| Supporting helpers exist | `requireRole`, `redactSensitiveData` (`lib/redaction.ts`), `checkPortInUse` (`desktop/src/startup-diagnostics.ts`), `startup-monitor.html`. |
| `scripts/` has only the URL tester | `Test-HomeConnectDatabaseUrl.ps1`. `Setup-HomeConnect.ps1` and `bundle:setup` still to be written. |
| Migration `20260727130000` exists | `20260727130000_add_financial_correction_audit`. The pinned checksum test in §18 is still anchorable. |
| Transaction-per-migration is safe | No `CREATE INDEX CONCURRENTLY` anywhere; `20260801092000_add_search_indexes:9-10` documents deliberately avoiding it *because* Prisma wraps migrations in a transaction. §6's design is compatible. |

### 0.2 Changed — plan must be updated

| Was | Now |
|---|---|
| Target v1.0.6, current v1.0.5 | Current **v1.2.0**; this targets **v1.4.0** (§0.4) |
| "Two existing repair files" (`v1.0.4`, `v1.0.5`) | **17 repair/upgrade SQL files** across releases 1.0.4 → 1.2.0 (§0.3) |
| 8-ish migrations | **19 migrations**, including `pg_trgm`, search normalization, pricing presets, product SKU/stock, sales orders |
| `PROJECT_BRIEF.md` version context | Reads `1.1.0` (`claude/PROJECT_BRIEF.md:22`) — itself stale at 1.2.0 |

### 0.3 Conflicts found — resolve before CP4

**Conflict A — a second repair convention already shipped.**
The plan proposes `backend/repairs/<version>/{manifest.json,*.sql}`. Since then the project adopted **`backend/prisma/repair/<version>-repair.sql`** — currently `backend/prisma/repair/1.2.0-repair.sql` (17 `DO $$` blocks, idempotent, house style intact). Building `backend/repairs/` now would leave two competing repair locations.
**Resolution:** adopt the existing `backend/prisma/repair/` path as the canonical home and add a sibling `manifest.json` per version, rather than introducing `backend/repairs/`. This keeps the one file already in git where it is and avoids a rename in the same release that adds the runner.

**Conflict B — 16 of 17 repair files are not in git.**
`.gitignore:4` ignores `release/`. Only `backend/prisma/repair/1.2.0-repair.sql` is tracked; the other 16 exist **solely on this machine** and would be lost on a fresh clone or disk failure. The plan's §8 treats `release/<version>/*.sql` as a durable break-glass copy — it is not.
**Resolution:** ✅ Done 2026-08-04 as CP0 — all 16 copied into `backend/prisma/repair/`, SHA-256 verified, version-prefixed. They still need a commit to be truly safe. The owner has confirmed every file was genuinely applied, so none may be pruned (§7).

**Conflict C — `pg_trgm` needs superuser, and preflight never checks for it.**
`20260801090000_enable_pgtrgm/migration.sql` runs `CREATE EXTENSION IF NOT EXISTS pg_trgm`, and its own header notes pg_trgm is **not a trusted extension, so it requires a superuser connection**. The in-app runner (§6) connects as whatever `DATABASE_URL` names. If that is not a superuser, this migration fails mid-run on any PC that has not yet applied it — precisely the failure mode this plan exists to prevent.
**Resolution:** add preflight check **#13 — connection role can create extensions** (`SELECT rolsuper FROM pg_roles WHERE rolname = current_user`, or a probe), FAIL with "The database user in DATABASE_URL cannot install extensions. Re-run the setup script as postgres." The setup script in §4 already prompts for the postgres password, so this should normally pass — but it must be verified, not assumed.

**Conflict D — merge surface in the Electron main/preload.**
`desktop/src/preload.ts` and `desktop/src/index.ts` gained a `labels:exportPdf` channel (bulk label PDF export, currently uncommitted). §16 lists both files as modified. Coordinate: `preload.test.ts` asserts an **exact** `electronAPI` surface, so any new channel must be added to that list or the test fails.

### 0.4 Version collision to decide

Two unreleased workstreams both point at "next":
1. **Bulk product label printing + PDF export** — implemented, tested, uncommitted in the tree.
2. **This plan** — not started.

They share `desktop/src/preload.ts` and `desktop/src/index.ts` but nothing else. Recommendation: labels ship as **1.3.0** (small, done, verifiable), this plan as **1.4.0**. The plan has been retargeted accordingly; change it if you'd rather ship infrastructure first.

## 1. Release goal

Make a **new business PC installable and maintainable without you being physically present**, and make every database change on a real business PC detected, backed up, applied, verified, and recorded — with no manual pgAdmin SQL paste.

Confirmed decisions:
- **Migrations**: bundle migration SQL + in-app runner (no Prisma CLI on the business PC).
- **Timing**: preflight detects at startup; nothing is written until an admin approves in Maintenance.
- **Audit**: `RepairHistory` Prisma model + one additive migration, with a `CREATE TABLE IF NOT EXISTS` bootstrap.
- **Remote setup**: setup bundle (installer + PowerShell bootstrap + checklist) plus a guided first-run wizard.

## 2. What problems it solves

This is not hypothetical — it already happened on the dev machine on 2026-07-28:


| Problem | Evidence today |
|---|---|
| Packaged app cannot apply migrations | `extraResources` ships `dist/server/backend`, `frontend/dist`, `.prisma/client` — **not** `backend/prisma/migrations`. [package.json:36-60](package.json) |
| A half-applied migration bricks every financial screen | `20260727130000` left `payment_allocations.voidedAt` missing → `P2022` → Dashboard, Ledger and Accounts Receivable all 500 |
| Prisma cannot self-heal that state | `migrate deploy` restarts the file and dies on `42710: type already exists`; then `P3018` blocks every later migration |
| Repair = manual SQL paste | Fixing it needed hand-written SQL + `migrate resolve` — impossible for the shop staff |
| Setup guide is dev-machine-shaped | [ELECTRON_BUSINESS_PC_SETUP.md:37-43](docs/setup/ELECTRON_BUSINESS_PC_SETUP.md) tells the operator to run `npx prisma migrate deploy` from a cloned repo |
| Failures surface as jargon | `DATABASE_UNAVAILABLE`, "did not become ready within 45s" — no stated fix |

## 3. What must not be included

Hard exclusions, enforced in code review and by test:
- No `prisma migrate reset`, no `DROP DATABASE`, no deleting PG data directories.
- No free-text SQL box in the UI. Repairs run **only** from signed, bundled, checksum-verified files.
- No `DROP`/`TRUNCATE`/`DELETE`/`ALTER COLUMN ... TYPE` inside any repair file — the loader rejects them.
- No secrets in diagnostics, logs, or the ZIP (no password, no full `DATABASE_URL`, no JWT secrets).
- No customer or payment rows in the diagnostics ZIP.
- No auto-restore. Restore stays a deliberate admin action.
- No committing `release/**` artifacts.
- No destructive testing against the real business database.

## 4. New business PC setup strategy

**Setup bundle** (one zip you send, built by a new `npm run bundle:setup`):

```
HomeConnect-Setup-Bundle-<version>.zip
  HomeConnect-Setup-<version>.exe
  Setup-HomeConnect.ps1        # bootstrap, idempotent, no secrets baked in
  SETUP-CHECKLIST.pdf/md        # printable, 1 page
  README-FIRST.txt
```

`Setup-HomeConnect.ps1` (new, modelled on the existing [Test-HomeConnectDatabaseUrl.ps1](scripts/Test-HomeConnectDatabaseUrl.ps1)):
1. Verify PostgreSQL service is running; print the exact fix if not.
2. Prompt once for the postgres password (never echoed, never written to disk in plain form beyond `production.env`).
3. `CREATE DATABASE homeconnect` if absent (never drops).
4. Generate `JWT_SECRET` / `JWT_REFRESH_SECRET` via `RNGCryptoServiceProvider`.
5. Write `%APPDATA%\home-connect\config\production.env` with `0600`-equivalent ACL; **URL-encode `@` as `%40`** in `DATABASE_URL` (the known pitfall).
6. Set `BACKEND_ENV_FILE` user env var.
7. Run the URL tester and print a PASS/FAIL summary.

Then: install the exe → first run → wizard verifies everything → admin logs in → Maintenance applies pending migrations.

**Migrating existing data to the new PC**: backup on old PC (existing Backup UI) → copy `.backup` file → install the new version on that PC → run bundle → **Import external backup** (`BackupService.importExternalBackup` already exists) → restore → preflight → apply pending migrations → health OK.

## 5. Installer / startup preflight plan

New module `backend/src/features/preflight/` producing one `PreflightReport`. Each check returns `PASS | WARN | FAIL` + a **plain-English fix string**.

| # | Check | Reuses |
|---|---|---|
| 1 | env file exists & readable | `writeStartupDiagnostics` |
| 2 | required vars present (`DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`) | — |
| 3 | `DATABASE_URL` parses | `parsePostgresConnectionString` [postgres-url.ts](backend/src/features/backup/postgres-url.ts) |
| 4 | **password encoding** — raw `@`/`#`/`/` in password → FAIL with `%40` hint | new, targeted at the documented pitfall |
| 5 | PostgreSQL reachable (TCP + `SELECT 1`) | `checkPortInUse`, `prisma.$queryRaw` |
| 6 | database exists / named DB matches | `parsePostgresConnectionString` |
| 7 | migration status: applied / pending / **failed** rows | new `MigrationRunner.status()` |
| 8 | repair status: pending repairs for this version | new `RepairRegistry` |
| 9 | required tables present (spot-check incl. `payment_allocations.voidedAt`) | `information_schema` |
| 10 | app vs database compatibility verdict | new |
| 11 | pg client tools present (`pg_dump` needed to back up) | `PostgresToolDiscovery` |
| 12 | ports 3001/3002 free | `checkPortInUse` |
| 13 | **connection role can install extensions** — `pg_trgm` is untrusted and needs superuser (§0.3 Conflict C) | new, `SELECT rolsuper FROM pg_roles WHERE "rolname" = current_user` |

Startup wiring: Electron calls preflight **before** opening the main window and renders the result in the existing [startup-monitor.html](desktop/src/startup-monitor.html) — extended from a spinner into a checklist with a **Copy diagnostics** button. `desktop/src/readiness.ts` keeps its fast-fail, but the monitor now shows *which* check failed and what to do.

Preflight is read-only. It never writes to the database.

## 6. Packaged migration plan

Add to `extraResources` (currently `package.json:36-60`, three entries, none of them SQL):
```json
{ "from": "backend/prisma/migrations", "to": "prisma/migrations", "filter": ["**/*.sql", "**/migration_lock.toml"] },
{ "from": "backend/prisma/repair",     "to": "repair",            "filter": ["**/*"] }
```
Note the repair path: `backend/prisma/repair`, not `backend/repairs` — see §0.3 Conflict A. There are **19** migration folders to bundle today.

`backend/src/features/maintenance/migration-runner.ts`:
- Resolve the bundled migrations dir (packaged: `process.resourcesPath/prisma/migrations`; dev: repo path).
- Read `_prisma_migrations`; classify each bundled folder as `applied | pending | failed | checksum-mismatch`.
- **Checksum must be byte-identical to Prisma's**: SHA-256 hex of `migration.sql`. Verified today — the failed row carried `6c14f45b…e11e3`, exactly what the CLI computes — so your laptop's CLI stays consistent with the packaged runner.
- Apply pending: for each file → dollar-quote-aware statement split → `prisma.$transaction` → `$executeRawUnsafe` per statement → insert the `_prisma_migrations` row (`finished_at`, `applied_steps_count`) in the **same transaction**.
- The splitter must respect `$$ … $$` bodies and `--` comments. This exact logic was written and validated today against the 1.0.5 repair file (16 statements, all `DO $$` blocks intact).
- **Failed-row recovery**: if a row exists with `finished_at IS NULL`, do not blindly retry. Mark it `rolled_back_at`, run the file (repairs are written idempotently), then insert a fresh applied row — the same sequence performed by hand today.
- Postgres DDL is transactional, so a mid-file failure rolls back cleanly and leaves no half state.

## 7. Versioned repair runner plan

Canonical location is the **existing** `backend/prisma/repair/` (§0.3 Conflict A), extended from flat files into per-version folders:

```
backend/prisma/repair/
  1.2.0-repair.sql          # already tracked in git — the only survivor today
  v1.0.4/
    manifest.json
    repair-phase12-corrections.sql
  v1.0.5/
    manifest.json
    repair-partial-phase12-migration.sql
    repair-phase12-business-pc-safe.sql
  v1.0.7/ v1.0.8/ v1.0.9/ v1.1.0/ v1.1.1/ v1.1.2/   # rescued from release/ — see below
  v1.2.0/
    manifest.json
    1.2.0-repair.sql        # moved from the flat path above
```

**Folders are keyed by the version a repair was authored in, not the release that ships it.** The installer bundles *every* version folder, because a PC being upgraded may still be missing an older repair. The runner decides what to apply from the detection query, never from the folder name.

**The inventory is 17 files, not 2** (§0.2). Full list, by origin release:

| Release | Files |
|---|---|
| 1.0.4 | `repair-phase12-corrections.sql` |
| 1.0.5 | `repair-partial-phase12-migration.sql`, `repair-phase12-business-pc-safe.sql` |
| 1.0.7 | `upgrade-v1.0.7-prepaid-purchase-business-pc-safe.sql`, `upgrade-v1.0.7-service-product-business-pc-safe.sql` |
| 1.0.8 | `repair-prepaid-delivery-v1.0.8.sql`, `repair-supplier-ledger-v1.0.8.sql` |
| 1.0.9 | `upgrade-v1.0.9-search-business-pc-safe.sql` |
| 1.1.0 | `repair-v1.1.0-product-image-business-pc-safe.sql`, `upgrade-v1.1.0-pricing-presets-business-pc-safe.sql` |
| 1.1.1 | `repair-v1.1.1-product-image-business-pc-safe.sql`, `upgrade-v1.1.1-pricing-presets-business-pc-safe.sql` |
| 1.1.2 | `repair-product-installment-option.sql`, `repair-product-sku-stock-specifications.sql`, `repair-service-exchange-and-company-home-status.sql`, `repair-v1.1.2-business-pc-safe.sql` |
| 1.2.0 | `1.2.0-repair.sql` **(the only one in git)** |

✅ **CP0 is done (2026-08-04).** All 16 pre-1.2.0 files were copied out of the gitignored `release/` tree into `backend/prisma/repair/`, verified byte-identical by SHA-256, and renamed to a flat `<version>-<repair|upgrade>-<what>.sql` convention matching the existing `1.2.0-repair.sql`. They are untracked-but-committable and **still need committing**. `release/` keeps the originals; `backend/prisma/repair/` is now the authority. See that folder's `README.md`.

**Do not deduplicate.** Confirmed by the owner: *every* one of these files was actually run on a business PC. The apparent near-duplicates (`1.1.0` vs `1.1.1` product-image; the 1.1.2 set alongside its `-business-pc-safe` roll-up) were each genuinely applied — to different machines or at different times — so they are deployment history, not redundancy. CP4 writes a manifest for all 17 and lets the detection query, never the filename, decide what still needs applying.

`manifest.json` entry:
```json
{
  "repairId": "phase12-partial-migration",
  "title": "Finish partially applied Phase 12 corrections migration",
  "version": "1.0.5",
  "description": "Adds payment_allocations void columns left behind by a half-applied migration.",
  "file": "repair-partial-phase12-migration.sql",
  "checksum": "sha256:…",
  "requiresBackup": true,
  "idempotent": true,
  "affectedTables": ["payment_allocations", "_prisma_migrations"],
  "detectionQuery": "SELECT 1 FROM information_schema.columns WHERE table_name='payment_allocations' AND column_name='voidedAt'",
  "detectionExpects": "empty",
  "verificationQuery": "SELECT count(*) FROM information_schema.columns WHERE table_name='payment_allocations' AND column_name IN ('voidedAt','voidedById','correctionId')",
  "verificationExpects": 3
}
```

Runner pipeline, per repair:
`load manifest → verify checksum → reject banned SQL → run detectionQuery → skip if not needed → require admin password → acquire lock → BACKUP → apply in transaction → run verificationQuery → record → release lock`.

Anything that fails **stops the batch** — later repairs are not attempted.

## 8. SQL repair file handling (replaces pgAdmin paste)

- Repair SQL lives in `backend/prisma/repair/<version>/`, versioned in git, reviewed like code.
- Files must be idempotent (`IF NOT EXISTS`, `DO $$ … IF NOT EXISTS`) — the house style is intact in the one tracked file, [1.2.0-repair.sql](backend/prisma/repair/1.2.0-repair.sql) (17 `DO $$` blocks).
- Shipped read-only inside the installer; never user-supplied, never editable at runtime.
- `release/<version>/*.sql` is **not** a durable copy — `release/` is gitignored (§0.3 Conflict B). Treat those files as the *source* to rescue, not a backup to rely on. After CP4, git is the only authority.
- Checksum in the manifest is verified before every run; a mismatch is a hard FAIL ("repair file altered — reinstall").
- Rescuing and manifesting all 17 files is CP4 work.

## 9. Backup-before-repair plan

Reuses the whole existing backup stack — no new backup code:

1. `PostgresToolDiscovery.discover()` → if `pg_dump` missing, **block** with "PostgreSQL client tools not found; set the pg_dump path in Backup settings."
2. `BackupOperationLock.runExclusive('REPAIR', …)` — extend the union `'BACKUP' | 'RESTORE'` with `'REPAIR'` so backup, restore and repair can never overlap.
3. Create a typed `PRE_REPAIR` backup (add to `BackupType` alongside `PRE_RESTORE`) via `BackupService`.
4. **Verify** it: file exists, non-zero, checksum recorded, `pg_restore --list` readable — the same validation `validateRestore` already performs.
5. Only then apply. Backup failure ⇒ repair does not run, status `BLOCKED_NO_BACKUP`.
6. Store `backupPath` on the history row so the operator knows exactly what to roll back to.
7. Reuse `blockWritesDuringRestore` (extend to repairs) so no financial writes land mid-repair.

## 10. Repair history / audit plan

**Yes — this needs one additive Prisma migration.** Per PROJECT_BRIEF this requires your explicit sign-off; approving this plan is that sign-off.

```prisma
model RepairHistory {
  id            String   @id @default(uuid()) @db.Uuid
  repairId      String
  version       String
  kind          RepairKind      // MIGRATION | REPAIR
  checksum      String
  status        RepairStatus    // APPLIED | SKIPPED_NOT_NEEDED | FAILED | BLOCKED_NO_BACKUP | VERIFY_FAILED
  appliedAt     DateTime @default(now())
  appliedById   String?  @db.Uuid
  appliedByName String
  backupPath    String?
  durationMs    Int?
  errorMessage  String?
  appliedBy     User?    @relation(fields: [appliedById], references: [id])
  @@unique([repairId, checksum, status])
  @@index([appliedAt])
  @@map("repair_history")
}
```

Chicken-and-egg solved: the runner bootstraps with `CREATE TABLE IF NOT EXISTS "repair_history"` before doing anything, so it works on a database that predates the model. The Prisma migration keeps your dev schema truthful.

Admin identity comes from `verifyAccountPassword` / `verifyAdminPasswordForCorrection` ([account-password.ts](backend/src/features/financial/authorization/account-password.ts)) — already rate-limited and already logging to the existing `admin_verification_logs` table. Reuse it; do not write a second password path.

## 11. Maintenance UI plan

`Settings → Maintenance`, admin-only, mirroring [BackupRestorePanel.tsx](frontend/src/features/backup/components/BackupRestorePanel.tsx).

Read: app version · database schema version · migration status · pending repairs (title + what it fixes + affected tables) · last backup · database health · pg tools found · env file path.

Actions: **Run Preflight Check** (safe, anytime) · **Apply Pending Repairs** (admin password, explicit "back up first" confirmation, live progress, per-item result) · **Export Diagnostics ZIP** · **Open Logs Folder** (Electron IPC).

Rules: destructive-sounding actions get a typed confirmation; disabled with a reason when `pg_dump` is missing; history table showing the last 20 `RepairHistory` rows.

## 12. Diagnostics ZIP plan

`GET /api/v1/admin/diagnostics/export` (admin-only) → `homeconnect-diagnostics-<timestamp>.zip`:

Include — `startup-diagnostics.json`; `errors.jsonl` (tail, already redacted via `redactSensitiveData`); Electron main log; preflight report JSON; migration + repair status; `RepairHistory` rows; backup list metadata (no archives); app/Electron/Node/PostgreSQL versions; DB name/host/port **only**; env-var presence summary (`DATABASE_URL: set`, `JWT_SECRET: set`) with **no values**; OS/paths; port occupancy.

Exclude — database dumps, any customer/debt/payment row, JWT secrets, DB password, full `DATABASE_URL`, `production.env` contents.

A unit test asserts the produced ZIP contains no `password`, no `postgresql://` with credentials, and no JWT secret value.

## 13. Failure modes and user messages

Every message: what happened → why → what to do next. Shown in the startup monitor or the wizard.

| Failure | Message |
|---|---|
| No `production.env` | "Configuration file not found at `<path>`. Run Setup-HomeConnect.ps1 from the setup bundle." |
| Missing var | "`JWT_SECRET` is missing from production.env. Re-run the setup script." |
| Password not encoded | "The database password contains `@`. It must be written as `%40` in DATABASE_URL." |
| PostgreSQL down | "PostgreSQL is not running. Open Services and start postgresql-x64-18." |
| Database missing | "Database `homeconnect` does not exist on port 5433. Run the setup script — it will create it. Your data is not affected." |
| Pending migrations | "This app version needs 1 database update. Sign in as an administrator and open Settings → Maintenance." |
| Failed migration row | "A previous database update did not finish. Maintenance can repair it safely; a backup is taken first." |
| Missing column / drift | "The database is missing `payment_allocations.voidedAt`. A bundled repair fixes this." |
| App older than DB | "This database was updated by a newer HomeConnect. Install version `<x>` or newer." **Blocks startup** — never downgrade-write. |
| `pg_dump` missing | "Cannot back up: PostgreSQL tools not found. Repairs are disabled until this is set." |
| Backup failed | "Backup failed, so no changes were made. Free disk space and retry." |
| Verification failed | "Repair applied but verification failed. The database was rolled back. Send diagnostics." |
| Port busy | "Port 3001 is in use. Close other HomeConnect windows or restart Windows." |

## 14. Security rules

Admin role (`requireRole(['ADMIN'])`) **and** account-password re-verification for any write. Rate-limited + logged to `admin_verification_logs`. Only bundled checksum-verified SQL executes; no user SQL path exists. Banned-statement scanner rejects `DROP`/`TRUNCATE`/`DELETE`/type-altering DDL at load time. Secrets never logged, never exported, never returned by any endpoint — reuse `redactSensitiveData`. Backups keep their existing path controls; the diagnostics ZIP contains no archive. All repair endpoints sit behind the write-blocking middleware.

## 15. Schema changes

One additive migration `2026XXXXXXXXXX_add_repair_history`: creates `repair_history` + two enums + FK to `users`. No changes to existing tables, no data migration, safe to `migrate deploy` on the running business PC. Bootstrap `CREATE TABLE IF NOT EXISTS` covers databases that predate it.

## 16. Exact files likely to change

**New (backend)** — `backend/src/features/preflight/{preflight.service,preflight.checks,preflight.types,preflight.controller,preflight.routes}.ts`; `backend/src/features/maintenance/{migration-runner,repair-registry,repair-runner,sql-statement-splitter,sql-safety-scanner,repair-history.repository,maintenance.controller,maintenance.routes}.ts`; `backend/src/features/diagnostics/diagnostics-export.service.ts` (the `diagnostics/` feature already exists — controller, routes, service, `error-logger`; this is an addition, not a new feature folder); `backend/prisma/repair/v1.0.4/**` … `v1.2.0/**` (17 files, §7).

**New (frontend)** — `frontend/src/features/maintenance/**` (api, hooks, `MaintenancePanel`, `PreflightReportCard`, `PendingRepairsList`, `RepairHistoryTable`) + a Maintenance tab in `SettingsPage.tsx`; first-run wizard `frontend/src/pages/setup/FirstRunWizard.tsx`.

**New (desktop/scripts/docs)** — `desktop/src/preflight-bridge.ts`; `scripts/Setup-HomeConnect.ps1`; `scripts/Build-SetupBundle.ps1`; `docs/setup/NEW_BUSINESS_PC_SETUP.md`; `docs/setup/MAINTENANCE_AND_REPAIRS.md`; `docs/release/RELEASE_NOTES_<version>.md`.

**Modified** — `package.json` (extraResources for migrations + repairs; `bundle:setup` script); `backend/prisma/schema.prisma` + one migration; `backend/src/app.ts` (2 route mounts, alongside the existing `/api/v1/admin/diagnostics` and `/api/v1/admin/backups`); `backend/src/features/backup/backup.types.ts` (`PRE_REPAIR`), `backup-operation-lock.ts` (`'REPAIR'`), `backup.middleware.ts`; `desktop/src/{index,startup-diagnostics,startup-monitor.html,preload}.ts` **and `desktop/src/preload.test.ts`** — that test asserts an exact `electronAPI` surface and will fail on any new channel (§0.3 Conflict D); `docs/setup/ELECTRON_BUSINESS_PC_SETUP.md` (drop the `npx prisma` instructions); `claude/PROJECT_BRIEF.md` (Current Important Version Context reads `1.1.0` at line 22 — stale at 1.2.0; bring it current *and* add this release's line).

## 17. Implementation checkpoints for Codex

Order adjusted from your draft: the SQL splitter is the riskiest primitive, so it is built and unit-tested **before** anything executes SQL, and the repair registry precedes the migration runner because both share the splitter/scanner.

- **CP0** — ✅ **Done 2026-08-04.** The 16 untracked repair files were rescued from `release/**` into `backend/prisma/repair/`, checksum-verified, version-prefixed, and documented in a folder `README.md`. Remaining: `git add` + commit them.
- **CP1** — Confirm state: `_prisma_migrations` semantics on a real business PC, packaged resource paths, and which of the 17 rescued repairs are already applied there. Inventory is now known (§7) so this is narrower than originally scoped. No code.
- **CP2** — ✅ **Done 2026-08-04.** `sql-statement-splitter.ts` + `sql-safety-scanner.ts` + 68 tests. Two findings worth keeping: (a) a keyword-based scanner rejects nearly every real repair file, because `ON DELETE RESTRICT`, `'WORKSHOP_DROP_OFF'` and `ALTER COLUMN … DROP NOT NULL` all contain banned words harmlessly, and every file header literally lists them — so the scanner strips comments and string literals and judges the *leading verb*; (b) `UPDATE` cannot be banned outright, because the failed-row recovery this plan requires *is* an `UPDATE "_prisma_migrations"`, and the 1.0.7/1.1.2 repairs use the standard `ADD COLUMN → UPDATE … WHERE col IS NULL → SET NOT NULL` backfill. Both shapes are allowed by rule; everything else is rejected. All 17 repair files and all 19 migrations are asserted to pass.
- **CP3** — ✅ **Done 2026-08-04.** `preflight.{types,checks,service,controller,routes}.ts` + 33 tests, mounted at `GET /api/v1/admin/preflight` (admin-only, read-only, 200 even when checks fail so the UI shows the diagnosis rather than a generic error). Check #13 (extension privilege) included. Two corrections made while building: the port check is **SKIPPED** when run in-process, because 3001/3002 are legitimately held by the app itself — only the Electron shell can check it meaningfully, so `PreflightService.run` accepts `busyPorts` from the caller (CP8 wires it). And the password-encoding check needed splitting: raw `/`, `#`, `?` make `new URL` **throw** (caught by the address check, which now names the offending character), whereas a raw `@` parses *silently* under WHATWG rules while Prisma's own parser and psql split at the first `@` — so only `@` needs the dedicated check.
- **CP3a** *(deferred from CP3)* — `MIGRATION_STATUS`, `REPAIR_STATUS` and `APP_DB_COMPATIBILITY` checks are declared in `PreflightCheckId` but not yet emitted; they depend on the CP4 registry and CP5 runner. Wire them in as those land.
- **CP4** — ✅ **Done 2026-08-04.** `backend/prisma/repair/manifest.json` (17 entries, real SHA-256s) + `repair-registry.ts` + 14 tests. **Layout deviation:** the owner asked that nothing be deleted or moved, so the files stay **flat** (`<version>-<name>.sql`) with a single manifest, rather than being relocated into `v<version>/` folders as §7 originally drew. Nothing is lost — `version` is a manifest field. Detection queries are per-repair sentinels derived by reading each file (a column, a table, an extension, or an enum label), not guessed. Two repairs are flagged `requiresSuperuser` (`search-pg-trgm`, `sales-orders-and-search`) because they run `CREATE EXTENSION pg_trgm` — the CP3 privilege check exists to catch exactly that pairing. The registry validates three gates (file present → checksum matches → safety scanner passes) and excludes only the failing entry, so one tampered file cannot block the other sixteen. **No execution** — loading and validation only.
- **CP4a** — ✅ `extraResources` in `package.json` now ships `backend/prisma/migrations` → `prisma/migrations` and `backend/prisma/repair` → `repair`. This closes the §2 "packaged app cannot apply migrations" gap at the packaging level, and is what makes `RepairRegistry.resolveDirectory()` resolve in a production build. Inert until the runners use it.
- **CP5** — ✅ **Done 2026-08-04.** `migration-runner.ts` (pure: read bundled, checksum, `classifyMigrations`, `planApply`) + `migration-executor.ts` (executes against an injected client) + 19 tests. Split deliberately so the ordering logic — the part that must not be wrong — is testable with no database at all; the executor takes a `MigrationClient` interface, so the real apply path is rehearsed on a **scratch** database and never the business one.
  - **Checksum compatibility verified against a real row**, not assumed: `20260727130000_add_financial_correction_audit` hashes to `6c14f45b12a5cf6f…`, exactly what the CLI stored. Pinned as a test.
  - **`.gitattributes` added — this was a latent outage.** `core.autocrlf=true` with no `.gitattributes` meant a fresh checkout would rewrite `*.sql` to CRLF, changing every byte-for-byte hash. That would have made the CP4 registry report `CHECKSUM_MISMATCH` on all 17 repairs and the runner report every applied migration as mismatched — on files that are correct. `*.sql` is now pinned to `eol=lf`.
  - Recovery, migration statements and the bookkeeping INSERT all sit in **one transaction**, so a mid-file failure rolls back the `rolled_back_at` marking too and leaves the database exactly as it was. `applyPending` stops at the first failure rather than stacking a later migration onto a database that missed an earlier one.
  - A rolled-back row classifies as PENDING (retryable), not FAILED — retry is safe because the files are idempotent. Migration names are escaped before interpolation despite coming from the filesystem.
- **CP6** — ✅ **Done 2026-08-04.** `RepairHistory` model + `RepairKind`/`RepairStatus` enums in `schema.prisma`, additive migration `20260804130000_add_repair_history`, `repair-history.repository.ts`, and 16 tests. Schema validates.
  - **`@@unique([repairId, checksum, status])` was deliberately dropped.** It would reject a second row carrying the same outcome, so a repair that failed twice could not record its second failure — the history write would throw inside the very failure path this table exists to document, and every repeated `SKIPPED_NOT_NEEDED` would collide too. History is append-only; duplicates are information. Two indexes give the lookup speed instead. A test asserts the constraint stays absent.
  - The repository uses **raw SQL, not the generated client**, and bootstraps with `CREATE TABLE IF NOT EXISTS` before every write. That resolves the chicken-and-egg honestly: this table is written by the runner that brings an out-of-date database up to date, so it must work on a database that predates its own migration. Enum creation is wrapped in `EXCEPTION WHEN duplicate_object` because `CREATE TYPE` has no `IF NOT EXISTS`.
  - **Writes never throw.** A repair that succeeded must not be reported as failed because its audit row could not be written; `record()` returns `null` and the caller warns.
  - `npx prisma generate` could not run — the dev Electron app was live and held `query_engine-windows.dll`. Not needed for this checkpoint (no code touches `prisma.repairHistory`), but **run it after stopping the dev app** so the client picks up the model.
- **CP7** — ✅ **Done 2026-08-04.** `PRE_REPAIR` added to `BackupType`, `'REPAIR'` to the operation lock (now a named `BackupOperation` union), `REPAIR_IN_PROGRESS` to `SystemStatus`, `isWriteBlocked()` extended, `BackupService.createPreRepairBackup()`, and `repair-runner.ts` + 16 tests. Gate order: tools present → already applied? → verified backup → apply in a transaction → verify → record history.
  - `createPreRepairBackup` deliberately does **not** take the lock or drive maintenance state — the runner already holds `'REPAIR'` for the whole pipeline, so taking `'BACKUP'` inside it would deadlock against itself. Verification is not skipped: `createBackupInternal` still checks file size, records a checksum, and reads the archive with `pg_restore --list`.
  - Apply **and** verify run in one transaction, so a verification failure rolls the repair back rather than leaving a state nobody checked. `VERIFY_FAILED` is distinguished from `FAILED` — "ran but produced the wrong result" is a different problem from "the SQL broke".
  - A skipped repair takes no backup and never enters maintenance; `exitMaintenance` is in a `finally`, so business writes are always released.
  - **Fixed while building:** the history write was fire-and-forget (`void`), so the row could be lost if the process exited before it landed. It is now awaited — safe because `record()` returns `null` on failure instead of throwing, so it still cannot turn a successful repair into a reported failure.
  - `blockWritesDuringRestore` now exempts `/api/v1/admin/maintenance` as well as `/api/v1/admin/backups`; without that the admin would be locked out of finishing the operation that set the state.
- **CP8** — ⚠️ **Partly done 2026-08-04 — the Maintenance UI ships; the startup-monitor half does not.**
  - **Done:** `maintenance.{service,controller,routes}.ts` mounted at `/api/v1/admin/maintenance` (admin-only; `GET /` overview, `POST /repairs/apply`), and `frontend/src/features/maintenance/**` — `MaintenancePanel`, `PreflightReportCard`, `PendingRepairsList`, `RepairHistoryTable`, api client and hooks — added to `SettingsPage`. 17 new tests. This is the checkpoint that makes CP2–CP7 reachable: before it, every piece worked and nothing exposed them.
  - Apply requires the account password **and** a typed `APPLY` confirmation, validated server-side (`applyRepairsSchema`) so the guard is not merely a UI affordance. `verifyAdminPassword` rate-limits and logs it. Applying stops at the first non-skip failure, since a later repair may assume an earlier one landed.
  - Preflight is **not** fetched on mount — it opens sockets and probes the database. The admin asks for it.
  - `BackupService.createPreRepairBackup` returns the *internal* record, not `toPublicRecord`: history stores the absolute backup path so an operator knows what to roll back to, and the public shape strips it.
  - `MaintenanceService` resolves the actor's name from the database; the JWT carries only `userId` and `role`.
- **CP8b** — ✅ **Done 2026-08-04, with the scope corrected.** §5 assumed `startup-monitor.html` was a spinner; it is not — it already had a four-step checklist, Copy Diagnostics, Open Logs Folder and Retry. The real gap was §13: `startupErrorMessage()` returned `error.message` raw, so a failing install showed `DATABASE_UNAVAILABLE` or "did not become ready within 45s".
  - Added `desktop/src/startup-failure-messages.ts` — the §13 table as a pure, tested mapper from a raw error to `{ step, summary, fix }` — plus a guidance panel in the monitor that states what happened and what to do. 13 tests, including one asserting no rule can ever produce an empty fix. The raw text still goes to the log for diagnostics.
  - **Preflight itself is deliberately not called before the window opens.** The endpoint is admin-authenticated and there is no admin session at that point; the alternatives were an unauthenticated endpoint leaking database details onto loopback, or duplicating the check logic into `desktop/`. Neither is worth it — the DB-dependent checks need the backend running anyway, and the full report is one click away in Settings → Maintenance. `PreflightService.run` still accepts `busyPorts` if a future caller wants it.
  - Touched `desktop/src/index.ts` (error path only) and `startup-monitor.html`; **`preload.ts` was not touched**, so Conflict D never materialised.
- **CP9** — ✅ **Done 2026-08-04.** `zip-writer.ts`, `diagnostics-export.service.ts`, `GET /api/v1/admin/diagnostics/export` (admin-only, streamed as an attachment), an Export Diagnostics button in the Maintenance panel, and 21 tests.
  - **No archive dependency was added.** The project ships none, and this is the only place that needs one — for a handful of small text files. A deflated ZIP is three record types, so it is written on Node's own `zlib`. Correctness was proved two ways: the test parses the archive back out of the bytes and checks CRCs, and during development the output was extracted by **Windows' own `Expand-Archive`** (nested paths and exact byte counts intact).
  - Contents are an **allow-list**, not a dump: meta, environment *presence* summary, preflight report, migration status, repair manifest metadata (no SQL), repair history, backup metadata (no archives), and a redacted tail of `errors.jsonl`.
  - `assertNoSecretValues` re-reads every byte before the archive is sealed and **throws** — a leaked ZIP travels by email and cannot be recalled, so this fails closed. It matches secret *values*, not names, so `"JWT_SECRET": "set"` passes while the secret itself cannot. Also rejects any `postgres://user:pass@` string. Secrets under 6 characters are ignored to avoid matching ordinary prose.
  - A section that cannot be gathered becomes an error note inside the archive rather than a failed export — diagnostics must work on a broken machine.
- **CP10** — ✅ **Mostly done 2026-08-04.** `scripts/Setup-HomeConnect.ps1` (idempotent bootstrap: verifies/starts the PostgreSQL service, locates `psql` across all fixed drives, asks for the password once via `SecureString`, creates the database only if absent, generates the JWT secrets with `RandomNumberGenerator` — **reusing existing ones on a re-run so nobody is signed out** — percent-encodes the password via `EscapeDataString` so the `@` trap cannot recur, restricts the file ACL, sets `BACKEND_ENV_FILE`, then runs the existing connection tester). `scripts/Build-SetupBundle.ps1` + `npm run bundle:setup`, which deliberately does *not* build the installer so re-packaging cannot ship a stale one. Both parse cleanly. Docs: `NEW_BUSINESS_PC_SETUP.md`, `MAINTENANCE_AND_REPAIRS.md`, and the `npx prisma migrate deploy` instructions removed from `ELECTRON_BUSINESS_PC_SETUP.md` and replaced with a pointer to the new flow.
  - **First-run wizard not built.** `frontend/src/pages/Setup.tsx` already handles first-administrator creation, and the startup monitor now explains startup failures while Maintenance handles database state — a third surface would duplicate both. Revisit only if the shop actually gets stuck.
- **CP11** — ✅ **Largely done 2026-08-04, and it earned its keep.** `npm run lint` 0 errors · `npm run typecheck` clean · `npm test` **935 passed, 4 skipped** · `npm run build` succeeds · `npm run prisma:validate` valid.

  **Packaging verified (§19.3 — the headline gap is closed).** `npm run pack:win` then inspecting `release/1.2.0/win-unpacked/resources`: `prisma/migrations` holds **20 folders / 20 SQL files** and `repair/` holds **17 SQL files + manifest.json**. The packaged app can now see what it needs to apply.

  **Scratch-database rehearsal (§18) — added as `npm run rehearse:migrations`** (`scripts/rehearse-migrations.ts`), so it is repeatable before every release rather than a one-off. It refuses to run if `DATABASE_URL` points at the scratch name, creates the scratch database if missing, and never drops anything.
  - **Phase 1 PASS** — all 20 bundled migrations applied to an empty database against real PostgreSQL, ending `pending=0 failed=0 mismatched=0`. This is the first end-to-end proof the runner works outside mocks.
  - **Phase 2 — found a real flaw in this plan.** §6 stated failed-row recovery could "run the file (repairs are written idempotently)". That parenthetical holds for *repairs* but **not for Prisma migrations**, which are not idempotent: re-running a half-applied one dies on `42710: type already exists` — precisely the failure §2 describes. Detection worked correctly; the automatic re-apply could not, and never could have.
  - **Fix:** added `planResolve()` / `MigrationExecutor.markResolved()` — the equivalent of `prisma migrate resolve --applied`, recording a migration as applied **without** running its SQL. The real recovery is the one performed by hand on 2026-07-28: apply the matching idempotent repair from `backend/prisma/repair/`, then mark the migration resolved. Covered by a test asserting the migration SQL is never executed.

  **§20 blocker 1 resolved.** `pg_dump`, `pg_restore` and `psql` are all present — at `D:\Program Files\PostgreSQL\15\bin`, not on `C:`. `PostgresToolDiscovery` already scans other drives, so backup-before-repair is viable on this machine.

  **Correction that followed from it:** the machine runs **PostgreSQL 15**, not 18. Every message and doc that hardcoded `postgresql-x64-18` was wrong here; they now say "the PostgreSQL service (its name begins `postgresql-x64`)" and "PostgreSQL 15 or newer".

  **Still outstanding — each needs an environment I cannot reach:**
  - `npm run check:electron-production-runtime` — blocked while the dev Vite server holds port 3002. Re-run with the dev app stopped.
  - Fresh-VM install of the bundle end to end, and the restore-from-old-PC path (§19.4).
  - Grepping a *produced* diagnostics ZIP on a real machine (§19.6). The secret guard is unit-tested and fails closed, but the file itself has not been inspected by hand.
  - Backing up the business PC before rollout (§19.7), release notes, and the version bump (§19.8–9).
  - The scratch database `homeconnect_rehearsal` was **left in place** for inspection. Drop it with `DROP DATABASE "homeconnect_rehearsal";` when you are done with it.

Focused checks between checkpoints (`typecheck:backend`, `typecheck:frontend`, targeted `npx vitest run <file>`); full suite once at CP11.

## 18. Focused test strategy

Unit — splitter (nested `$$`, comments, trailing semicolons); safety scanner (rejects `DROP TABLE`, allows `ADD COLUMN IF NOT EXISTS`); checksum equals Prisma's for a known file (assert `6c14f45b…e11e3` for `20260727130000`); preflight verdicts per failure; redaction of ZIP contents; tier of failure → message mapping.

Integration (scratch DB `homeconnect_test`, **never** the business DB) — apply pending migration from empty; recover a deliberately half-applied migration reproducing today's `42710`; repair is idempotent across two runs; repair blocked when backup fails; history rows written with correct status.

Route — admin-only enforcement on every maintenance/preflight endpoint; non-admin gets 403; wrong password does not execute.

Manual rehearsal — a throwaway Windows VM or second local PG cluster: run the bundle end-to-end, then restore-from-old-PC end-to-end.

## 19. Final release checklist

1. `npm run lint` · `npm run typecheck` · `npm run test` · `npm run build` · `npm run prisma:validate`.
2. `npm run check:electron-production-runtime`.
3. Verify `extraResources` really contains all **19** `prisma/migrations` folders and **all** `repair/v*` folders in `release/<version>/win-unpacked/resources`.
4. Fresh-VM install: bundle → wizard → preflight all green.
5. Half-applied-migration rehearsal on scratch DB → Maintenance repairs it → verification passes → history row correct.
6. Export diagnostics ZIP; grep for `password`, `postgresql://`, JWT — must be absent.
7. Backup the **existing** business PC before shipping the update to it.
8. Write `docs/release/RELEASE_NOTES_<version>.md`; bring `claude/PROJECT_BRIEF.md` Current Important Version Context current (it still says `1.1.0`) and add this release's line.
9. Bump `package.json` `1.2.0` → target (see §0.4); confirm `release/**` stays uncommitted **except** that `backend/prisma/repair/**` is now tracked and must be committed.
10. Roll out: new PC first, existing PC (currently on 1.2.0) only after the new one is confirmed healthy.

## 20. Risks and blockers

| Risk | Mitigation |
|---|---|
| In-app runner diverges from Prisma CLI bookkeeping | Checksum test pinned to a real known value; runner writes the same columns; `migrate status` verified clean after each rehearsal |
| Statement splitter mis-parses exotic SQL | Repairs are house-authored and reviewed; scanner rejects unknown constructs; splitter unit-tested; PG DDL transactions roll back cleanly |
| `pg_dump` absent ⇒ repairs permanently blocked | Preflight surfaces it early; settings allow an explicit path; setup script verifies it on day one |
| Nobody on-site can click Apply | Accepted trade-off of the approval model. Mitigation: the bundle gets the PC to a healthy state unattended; only genuine repairs need a human, and the checklist covers phone-guided approval |
| Concurrent backup/restore/repair | Single `BackupOperationLock` covers all three |
| App/DB version mismatch after a partial rollout | Compatibility check blocks an older app from writing to a newer database |
| Scope is large for one release | CP0-CP7 (rescue + preflight + runners + history + backup gating) is the shippable core; CP8-CP10 can slip a release without leaving the DB unsafe |
| **16 repair files exist only outside git** | CP0 rescues them before anything else is built (§0.3 Conflict B) |
| **A required migration needs superuser** | Preflight check #13 detects it before the runner tries and fails (§0.3 Conflict C) |
| Two repair conventions diverging | Canonical path settled as `backend/prisma/repair/` (§0.3 Conflict A); no `backend/repairs/` is created |

**Open blockers to confirm before CP5:**

1. Locating `pg_dump`/`psql` on the target machines — a search of `C:\Program Files` on this laptop found neither, despite PostgreSQL 18 running on port 5433. Establish the real install path (it may be on another drive, which `PostgresToolDiscovery` already scans) before relying on backup-before-repair. **Still open, re-checked 2026-08-04.**
2. Whether `DATABASE_URL` on each business PC names a superuser — decides if `pg_trgm` can ever be applied in-app (§0.3 Conflict C).
3. Which of the 17 repairs are already applied on each business PC. Until CP1 answers this, the true remaining work is unknown; the detection queries are what make it safe to not know.
