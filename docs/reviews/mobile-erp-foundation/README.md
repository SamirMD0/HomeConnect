# Phase 1 mobile ERP foundation review

Implemented on `feat/mobile-erp-foundation`, stacked on Phase 0 commit `715321d`. The local `develop` remains at `bd6a693`; Phase 0 is not merged there. Mobile version is **1.2.0**, Android versionCode **4**.

The production path remains **phone → shop PC LAN listener :3011 → desktop API :3001**. No cloud build or source upload was started. The internal APK and real-phone acceptance checks remain pending by request.

## Result

- Expo Router supplies connection/login and validated-branch gates, five tabs with separate stacks, and a global scanner modal. Every existing supplier screen lives in the Suppliers stack. Future Sell/Stock actions open explanatory screens with a working scan action.
- One React Query client has a 30-second stale time, AppState focus handling, and NetInfo online state. Shop Wi-Fi does not require a successful public-internet probe. Query keys include PC, user, and branch; sign-out and branch switching cancel and clear queries.
- The shared API client maps errors and coordinates one refresh/retry. Late responses cannot replay a request under a new login. Restored account permissions are verified through `/auth/me` before navigation opens. Signing out retains the PC connection.
- The public compatibility endpoint reads the root package version without a database probe. Minimum mobile version is `1.2.0`; mobile expects backend `2.1.0`. The app blocks an older mobile version and warns for an older PC backend.
- Aurora light tokens use desktop brand blue `#1A6FC9`. Shared components include list rows, money text, search, sheets, and retry/empty states. The desktop money formatter now lives in `shared/money-format.ts` and retains its desktop re-export. Shared wire contracts and Metro resolution are ready for later features.
- EAS source exclusions include the shared contracts. Desktop packaging includes root version metadata beside the compiled backend so compatibility also works in the installed PC app.

## Gateway review

`MOBILE_DENIED_PREFIXES` is the single exported list. All paths below and their descendants receive HTTP 403 with `error.code = NOT_AVAILABLE_ON_MOBILE`.

| Existing desktop mount | Coverage |
| --- | --- |
| `/api/v1/admin/backups` | Backup, validation, restore, and backup settings |
| `/api/v1/admin/diagnostics` | Diagnostics |
| `/api/v1/admin/preflight` | Preflight |
| `/api/v1/admin/maintenance` | Repairs and migration operations |
| `/api/v1/auth/setup` | Initial setup |
| `/api/v1/system` | System routes; only exact GET `client-compat` is exempt |
| `/api/v1/scanner` | JWT scanner administration |

The requested root aliases (`backup`, `backups`, `maintenance`, `setup`, `updates`, `diagnostics`, `preflight`) are denied too. Other `/api/v1/*` routes forward with a Bearer token. Login and GET compatibility forward without one. Traversal, encoded traversal, and backslash paths are rejected before proxying. Legacy paired browser-scanner endpoints retain their separate session middleware.

Raw body streaming, the **60-second timeout**, login rate limiting, `X-Receipt-Id`, and response `Cache-Control` remain intact. Request headers also forward `X-Request-Id` and `If-None-Match`; response headers include request ID and ETag. Phone-sent cookies and upstream `Set-Cookie` are never forwarded. The auth-only refresh-token translation below is the sole exception to the cookie boundary.

## Permissions and refresh contract

The actual desktop/backend roles are **ADMIN** and **EMPLOYEE**. The unrestricted desktop sections remain visible to signed-in users; supplier invoice/payment entry is admin-only. Tests explicitly cover MANAGER and CASHIER names without granting them admin writes. No new server roles or permissions were invented.

Desktop auth controllers and their cookie flow remain unchanged. On POST login/refresh, the LAN gateway extracts only the upstream `refreshToken` cookie as `X-Refresh-Token` and forces `Cache-Control: no-store`. On POST refresh/logout, it converts the phone's `X-Refresh-Token` to `Cookie: refreshToken=<value>`. It drops any phone `Cookie` header, rejects cookie separators/control characters in the supplied value, and exposes no refresh token on other routes or methods.

The phone stores access and refresh credentials in device-only SecureStore. Refresh sends the stored header, persists the new access token and any rotated refresh token, and shares one in-flight refresh across concurrent requests. Sign-out attempts `/auth/logout` with the header and clears both credentials even if the PC is unreachable; connection settings remain. Credential writes are serialized and session-scoped so a late refresh/logout cannot overwrite a new login.

On return to foreground, the app decodes JWT `exp` for scheduling only. With less than five minutes remaining, JSON requests and foreground bill sync wait for the shared refresh barrier. The Phase 0 queue/uploader/photo files remain unchanged. A refresh 401 ends the session. Network, throttling, and temporary server failures retain credentials; connectivity failures show the offline banner and can recover after reconnection. Existing installations without a saved refresh token may need one new sign-in to obtain it.

## Phase 0 preservation

The capture and pending screens have theme and bottom-spacing changes only. These files are byte-unchanged from Phase 0:

- `Mobile Scanner/src/services/receipt-queue.ts`
- `Mobile Scanner/src/api/receipts-api.ts`
- `Mobile Scanner/src/services/receipt-photo.ts`

Foreground/login auto-sync remains gated on a validated branch. Existing bill route, raw-byte, receipt ID, image/cache, and receipt-queue tests pass.

## Validation performed

- **Mobile:** 21 test files, **115 tests passed**; TypeScript passed; ESLint passed with one existing `Array<T>` warning in `supplier-purchases-api.ts`.
- **Targeted backend/frontend:** 11 files, **131 tests passed** across the targeted runs. The branch-scope registry initially hit its 30-second app-import hook timeout while other checks were running; it passed all five tests when rerun alone. Includes gateway, actual LAN listener/JWT, login rate limiting, scanner hardening, receipts, compatibility, authorization/branch registries, and customer financial components/utilities. An additional LAN test sends a signed employee JWT and branch header through the real desktop customer route, with service data mocked, and verifies desktop backup requests are still denied.
- **Root TypeScript:** server/node project build and frontend `--noEmit` passed.
- **Local Android export:** Metro/Hermes export passed, 1,142 modules, 3.06 MB Android bundle. This validates bundling; it does not produce or validate an APK.
- **Browser navigation:** Chrome at 393 × 852, using an isolated source copy with synthetic API responses and in-memory native storage/filesystem fixtures. Verified global Scan from all five tabs, manual product lookup, all supplier routes and back actions, tab stack retention, branch switch, sign-out retaining PC settings, employee permission hiding, offline/reconnect banner, and version blocking/warning. See [browser-checks.json](browser-checks.json).
- No full `test:ci` or root-wide `npm test` was run for Phase 1.

The browser preview reported two external jsQR worker load failures from Expo Camera's web implementation. Navigation continued; camera capture was not tested. Fixtures and screenshots contain synthetic data only and do not change production secure storage.

## Keep-signed-in fix validation (November 12, 2026)

- **Mobile:** 23 files, **138 tests passed**. Tests cover reading the login header, stored-token refresh single-flight, rotation, logout cleanup online/offline, refresh 401, network/server failure preservation, the foreground request barrier, JWT expiry scheduling, and stale refresh/logout writes after a new login. Mobile TypeScript and ESLint passed; the existing supplier-purchases array-style warning remains.
- **Targeted backend:** gateway, LAN routes, desktop controller cookie tests, and auth rate-limit tests: **64 passed**. The new real-auth integration file passed its normal auth test and the explicit timed browser test (**2 passed**). Desktop auth controller/service source is unchanged.
- **Android:** local Metro/Hermes export passed (3.07 MB). No EAS build/upload was started.

**The two-minute-token / three-minute check ran successfully locally.** The test set `JWT_ACCESS_EXPIRY=2m` before loading the unchanged `AuthService`, started the desktop auth routes on loopback **3001** and the gateway on **3011**, and drove the mobile app source in Chrome at 393 × 852. After one login and branch selection, it waited **180.8 real seconds** without advancing the clock, opened Scan, and looked up a product. The expired access request returned 401, refresh returned 200, and the retried product request returned 200. The product appeared and the login screen did not. No second login was sent.

See [request/status trace](refresh-soak.json) and [screenshot after three minutes](refresh-after-three-minutes.png). The trace includes an initial migration from the preview fixture's older access-only session to the single new login.

This check used the actual gateway, desktop auth controller/service, JWT signing/verification, mobile session provider, API client and refresh storage logic. The database user and native SecureStore/FileSystem were in-memory fixtures in an isolated source-copy preview; a browser-only test adapter supplied CORS for actual HTTP requests to 3011. It did **not** test Android SecureStore, a physical phone, or an internal APK.

The timed test is opt-in to keep ordinary targeted runs fast. With the isolated native-storage preview running at `http://localhost:8087` and ports 3001/3011 free, run from the repository root:

```powershell
$env:MOBILE_AUTH_SOAK='1'
node node_modules/vitest/vitest.mjs run backend/src/features/scanner/mobile-auth-refresh.test.ts
Remove-Item Env:MOBILE_AUTH_SOAK
```

The source-copy preview preparation used in this workspace is retained in `node_modules/.cache/create-mobile-foundation-preview.cjs`. It copies the app to an ignored directory and substitutes native storage modules only in that copy. It does not modify production Metro or storage code. Start that copy with the mobile Expo CLI on web port 8087 before running the opt-in test.

For the remaining native acceptance check, restart a disposable local backend with `JWT_ACCESS_EXPIRY=2m`, turn on the LAN listener, sign into the **1.2.0 / code 4** app through the PC's port 3011, and wait at least three minutes. Scan a product without another login, then background/foreground the app near expiry and repeat. Turn Wi-Fi off during refresh: the session should remain with an offline banner; reconnect and retry. This physical-phone check remains pending with the internal APK build.

## Screenshots

- [Home](home.png)
- [Suppliers: admin](suppliers-admin.png)
- [Suppliers: employee](suppliers-employee.png)
- [Supplier bill](supplier-bill.png)
- [Manual scan result](scan-result.png)
- [Update required](update-required.png)

## Remaining device acceptance

Build and install the **internal 1.2.0 / code 4 APK** when the pending cloud build is resumed. On the shop Wi-Fi, verify real camera/gallery capture, offline queue and foreground sync, supplier invoice/payment/statement results against the PC, branch switching, sign-out, lost/restored Wi-Fi, and the deny-list/business routes through port 3011. The real-phone checklist in `Mobile Scanner/README.md` remains open.
