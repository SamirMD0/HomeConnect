# Final release review — 2026-09-28

**Engineering target reached: READY FOR MANUAL ACCEPTANCE.** All automated pre-installer gates and the installer source-to-package verification pass on `upgrade/phase-03-pricing-cards`. This is not permission to merge, publish, or install over live business data. Historical review drafts are retained in `evidence/historical-release-docs/`.

## ENGINEERING GATES

| Gate | Result | Evidence |
|---|---|---|
| Full zero-skip tests | PASS — 365 files / 2,841 tests / 0 skipped, exit 0, 398s | [`evidence/test-ci.log`](evidence/test-ci.log), [`evidence/test-ci.json`](evidence/test-ci.json), [`evidence/vitest-report.json`](evidence/vitest-report.json) |
| Typecheck (frontend + backend) | PASS — exit 0, 30s | [`evidence/typecheck.log`](evidence/typecheck.log), [`evidence/typecheck.json`](evidence/typecheck.json) |
| Typecheck (Electron) | PASS — exit 0, 7s | [`evidence/typecheck-electron.log`](evidence/typecheck-electron.log), [`evidence/typecheck-electron.json`](evidence/typecheck-electron.json) |
| Production build | PASS — exit 0, 61s. `frontend/dist` contains no audit URL (`127.0.0.1:4311`/`4312`); production `127.0.0.1:3001` baked in. | [`evidence/build.log`](evidence/build.log), [`evidence/build.json`](evidence/build.json) |
| Production dependency audit | PASS — zero production findings; ten dev/build/test-only advisories individually classified. | [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) |
| Full managed Playwright critical suite | PASS — 16/16, 0 flaky, 0 skipped, exit 0, 109s. Includes category/shop/product template precedence, secret pricing, brand-logo fallback, feature-icon fallback. | [`evidence/playwright.json`](evidence/playwright.json) |
| Installer build (Windows, x64) | PASS — `release/2.0.1/HomeConnect-Setup-2.0.1.exe`, 113 453 768 bytes, SHA-256 `58345ea4a46e4f34d3cdbd91c5878e13e7575f675fdbd1f32e30d4c0ed1cc5bd`, Authenticode `NotSigned` (accepted limitation). | [`evidence/dist-win-2026-09-28-final.log`](evidence/dist-win-2026-09-28-final.log), [`evidence/installer-checksum.json`](evidence/installer-checksum.json) |
| Installer source-to-package verification | PASS — electron 19/19, frontend 188/188, backend 787/787, migrations 67/67, repair 32/32 (zero missing, extra, or changed). `dompurify@3.4.16`, `qs@6.16.0`, `undici@7.30.0`. No audit URL in bundled client. No forbidden resources (`.env`, `.backup`, `databases.json`). | [`evidence/current-installer-verification.json`](evidence/current-installer-verification.json) |
| Isolated current-schema backup / restore / integrity | PASS — 50 business tables unchanged after backup→restore into disposable `hc_audit_test_recovery_isolated_20260928143157`; pending thermal-reconcile migration applied (adds `_thermal_template_reconcile_notes`), 0 failed, 0 mismatched; backend health returned 200. | [`evidence/isolated-backup-restore.json`](evidence/isolated-backup-restore.json) |

No engineering blocker remains.

## EXTERNAL INPUT REQUIRED

**EXTERNAL BLOCKER — genuine prior-version 120×80 installed backup unavailable.** August backup predates the template, September 23 lacks the row, later copies are already 76×80; repository history is only source-code provenance. Exact-seed and current-schema rehearsals reduce known migration risk but cannot establish behavior for unknown installed data. Treat this as historical-upgrade rehearsal limitation requiring manual risk acceptance and a verified independent rollback backup before any prior-version production deployment.

## MANUAL ACCEPTANCE REQUIRED

Automated evidence does not replace the following owner-attended steps. See [`MANUAL_ACCEPTANCE.md`](MANUAL_ACCEPTANCE.md) for the exact procedure. None of these can be signed off from this session:

- Install the candidate installer on a disposable Windows profile, verify first launch/login, Windows reboot, second launch/login.
- Physical printer, scanner, barcode label, pricing-card, receipt/invoice, SKU, staff-code, human-readable-barcode checks.
- Off-machine backup: create a fresh app backup, copy it to independent media, restore into a disposable environment, integrity-check it.
- Owner review and explicit approval before any merge/release or live deployment.

## ACCEPTED LIMITATION

**Unsigned Windows installer.** Owner-accepted for this release. Authenticode reports `NotSigned`; keep that visible to the operator and do not describe the artifact as production-signed.
