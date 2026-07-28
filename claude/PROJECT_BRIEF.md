# HomeConnect Project Brief For Claude Code

Use this file first. It exists to avoid re-analyzing the whole repository.

## Project Summary

HomeConnect is a local Windows business management application for customers, debts, installment plans, payments, a unified financial ledger, reports, backups, diagnostics, and Electron desktop packaging.

The app stack is:

- Frontend: React + Vite + TypeScript
- Backend: Express + TypeScript
- Database: PostgreSQL
- ORM: Prisma
- Desktop: Electron + electron-builder
- Tests: Vitest

The repository is intentionally phase-heavy and contains many docs. Do not scan the whole tree unless explicitly asked.

## Current Important Version Context

- `1.0.1`: fixed packaged Ledger runtime Decimal issue.
- `1.0.2`: attempted error/startup monitor work.
- `1.0.3`: startup monitor appears and fast-fails database connection errors.
- `1.0.4`: financial corrections, ledger UI improvements, dashboard financial rewrite, and packaged Windows release.
- `1.0.5`: Accounts Receivable, backup restore button, docs cleanup, and partial Phase 12 migration repair artifact.

Generated release folders live under:

```text
release/<version>
```

Do not commit generated release artifacts unless explicitly requested.

## Runtime Architecture

Development:

- Backend: `http://127.0.0.1:3001`
- Frontend: `http://127.0.0.1:3002`
- Command: `npm run dev:electron`

Production Electron:

- Starts compiled Express backend locally on `127.0.0.1:3001`
- Serves built React frontend locally on `127.0.0.1:3002`
- Loads frontend over HTTP, not `file://`, because authentication uses credentials/cookies.
- Uses a startup monitor window before opening the main app.

Electron security expectations:

- `contextIsolation: true`
- `nodeIntegration: false`
- explicit preload only
- no unrestricted IPC
- no database credentials exposed to renderer
- local services bind to `127.0.0.1`, never `0.0.0.0`
- do not disable `webSecurity`

## Production Environment File

Packaged Electron uses a user config file, usually:

```text
%APPDATA%\home-connect\config\production.env
```

Older notes may mention:

```text
%APPDATA%\HomeConnect\config\production.env
```

Always verify the exact path from:

```text
%APPDATA%\home-connect\logs\startup-diagnostics.json
```

Expected production variables:

```env
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5433/homeconnect"
JWT_SECRET="replace-with-a-long-random-secret"
JWT_REFRESH_SECRET="replace-with-another-long-random-secret"
NODE_ENV="production"
HOST="127.0.0.1"
PORT="3001"
FRONTEND_URL="http://127.0.0.1:3002"
CORS_ORIGINS="http://localhost:3002,http://127.0.0.1:3002"
COOKIE_SECURE="false"
```

If a PostgreSQL password contains `@`, it must be URL-encoded as `%40`.

Do not log secrets. Redact `DATABASE_URL`, passwords, JWT secrets, and `PGPASSWORD`.

## Database Safety

The real data lives in PostgreSQL, not in the installed app folder.

Safe:

- uninstalling/reinstalling HomeConnect app versions
- installing `1.0.3` over `1.0.0`
- running non-destructive migrations with `prisma migrate deploy`

Dangerous:

- `prisma migrate reset`
- dropping the `homeconnect` database
- deleting PostgreSQL data directories
- importing CSV directly into real tables without a staging/upsert script

Do not create migrations or modify `backend/prisma/schema.prisma` unless the user explicitly asks.

## Key Files To Inspect By Task

Electron startup/runtime:

- `desktop/src/index.ts`
- `desktop/src/window.ts`
- `desktop/src/preload.ts`
- `desktop/src/backend-process.ts`
- `desktop/src/readiness.ts`
- `desktop/src/runtime-config.ts`
- `desktop/src/startup-diagnostics.ts`
- `desktop/src/startup-monitor.html`
- `desktop/scripts/dev-electron.ts`
- `package.json`
- `tsconfig.electron.json`

Backend app and environment:

- `backend/src/index.ts`
- `backend/src/app.ts`
- `backend/src/lib/prisma.ts`
- `backend/src/middleware/error.middleware.ts`

Auth:

- `backend/src/controllers/auth.controller.ts`
- `backend/src/services/auth.service.ts`
- `backend/src/middleware/auth.middleware.ts`
- `frontend/src/services/api.ts`
- `frontend/src/context/AuthContext.tsx`

Customers:

- `backend/src/controllers/customers.controller.ts`
- `backend/src/services/customers.service.ts`
- `backend/src/repositories/customers.repository.ts`
- `backend/src/validators/customers.validator.ts`
- `frontend/src/features/customers`
- `frontend/src/pages/customers`

Financial domain:

- `backend/src/features/financial/domain`
- `backend/src/features/financial/debts`
- `backend/src/features/financial/installment-plans`
- `backend/src/features/financial/customer-summary`
- `backend/src/features/financial/ledger`
- `frontend/src/features/customer-financial`
- `frontend/src/features/financial-ledger`

Reports:

- `backend/src/features/reports/monthly-debts`
- `frontend/src/features/reports`
- `frontend/src/pages/ReportsPage.tsx`

Backups:

- `backend/src/features/backup`
- `frontend/src/features/backup`
- `docs/BACKUP_RESTORE_RECOVERY_GUIDE.md`

Diagnostics/error monitor:

- `backend/src/features/diagnostics`
- `frontend/src/features/diagnostics`
- `frontend/src/components/ErrorBoundary.tsx`
- `frontend/src/services/api.ts`
- `desktop/src/startup-diagnostics.ts`

## Common Commands

Use focused checks first.

```powershell
npm run typecheck:backend
npm run typecheck:frontend
npm run build:electron-main
npx vitest run <specific-test-file>
```

Full verification only when requested:

```powershell
npm run lint
npm run typecheck
npm run test
npm run build
npm run prisma:validate
```

Packaging:

```powershell
npm run pack:win
npm run dist:win
```

Database URL tester:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Test-HomeConnectDatabaseUrl.ps1
```

When copied beside `production.env`, run it from that config folder.

## Known Pitfalls

- `DATABASE_UNAVAILABLE` from startup monitor means backend started but Prisma cannot connect.
- A malformed `production.env` can look like a DB outage. Example bad line:

```env
DATABASE_URL=\postgresql://postgres:pass@localhost:5433/homeconnect\
```

Correct:

```env
DATABASE_URL="postgresql://postgres:pass@127.0.0.1:5433/homeconnect"
```

- `dotenv` may not override pre-existing process environment variables unless coded to do so.
- The Startup Monitor HTML must be copied into `dist/electron/desktop/src` during Electron builds, otherwise packaged app will not show it.
- Port conflicts on `3001` or `3002` can come from leftover `HomeConnect` or `node` processes.
- PostgreSQL backup tools require `pg_dump` and `psql` to be discoverable, usually in `C:\Program Files\PostgreSQL\<version>\bin`.

## Safe Customer CSV Smoke Test

Files:

- `docs/SAMPLE_CUSTOMERS_IMPORT.csv`
- `docs/SAMPLE_CUSTOMERS_IMPORT_UPSERT.sql`

Use the SQL staging/upsert script. Do not import the CSV directly into `customers`.

## Collaboration Rules For Future Work

- Keep checkpoints small.
- Do not inspect the entire repository unless necessary.
- Do not modify financial business logic unless the requested task requires it.
- Do not modify Prisma schema or create migrations unless explicitly requested.
- Do not run full verification repeatedly.
- Do not create commits unless explicitly requested.
- Preserve local PostgreSQL data.
