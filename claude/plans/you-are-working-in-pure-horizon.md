# HomeConnect v1.0.6 — Production-Safe Install, Preflight & Repair Runner

> **Version context.** v1.0.5 was built and shipped before this plan (`release/1.0.5/HomeConnect-Setup-1.0.5.exe`, `package.json` at `1.0.5`) and covered production config guardrails plus restore-workflow polish. It went out **without** the preflight/migration/repair machinery, so every gap in §2 is still live on both business PCs. This plan therefore targets **v1.0.6**.

## 1. v1.0.6 goal

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
HomeConnect-Setup-Bundle-1.0.6.zip
  HomeConnect-Setup-1.0.6.exe
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

**Migrating existing data to the new PC**: backup on old PC (existing Backup UI) → copy `.backup` file → install v1.0.6 on new PC → run bundle → **Import external backup** (`BackupService.importExternalBackup` already exists) → restore → preflight → apply pending migrations → health OK.

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

Startup wiring: Electron calls preflight **before** opening the main window and renders the result in the existing [startup-monitor.html](desktop/src/startup-monitor.html) — extended from a spinner into a checklist with a **Copy diagnostics** button. `desktop/src/readiness.ts` keeps its fast-fail, but the monitor now shows *which* check failed and what to do.

Preflight is read-only. It never writes to the database.

## 6. Packaged migration plan

Add to `extraResources`:
```json
{ "from": "backend/prisma/migrations", "to": "prisma/migrations", "filter": ["**/*.sql"] },
{ "from": "backend/repairs",           "to": "repairs",           "filter": ["**/*"] }
```

`backend/src/features/maintenance/migration-runner.ts`:
- Resolve the bundled migrations dir (packaged: `process.resourcesPath/prisma/migrations`; dev: repo path).
- Read `_prisma_migrations`; classify each bundled folder as `applied | pending | failed | checksum-mismatch`.
- **Checksum must be byte-identical to Prisma's**: SHA-256 hex of `migration.sql`. Verified today — the failed row carried `6c14f45b…e11e3`, exactly what the CLI computes — so your laptop's CLI stays consistent with the packaged runner.
- Apply pending: for each file → dollar-quote-aware statement split → `prisma.$transaction` → `$executeRawUnsafe` per statement → insert the `_prisma_migrations` row (`finished_at`, `applied_steps_count`) in the **same transaction**.
- The splitter must respect `$$ … $$` bodies and `--` comments. This exact logic was written and validated today against the 1.0.5 repair file (16 statements, all `DO $$` blocks intact).
- **Failed-row recovery**: if a row exists with `finished_at IS NULL`, do not blindly retry. Mark it `rolled_back_at`, run the file (repairs are written idempotently), then insert a fresh applied row — the same sequence performed by hand today.
- Postgres DDL is transactional, so a mid-file failure rolls back cleanly and leaves no half state.

## 7. Versioned repair runner plan

```
backend/repairs/
  v1.0.4/
    manifest.json
    repair-phase12-corrections.sql
  v1.0.5/
    manifest.json
    repair-partial-phase12-migration.sql   # already written, already validated
  v1.0.6/                                  # new repairs authored in this release
```

**Folders are keyed by the version a repair was authored in, not the release that ships it.** The two existing files keep their `v1.0.4` / `v1.0.5` origin; the v1.0.6 installer bundles *every* version folder, because a PC being upgraded may still be missing an older repair. The runner decides what to apply from the detection query, never from the folder name.

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

- Repair SQL lives in `backend/repairs/<version>/`, versioned in git, reviewed like code.
- Files must be idempotent (`IF NOT EXISTS`, `DO $$ … IF NOT EXISTS`) — the house style already in [repair-phase12-corrections.sql](release/1.0.4/repair-phase12-corrections.sql).
- Shipped read-only inside the installer; never user-supplied, never editable at runtime.
- `release/<version>/*.sql` keeps a **copy** for emergency psql use — `release/1.0.5/repair-partial-phase12-migration.sql` already exists and stays there — but that is the break-glass path, not the workflow.
- Checksum in the manifest is verified before every run; a mismatch is a hard FAIL ("repair file altered — reinstall").
- Migrating the two existing files into `backend/repairs/` is CP4 work.

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

**New (backend)** — `backend/src/features/preflight/{preflight.service,preflight.checks,preflight.types,preflight.controller,preflight.routes}.ts`; `backend/src/features/maintenance/{migration-runner,repair-registry,repair-runner,sql-statement-splitter,sql-safety-scanner,repair-history.repository,maintenance.controller,maintenance.routes}.ts`; `backend/src/features/diagnostics/diagnostics-export.service.ts`; `backend/repairs/v1.0.4/*`, `backend/repairs/v1.0.5/*`.

**New (frontend)** — `frontend/src/features/maintenance/**` (api, hooks, `MaintenancePanel`, `PreflightReportCard`, `PendingRepairsList`, `RepairHistoryTable`) + a Maintenance tab in `SettingsPage.tsx`; first-run wizard `frontend/src/pages/setup/FirstRunWizard.tsx`.

**New (desktop/scripts/docs)** — `desktop/src/preflight-bridge.ts`; `scripts/Setup-HomeConnect.ps1`; `scripts/Build-SetupBundle.ps1`; `docs/setup/NEW_BUSINESS_PC_SETUP.md`; `docs/setup/MAINTENANCE_AND_REPAIRS.md`; `docs/release/RELEASE_NOTES_1.0.6.md`.

**Modified** — `package.json` (extraResources for migrations + repairs; `bundle:setup` script); `backend/prisma/schema.prisma` + one migration; `backend/src/app.ts` (2 route mounts); `backend/src/features/backup/backup.types.ts` (`PRE_REPAIR`), `backup-operation-lock.ts` (`'REPAIR'`), `backup.middleware.ts`; `desktop/src/{index,startup-diagnostics,startup-monitor.html,preload}.ts`; `docs/setup/ELECTRON_BUSINESS_PC_SETUP.md` (drop the `npx prisma` instructions); `claude/PROJECT_BRIEF.md` (add the `1.0.6` line to Current Important Version Context).

## 17. Implementation checkpoints for Codex

Order adjusted from your draft: the SQL splitter is the riskiest primitive, so it is built and unit-tested **before** anything executes SQL, and the repair registry precedes the migration runner because both share the splitter/scanner.

- **CP1** — Confirm state: migration/repair inventory, packaged resource paths, `_prisma_migrations` semantics. No code.
- **CP2** — `sql-statement-splitter` + `sql-safety-scanner` + unit tests (dollar-quoting, comments, banned statements). Pure functions, no DB.
- **CP3** — Preflight service + `PreflightReport` model + admin route; every check read-only. Tests with mocked failures.
- **CP4** — Repair registry: move both SQL files into `backend/repairs/`, write manifests, checksum verification, detection queries. No execution yet.
- **CP5** — Migration runner: status + apply + failed-row recovery + Prisma-compatible checksum/bookkeeping. Test against a **scratch** database only.
- **CP6** — `RepairHistory` model, additive migration, repository, bootstrap guard.
- **CP7** — Backup-before-repair: `PRE_REPAIR` type, `'REPAIR'` lock, verify-then-apply, blocked path when `pg_dump` is absent.
- **CP8** — Maintenance UI + preflight surfacing in the startup monitor.
- **CP9** — Diagnostics ZIP + redaction tests.
- **CP10** — Setup bundle, PowerShell bootstrap, first-run wizard, new docs.
- **CP11** — Full verification + release checklist + rehearsal on a scratch database.

Focused checks between checkpoints (`typecheck:backend`, `typecheck:frontend`, targeted `npx vitest run <file>`); full suite once at CP11.

## 18. Focused test strategy

Unit — splitter (nested `$$`, comments, trailing semicolons); safety scanner (rejects `DROP TABLE`, allows `ADD COLUMN IF NOT EXISTS`); checksum equals Prisma's for a known file (assert `6c14f45b…e11e3` for `20260727130000`); preflight verdicts per failure; redaction of ZIP contents; tier of failure → message mapping.

Integration (scratch DB `homeconnect_test`, **never** the business DB) — apply pending migration from empty; recover a deliberately half-applied migration reproducing today's `42710`; repair is idempotent across two runs; repair blocked when backup fails; history rows written with correct status.

Route — admin-only enforcement on every maintenance/preflight endpoint; non-admin gets 403; wrong password does not execute.

Manual rehearsal — a throwaway Windows VM or second local PG cluster: run the bundle end-to-end, then restore-from-old-PC end-to-end.

## 19. Final release checklist

1. `npm run lint` · `npm run typecheck` · `npm run test` · `npm run build` · `npm run prisma:validate`.
2. `npm run check:electron-production-runtime`.
3. Verify `extraResources` really contains `prisma/migrations` and **all** `repairs/v*` folders in `release/1.0.6/win-unpacked/resources`.
4. Fresh-VM install: bundle → wizard → preflight all green.
5. Half-applied-migration rehearsal on scratch DB → Maintenance repairs it → verification passes → history row correct.
6. Export diagnostics ZIP; grep for `password`, `postgresql://`, JWT — must be absent.
7. Backup the **existing** business PC before shipping the update to it.
8. Write `docs/release/RELEASE_NOTES_1.0.6.md` and add the `1.0.6` line to `claude/PROJECT_BRIEF.md`.
9. Bump `package.json` version `1.0.5` → `1.0.6`; confirm `release/**` stays uncommitted.
10. Roll out: new PC first, existing PC (currently on 1.0.5) only after the new one is confirmed healthy.

## 20. Risks and blockers

| Risk | Mitigation |
|---|---|
| In-app runner diverges from Prisma CLI bookkeeping | Checksum test pinned to a real known value; runner writes the same columns; `migrate status` verified clean after each rehearsal |
| Statement splitter mis-parses exotic SQL | Repairs are house-authored and reviewed; scanner rejects unknown constructs; splitter unit-tested; PG DDL transactions roll back cleanly |
| `pg_dump` absent ⇒ repairs permanently blocked | Preflight surfaces it early; settings allow an explicit path; setup script verifies it on day one |
| Nobody on-site can click Apply | Accepted trade-off of the approval model. Mitigation: the bundle gets the PC to a healthy state unattended; only genuine repairs need a human, and the checklist covers phone-guided approval |
| Concurrent backup/restore/repair | Single `BackupOperationLock` covers all three |
| App/DB version mismatch after a partial rollout | Compatibility check blocks an older app from writing to a newer database |
| Scope is large for one release | CP1-CP7 (preflight + runners + history + backup gating) is the shippable core; CP8-CP10 can slip to 1.0.7 without leaving the DB unsafe |

**Open blocker to confirm before CP5**: locating `pg_dump`/`psql` on the target machines — a search of `C:\Program Files` on this laptop found neither, despite PostgreSQL 18 running on port 5433. Establish the real install path (it may be on another drive, which `PostgresToolDiscovery` already scans) before relying on backup-before-repair.
