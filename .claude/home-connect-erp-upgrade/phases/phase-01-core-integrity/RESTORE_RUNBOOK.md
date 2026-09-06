# Phase 1 Restore Runbook

Date written: 2026-09-04  
Applies to: Home Connect ERP Phase 1 release

## Safety boundary

Never rehearse against `localhost:5433/homeconnect`. That database is live business data. A rehearsal must use a current production backup on a non-production machine and restore into a newly created database whose name contains `restore_test`.

## Prerequisites

- A current `.backup` file copied from the business PC without moving or deleting the source.
- The backup checksum recorded at source and verified after the copy.
- PostgreSQL client tools matching the server major version.
- A non-production machine with enough free disk space for the restored database and temporary files.
- The Phase 1 branch or release checkout, dependencies installed, and a copy of the application configuration containing valid JWT secrets.

## Restore into a fresh database

Run these commands in PowerShell on the non-production machine. Replace only the bracketed values. The target database name is intentionally new; do not repoint or reuse an existing database.

```powershell
$PgBin = 'C:\Program Files\PostgreSQL\16\bin'
$BackupFile = '<absolute path to copied homeconnect backup>'
$RestoreDatabase = 'homeconnect_restore_test_20260904'
$DatabaseHost = 'localhost'
$DatabasePort = '5433'
$DatabaseUser = '<restore-capable PostgreSQL user>'

Get-FileHash -Algorithm SHA256 -LiteralPath $BackupFile
& "$PgBin\pg_restore.exe" --list $BackupFile
& "$PgBin\createdb.exe" --host=$DatabaseHost --port=$DatabasePort --username=$DatabaseUser $RestoreDatabase
& "$PgBin\pg_restore.exe" --exit-on-error --no-owner --no-privileges --host=$DatabaseHost --port=$DatabasePort --username=$DatabaseUser --dbname=$RestoreDatabase $BackupFile
```

If `createdb` reports that the target already exists, stop and choose another new name. Do not drop or overwrite it.

## Start the application against the restored copy

Create a rehearsal-only environment file outside version control by copying the normal non-secret template and supplying the real test credentials. Its `DATABASE_URL` must name the fresh restore database, not `homeconnect`.

```powershell
$env:BACKEND_ENV_FILE = '<absolute path to rehearsal-only env file>'
$env:DATABASE_URL = 'postgresql://<user>:<password>@localhost:5433/homeconnect_restore_test_20260904'
npm run dev:server
```

In a second PowerShell window, start the frontend if needed:

```powershell
npm run dev:vite
```

## Validation after restore

Record every command output and timestamp.

1. Confirm the server starts without migration, JWT, or Prisma errors.
2. Log in with a copied production admin account on the isolated machine.
3. Run Settings → Maintenance → Stock Integrity. Require `mismatch = 0`; record pending-onboarding items separately.
4. Run Customer Financial Integrity and Supplier Financial Integrity. Require `mismatches = 0` for both.
5. Compare record counts for products, customers, suppliers, debts, payments, sales orders, supplier transactions, and stock movements with the source counts captured immediately before backup.
6. Spot-check at least five customer balances and five supplier balances against the source evidence.
7. Record restore start, restore finish, validation finish, archive SHA-256, source backup timestamp, PostgreSQL version, application commit, and operator.

## Rehearsal evidence

**NOT YET PERFORMED — BLOCKED ON OWNER**

Required from the owner: provide or authorize use of a current production backup on a non-production machine, identify the operator, and approve a rehearsal window. No restore duration or successful real-data validation is claimed in this document.

| Evidence | Value |
|---|---|
| Backup timestamp | NOT YET PERFORMED — BLOCKED ON OWNER |
| Source SHA-256 | NOT YET PERFORMED — BLOCKED ON OWNER |
| Copied-file SHA-256 | NOT YET PERFORMED — BLOCKED ON OWNER |
| Restore started | NOT YET PERFORMED — BLOCKED ON OWNER |
| Restore completed | NOT YET PERFORMED — BLOCKED ON OWNER |
| Restore duration | NOT YET PERFORMED — BLOCKED ON OWNER |
| Three integrity reports | NOT YET PERFORMED — BLOCKED ON OWNER |
| Operator sign-off | NOT YET PERFORMED — BLOCKED ON OWNER |

