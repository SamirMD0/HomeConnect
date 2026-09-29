# Release readiness — 2026-09-28

This page is the current decision record. Earlier working notes are preserved in `evidence/historical-release-docs/` and are **not** current release criteria. Do not push to `main`, tag, publish, or migrate live business data from this audit.

## ENGINEERING BLOCKER

- **NONE.** All automated pre-installer gates pass on `upgrade/phase-03-pricing-cards` and the freshly rebuilt installer verifies source-to-package with zero drift. Details and evidence links in [`FINAL_RELEASE_REVIEW.md`](FINAL_RELEASE_REVIEW.md).
- Gates cleared: zero-skip full tests (365 files / 2,841 tests / 0 skipped); frontend/backend and Electron typechecks; production build with no audit URL in `frontend/dist`; production `npm audit` zero findings; managed Playwright critical suite (16/16); Windows installer build (SHA-256 `58345ea4…c5bd`, 113 453 768 bytes, `NotSigned`); source-to-package verification (electron/frontend/backend/migrations/repair all match); isolated current-schema backup/restore/integrity (50 tables unchanged, pending thermal-reconcile migration applies cleanly, backend health 200).

## EXTERNAL INPUT REQUIRED

- **EXTERNAL BLOCKER — genuine prior-version 120×80 backup unavailable.** Read-only searches found an August backup predating the thermal-template row, a September 23 backup without the row, and later backups with 76×80. Git contains a 120×80 *seed definition*, not proof of an installed database at that state. No authentic prior-installed 120×80 backup was found; none was synthesized or restored from current data.
- The forward-only reconciliation has passed exact-seed variant A/B/C and customization-guard tests, old-main-chain rehearsal, and current-schema restored-copy integrity. This supports downgrading the missing historical backup from an engineering-code blocker to a **manual upgrade-acceptance requirement before production deployment**, but does not prove behavior against an unknown real 120×80-era installation. A genuine backup plus disposable upgrade rehearsal remains preferred. If unavailable, the owner must explicitly accept this residual upgrade risk and verify a restorable independent backup and rollback plan before touching any prior-version business installation. Customized rows are intentionally skipped and need operator review.

## MANUAL ACCEPTANCE REQUIRED

These steps cannot be performed from this session. Follow [`MANUAL_ACCEPTANCE.md`](MANUAL_ACCEPTANCE.md) and record owner evidence:

- **READY FOR MANUAL REBOOT ACCEPTANCE:** actual clean install/upgrade of `release/2.0.1/HomeConnect-Setup-2.0.1.exe`, first launch/login, close, Windows reboot, second launch/login, backend/database/migration/process/path checks. No reboot PASS is claimed.
- Physical printer, scanner, barcode label, pricing-card, receipt/invoice, SKU, staff-code and human-readable barcode checks. No physical PASS is claimed.
- Create a backup, copy it off the business PC, restore that independent copy into a disposable environment, and run integrity checks. Current-schema isolated restore is automated evidence but does not prove off-machine custody.
- Owner review of the final candidate and explicit approval before any merge/release or live deployment.

## ACCEPTED LIMITATION

- **Unsigned Windows installer.** The owner explicitly accepts unsigned distribution for this release. Authenticode `NotSigned` is not a release blocker and no certificate/self-signing work is authorized. Keep the unsigned status visible to the operator; do not call it production-signed.

Current gate outcomes, artifact SHA-256 and source-to-package verification results are recorded in [`FINAL_RELEASE_REVIEW.md`](FINAL_RELEASE_REVIEW.md). The exact manual steps are in [`MANUAL_ACCEPTANCE.md`](MANUAL_ACCEPTANCE.md); individual dev-tool advisory decisions are in [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md).
