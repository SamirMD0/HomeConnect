# Playwright execution plan

## Safety and reproduction

- Provision isolated databases with `npx tsx scripts/release-audit-databases.ts`. This creates new databases and a private manifest; do not run it concurrently with tests. It intentionally exits nonzero on migration-history mismatches while retaining evidence.
- Install browser prerequisites with `npx playwright install chromium`; the current browser config uses installed Chrome and the local FFmpeg dependency. No production database URL may be supplied.
- Browser build: `npx tsx scripts/release-audit-run.ts build --e2e`, then `npm run test:e2e`. The test backend/frontend use loopback 4311/4312, synthetic users/products and a manifest guard. Build normal production afterward; do not distribute the test-port build.
- Compiled Electron: build server/frontend for E2E, `npm run build:electron-main`, then `npm run test:e2e:electron`. Run sequentially with browser tests because the ports are shared.
- Production package: normal `npm run build` + Electron main build, then `npx tsx scripts/release-audit-package.ts`. Publishing is explicitly disabled. Set AUDIT_ELECTRON_EXECUTABLE to the resulting unpacked EXE to run desktop tests on normal 3001/3002 ports. Tests fail if another service already owns either port; never kill/reuse that service.
- Raw profiles, secrets, backups and test databases stay local. No installed app or business data is overwritten. Test data is retained for inspection, not automatically dropped.

## Implemented checks

Browser: login/logout/invalid and disabled session; product search/drawer/edit with persisted identity/price checks; real UI USD and LBP mixed sales; stock deduction; partial cash refund/debt relief; return replay; walk-in receipt; supplier purchase/receiving API retry plus UI/DB verification; five product pricing previews/print dispatch; customer/supplier reconciliation and dashboard.

Electron: first/restart login UI and database health; owned-port shutdown; missing external dev backend; unavailable DB then Retry to healthy DB; missing JWT early child exit; occupied foreign port. Delayed readiness, unrelated 200/404 services and abort timing are also covered by desktop unit tests.

## Diagnostic contract

Browser tests attach console errors, page errors, failed requests and HTTP 5xx; unexpected errors fail the test. Only the explicit initial auth-refresh 401 console response and navigation net::ERR_ABORTED are tolerated. No global ignore. Screenshots, traces and video are retained on failures. Desktop traces and screenshots are local under test-results-electron. Both suites use one worker and zero automatic retries so a failed first attempt is visible.

## Still required for complete coverage

UI-only supplier receiving retry, CSV import/conflict review including real TCLINV shape, all category-template resolution branches, actual brand uploads, secret-preset selection and invalid secret pricing in browser, barcode decoding plus physical scan, valid-until, printer absence, installed-version upgrade/clean install, realistic older populated-main backup upgrade, OS-reboot cold start, large catalogue performance. Unit coverage does not turn these gaps into browser passes.

Playwright Electron API reference: https://playwright.dev/docs/api/class-electron. Tests use real application windows; no mocked financial backend or substituted health response.
