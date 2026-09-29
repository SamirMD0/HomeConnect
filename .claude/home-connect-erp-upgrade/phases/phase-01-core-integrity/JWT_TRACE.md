# JWT secret startup trace

**Investigated:** 2026-08-26  
**Baseline commit:** `ac6ae9f555dd69d61ca79be527cc1a80513643d9`  
**Prompt:** Phase 1, Prompt 03  
**Change type:** Investigation only; no application code changed

## Executive finding

If `production.env` exists but has no `JWT_SECRET` entry, and no inherited process environment or fallback development `.env` supplies one, **Home Connect still starts**. The access-token signing and verification code both silently use:

```text
fallback_secret_key_change_in_production
```

The setup script normally prevents this by generating a cryptographically random secret. That protection is procedural, however: the backend itself does not enforce it. The preflight feature detects the missing setting only after the backend is already running, behind authentication and an ADMIN role check, when an administrator manually runs it from Settings → Maintenance.

The Electron startup-message table already knows how to explain a missing secret, but current code never throws a missing-secret startup error for that matcher to receive.

## 1. Every direct `process.env.JWT_SECRET` reader

Repository-wide search found **33 direct reads in 33 files**.

### Runtime readers

| File and line | Purpose | Missing-value behavior |
|---|---|---|
| `backend/src/middleware/auth.middleware.ts:5` | Captures the access-token verification secret at module load. `requireAuth` uses it in `jwt.verify` at line 29. | Falls back to the published string. |
| `backend/src/services/auth.service.ts:7` | Captures the access-token signing secret at module load. `generateTokens` uses it at line 24. | Falls back to the published string. |
| `backend/src/features/diagnostics/diagnostics-export.service.ts:167` | Reads current secret values only to ensure a diagnostics ZIP does not contain them. It does not configure authentication. | Missing values are filtered out; no startup effect. |

`backend/src/services/auth.service.ts:8` is also the only authentication read of `process.env.JWT_REFRESH_SECRET`:

```ts
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;
```

Consequences:

- `JWT_SECRET` missing, refresh secret present: access tokens use the published fallback; refresh tokens use the configured refresh secret.
- Both missing: access and refresh tokens both use the published fallback.
- Only `JWT_REFRESH_SECRET` missing: refresh tokens reuse the configured access-token secret.

The other runtime read of `JWT_REFRESH_SECRET` is the diagnostics leak check at `diagnostics-export.service.ts:167`.

### Test-only readers

These tests mint tokens compatible with the current middleware. They reproduce the fallback but do not affect the packaged runtime.

| File | Line |
|---|---:|
| `backend/src/features/backup/backup.routes.test.ts` | 31 |
| `backend/src/features/dashboard/dashboard-financial.routes.test.ts` | 24 |
| `backend/src/features/dashboard/dashboard.routes.test.ts` | 15 |
| `backend/src/features/diagnostics/diagnostics.routes.test.ts` | 16 |
| `backend/src/features/financial/corrections/corrections.routes.test.ts` | 24 |
| `backend/src/features/financial/customer-summary/customer-financial-summary.routes.test.ts` | 25 |
| `backend/src/features/financial/debts/debts.routes.test.ts` | 34 |
| `backend/src/features/financial/installment-plans/installment-plans.routes.test.ts` | 33 |
| `backend/src/features/financial/ledger/financial-ledger.routes.test.ts` | 24 |
| `backend/src/features/financial/payments/payments.routes.test.ts` | 27 |
| `backend/src/features/financial/receivables/receivables.routes.test.ts` | 24 |
| `backend/src/features/inventory/inventory-db.integration.test.ts` | 148 |
| `backend/src/features/inventory/inventory.routes.test.ts` | 33 |
| `backend/src/features/inventory/receiving/supplier-receivings.routes.test.ts` | 11 |
| `backend/src/features/maintenance/maintenance.routes.test.ts` | 16 |
| `backend/src/features/preflight/preflight.routes.test.ts` | 14 |
| `backend/src/features/pricing/calculator/pricing-calculator.routes.test.ts` | 10 |
| `backend/src/features/pricing/presets/pricing-presets.routes.test.ts` | 13 |
| `backend/src/features/reports/monthly-debts/monthly-debts.routes.test.ts` | 27 |
| `backend/src/features/reports/monthly-review/monthly-review.routes.test.ts` | 14 |
| `backend/src/features/reports/rows/report-rows.routes.test.ts` | 10 |
| `backend/src/features/sales/sales-orders/sales-orders.routes.test.ts` | 19 |
| `backend/src/features/scanner/scanner.routes.test.ts` | 13 |
| `backend/src/features/service/products/products.pricing.routes.test.ts` | 12 |
| `backend/src/features/service/products/products.routes.test.ts` | 10 |
| `backend/src/features/service/products/products.scan.test.ts` | 12 |
| `backend/src/features/service/service-jobs/service-jobs.routes.test.ts` | 10 |
| `backend/src/features/suppliers/purchases/supplier-purchases.routes.test.ts` | 13 |
| `backend/src/features/suppliers/suppliers.routes.test.ts` | 14 |
| `backend/src/features/system/system.routes.test.ts` | 10 |

## 2. How `production.env` is created

`scripts/Setup-HomeConnect.ps1` is the intended production configuration path.

1. It places the configuration at `%APPDATA%\home-connect\config\production.env` (`Setup-HomeConnect.ps1:136-138`).
2. `New-Secret` fills 48 bytes with `.NET RandomNumberGenerator` and Base64-encodes them (`:140-144`). This is a CSPRNG-generated 384-bit value before Base64 encoding.
3. It reads and preserves an existing `JWT_SECRET` so rerunning setup does not invalidate sessions (`:146-156`). If the line is absent or empty, it generates a new value.
4. It independently preserves or generates `JWT_REFRESH_SECRET` (`:158-159`).
5. It writes both entries to `production.env` (`:171-179`).
6. It restricts the file ACL to the current Windows user where possible (`:181-188`).
7. It registers the file path as the user-level `BACKEND_ENV_FILE` environment variable (`:193-199`).

The repository example also names both settings (`backend/.env.example:7-8`). The installer excludes `backend/.env` and all `.env` files, so the setup-generated user-data file is the normal packaged source.

## 3. How Electron passes configuration to the backend

Electron does **not** place either secret on the child-process command line.

1. Packaged startup calls `startCompiledBackend` with the compiled backend entry, Electron `userData` path, and resources path (`desktop/src/index.ts:183-191`).
2. `buildBackendSpawnConfig` invokes Electron's executable as Node with `shell: false` and an environment object (`desktop/src/backend-process.ts:13-27`). Its only argument is the backend entry file.
3. `buildBackendEnvironment` begins with the inherited `process.env`, then supplies production runtime settings (`backend-process.ts:30-56`).
4. It sets `BACKEND_ENV_FILE` to an already supplied value or, normally, `<userData>/config/production.env` (`:48-53`). It passes the path, not secret values as arguments.
5. The backend entry tries configuration sources in this order: `BACKEND_ENV_FILE`, `HOME_CONNECT_CONFIG_DIR/production.env`, and development `backend/.env` paths (`backend/src/index.ts:4-14`). Dotenv's default no-override behavior means an inherited value or the first loaded value wins.
6. Only after that loop does the compiled CommonJS entry require `./app`, which loads the authentication modules. This is verified in the built output at `dist/server/backend/src/index.js:8-20`, so the auth constants see values loaded from the file.
7. The backend then listens on `process.env.HOST || '127.0.0.1'` (`backend/src/index.ts:22-28`). Electron explicitly supplies the loopback host (`desktop/src/backend-process.ts:41`).

The desktop tests confirm the spawn arguments contain neither `DATABASE_URL` nor `JWT_SECRET` (`desktop/src/backend-process.test.ts:40-49`) and that child output redacts secret values (`:51-62`).

### Important startup-shell detail

Electron's visible “Checking configuration” step does not actually validate the file or required variables. It waits 100 ms and immediately marks the step successful (`desktop/src/index.ts:156-160`). The first substantive gate is waiting for backend health at lines 189-201. Because the fallback lets the backend boot, a missing JWT secret does not fail that health gate.

## 4. Exact behavior when `JWT_SECRET` is unset

At module load:

```ts
// backend/src/middleware/auth.middleware.ts:5
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';

// backend/src/services/auth.service.ts:7-8
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key_change_in_production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;
```

The same fallback is used on both sides of the access-token contract:

- token creation: `jwt.sign(payload, JWT_SECRET, ...)` at `auth.service.ts:24`;
- request authentication: `jwt.verify(token, JWT_SECRET)` at `auth.middleware.ts:29`.

Therefore tokens continue to work consistently and no exception is raised. The server reaches `app.listen`, reports healthy, and Electron opens the application.

## 5. Why preflight does not block startup

Preflight correctly defines all three variables as required:

```ts
// backend/src/features/preflight/preflight.checks.ts:16
const REQUIRED_VARS = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;
```

`checkRequiredVars` returns a `FAIL` result when a value is missing or blank (`preflight.checks.ts:39-47`). That finding is diagnostic only:

1. The route is mounted at `GET /api/v1/admin/preflight` behind `requireAuth` (`backend/src/app.ts:124`). The backend must already be running and the caller must already have a token.
2. `preflight.routes.ts:7-11` adds an ADMIN-only role check.
3. `preflight.controller.ts:7-14` explicitly returns HTTP 200 even when checks fail, because the report is the response.
4. `PreflightService.run` computes `canStart` in the response body (`preflight.service.ts:94-100`), but no startup code calls the service or consumes that field.
5. The frontend fetches it only from Settings → Maintenance (`frontend/src/features/maintenance/api/maintenance.api.ts:10-12`). The React query is disabled until requested (`hooks/useMaintenance.ts:14-20`), and the operator starts it with the “Run Preflight Check” button (`MaintenancePanel.tsx:75-83`).

Conclusion: preflight **reports** the missing secret after startup. It does not prevent startup.

## 6. Existing Electron failure matcher

The necessary operator-facing matcher already exists at `desktop/src/startup-failure-messages.ts:39-44`:

```ts
{
  match: /JWT_SECRET|JWT_REFRESH_SECRET|missing.*secret/i,
  step: 'step-config',
  summary: 'A required security setting is missing from the configuration file.',
  fix: 'Re-run Setup-HomeConnect.ps1 — it regenerates the missing entries without touching your data.',
}
```

It is exercised indirectly by the rule-coverage sample `JWT_SECRET is missing` in `startup-failure-messages.test.ts:75-83`.

Electron catches backend startup failures, maps their raw text through `describeStartupFailure`, and displays the actionable summary/fix (`desktop/src/index.ts:228-249`). The plumbing is ready for Prompt 04. The missing piece is a backend exception containing `JWT_SECRET` before `app.listen`.

## 7. Precise answers

### If `production.env` exists but has no `JWT_SECRET` line, does the app start?

**Yes**, provided the database and other startup dependencies work and no other inherited/development environment source supplies `JWT_SECRET`. There is no mandatory secret check. The visible Electron configuration step also does not validate it.

### If it starts, what secret does it use?

For access-token signing and verification it uses exactly:

```text
fallback_secret_key_change_in_production
```

If `JWT_REFRESH_SECRET` is also missing, refresh-token signing and verification use that same value through the fallback chain. If the refresh secret is configured, only access tokens use the published fallback.

### Who could exploit this, given the server binds `127.0.0.1`?

The loopback bind materially limits exposure: a machine elsewhere on the LAN or Internet cannot connect directly to port 3001. Exploitation requires the ability to send HTTP requests from the business PC itself, for example:

- malicious software or another local process running under any local session able to reach loopback;
- a compromised Electron renderer or other code executing inside an allowed application context;
- a person with local interactive access who can run a client against `127.0.0.1:3001`.

Such a caller knows the published fallback and can sign a JWT whose payload claims `role: 'ADMIN'`. `requireAuth` trusts the signature and copies `userId` and `role` from the token without looking up the user (`auth.middleware.ts:19-33`). Role middleware can therefore trust an attacker-supplied admin claim. Some writes may additionally need a real user ID because database foreign keys or later service logic use it, but that does not protect endpoints that rely only on the signed role claim, and a forged token already defeats the authentication boundary.

CORS is not a defense against a native local process; it is a browser policy. Loopback makes the probability lower than a network-exposed server, but the impact remains critical if local execution or renderer compromise occurs. Any future non-loopback binding would make the published fallback remotely exploitable and raise the probability sharply.

## Conclusion for Prompt 04

The correct enforcement point is backend startup, after dotenv loads configuration and before the app/auth modules begin serving requests. Missing `JWT_SECRET` should cause a clear exception naming the variable and pointing to `Setup-HomeConnect.ps1`. The existing Electron matcher will render that exception as an actionable configuration failure.

This trace does not decide whether the defensible `JWT_REFRESH_SECRET || JWT_SECRET` fallback should remain; Prompt 04 explicitly requires that decision. It establishes only that the hardcoded access-secret fallback must not remain.
