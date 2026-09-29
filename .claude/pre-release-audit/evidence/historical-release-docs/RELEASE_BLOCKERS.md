# Release blockers

**Latest checkpoint, 2026-09-28 — BLOCKED for production/main (supersedes every older status below).** Actionable engineering fixes completed: Windows Playwright server teardown uses owned IPC shutdown instead of denied `taskkill`; a definite PostgreSQL TCP refusal now fails startup promptly with the existing actionable database message instead of a misleading 45-second timeout; and a browser regression covers CSV existing-product display, explicit merge selection, no automatic skip, and unchanged stock/product count. Final gates: `test:ci` **365 files / 2,840 tests / 0 fail / 0 skipped**; frontend/backend and Electron typechecks pass; exact `npx playwright test` **13/13, exit 0**, owned processes and ports gone; final packaged Electron suite **5/5, exit 0** outside the restricted sandbox against the isolated audit database. The DB-refusal/retry scenario now passes in 7.8 seconds. No production GPU workaround was added.

The final **technical diagnostic installer** is `release/2.0.1/HomeConnect-Setup-2.0.1.exe`, 113,453,551 bytes, SHA-256 **`3b6563387b5e3738ee406e9f46b4b6695839cde54f1a5d4232365b5f252d6c8f`**. Normal production build and offline installer build exited 0. Source-to-package verification passed for 187 frontend, 787 backend, 67 migration, 32 repair, and 19 Electron compiled files; no audit URL or forbidden resource; version metadata and `latest.yml` hash/size match. The local Electron runtime executable matched the official checksum-verified archive. Actual Authenticode status remains **NotSigned**. **BLOCKED / NOT CONFIGURED — approved Windows code-signing certificate not available.** No repository signing hook or documented certificate setup was found. Do not self-sign, publish, or install over the live app.

Fresh-profile **process-cold** packaged startup with normal GPU settings passed outside the restricted sandbox: login usable in **9.532 s** and on second launch in **4.349 s**, connected DB health, clean shutdown/no app listener. All five packaged scenarios passed, including missing JWT, unavailable DB/retry, and occupied foreign port. The screenshot's native `0x80000003` breakpoint and Crashpad access-denied log reproduced only under the restricted sandbox; a restricted GPU-disabled run also crashed, while both outside-sandbox GPU-disabled and normal-GPU launches passed. This is evidence of an execution-environment restriction, not proof of a production GPU defect. A **real Windows reboot/first-launch** and actual installer install/upgrade remain unperformed and must be accepted separately.

The isolated current-schema backup/restore/migrate/start/integrity rehearsal remains valid: 50 business tables unchanged, one forward migration applied, no pending/failed/mismatched entries, DB health connected, backend stopped. Its one restricted-environment startup took 62.064 s; the final outside-sandbox packaged process-cold login took 9.532 s. A real-machine performance benchmark still requires manual acceptance. Local backup folders, repository history/tags and release artifacts were inspected read-only: the old July 1.0.4 backup predates the thermal template; the Sep 23 backup lacks its row; later inspected backups contain 76×80. Git has the original 120×80 seed definition but no authentic installed database at that state. Per owner: **BLOCKED — genuine prior-version 120×80 backup not available.** Do not fabricate or restore against live data.

Physical printer/scanner/receipt/invoice/secret-code verification and an independent off-machine backup remain manual; `MANUAL_ACCEPTANCE.md` has exact steps. Remaining browser gaps include secret-preset/invalid-secret and category-default/logo matrices; production audit has 0 findings but 10 build/test-tree advisories need policy disposition. These, signing, genuine prior-version upgrade, real installer install/upgrade, reboot/physical acceptance, and owner sign-off keep the release **BLOCKED**. No push/merge to main, version bump, release, or live-business-DB migration occurred.

**Final engineering checkpoint, 2026-09-28 — BLOCKED (this section supersedes all older status/counts below).** The Windows Playwright shutdown defect is fixed: Playwright's built-in `webServer` calls `taskkill /T /F` and waits indefinitely when that command gets `Access denied` in this environment. `e2e/global-setup.ts` now builds the isolated E2E assets, starts the audit server without a shell, asks it to stop over IPC, and verifies its owned backend PID and ports are gone. The exact `npx playwright test` command passed **12/12, exit 0**, and recorded `cleanExit: true` in `e2e/.runtime/managed-server-pids.json`. The full `test:ci` gate passed **364 files / 2,837 tests / 0 failures / 0 skips**; frontend/backend and Electron typechecks passed. The normal production build passed.

The **current** Windows installer was rebuilt offline from the locally installed Electron 43.2.0 distribution (its executable matches the official checksum-verified cached archive). `npx electron-builder --win --config.npmRebuild=false --publish=never` exited 0. `release/2.0.1/HomeConnect-Setup-2.0.1.exe`: **113,452,726 bytes**, SHA-256 **`28a151102b0cc5a394f2ad67365252b4c9c256257fadbf2b463031372ac8ebcc`**. `scripts/verify-current-installer.ts` passed: version 2.0.1 metadata; 187 frontend, 787 backend, 67 migration, 32 repair, and 18 Electron compiled files matched the source/staged manifests with no missing, extra, or changed files; no audit URL or forbidden resource. The actual Authenticode status is **NotSigned** despite Electron Builder's “signing” log line. This is a diagnostic candidate, **not** an approved release and must not be installed over the live business app.

An isolated browser-DB backup/restore/migrate/start/integrity rehearsal passed: 50 existing business tables unchanged, one forward migration applied, no pending/failed/mismatched migrations, health connected, backend stopped. Evidence: `evidence/isolated-backup-restore.json`. Backend readiness took **62.064 seconds**, which remains a performance concern. Historical backup search found no genuine installed 120×80 thermal-template snapshot: earlier backups predate the row and later backups contain 76×80. **BLOCKED — genuine prior-version backup required from user.** Synthetic and current-shape rehearsals do not substitute for the required prior-installed-version upgrade.

The rebuilt packaged app **failed a fresh-profile cold-start test**. The latest attempt raised a native `0x80000003` breakpoint dialog; its startup trace stopped immediately after “Electron boot attempt started”, `debug.log` recorded Crashpad `CreateFile: Access is denied (0x5)`, and the Playwright cold/warm test timed out at 150 seconds (exit 1). A prior restricted run showed GPU process `0xC0000135`; another earlier diagnostic run got backend/frontend ready but the app closed before login. These observations do **not** establish a single root cause or prove production startup. No reboot test was possible, and unrelated existing Node processes were not killed. Cold/reboot/login acceptance remains **BLOCKED**. The latest test left no HomeConnect process or app listeners on 3001/3002 or 4311/4312.

Physical printer/scanner tests and an off-machine backup remain manual. Automated barcode/label/print-focused checks passed **28/28**; exact hardware steps are in `MANUAL_ACCEPTANCE.md`. Additional release gaps: genuine prior-version upgrade; cold/reboot startup and the 62-second restore-start performance; physical receipt/invoice, pricing-card, barcode, scanner and secret-code verification; off-machine backup; browser workflow coverage beyond the 12 critical cases; security-policy disposition of **10 build/test-tree advisories** (production audit 0); and a signed/owner-approved installer. **Do not push/merge to main, version, publish, or migrate live data.**

**Latest engineering status, 2026-09-28 (supersedes older candidate/security paragraphs below):** the forward-only thermal reconciliation migration is now in `backend/prisma/migrations/20260928010000_reconcile_thermal_template_variants/`. Historical applied migration files and `_prisma_migrations` rows remain unchanged. The SQL safety scanner permits its UPDATE only when the entire reviewed DO block matches a pinned SHA-256; mutations of the target, guard, values, or table fail scanner tests. Synthetic A/B/C/customisation cases, an old-main migration chain, and a restored current-business-DB copy pass. The restored copy recorded the forward migration without changing any of 50 checked business tables; its thermal row was preserved as `SKIPPED_CUSTOMISED` because `config` differs from the exact shipped seed. This is **not** evidence from a real 120×80-era installation. The exact checksum allowlist remains enforced, with unknown drift rejected.

React Router/DOM were updated to 7.18.2, which closes the bundled-client advisory in the current lockfile. Current npm audit: **0 production-tree findings; 10 full-tree findings (7 high, 3 moderate), all in build/test-side packages**. Full regression gate: **364 files / 2,836 tests / 0 fail / 0 skipped**, frontend/backend and Electron typechecks pass. Updated browser build: **12/12 Playwright pass, exit 0** using a separately started audit server; the built-in Windows Playwright `webServer` shutdown hung after printing test results, so its earlier interrupted runs are not counted. An isolated browser fixture now replenishes consumed test stock with matching ledger movements before a repeat run. Normal production build was restored after browser testing. No installer was rebuilt, and no push, merge, version bump, or live-business-DB migration occurred.

**Still blocking main/release approval:** obtain and rehearse a genuine 120×80-era installed database (or approved redacted backup); complete real prior-version upgrade and Windows reboot/first-launch acceptance; test physical printer, scanner, off-machine backup, and performance; close the specified browser workflow gaps; review the remaining build/test advisories under the release security policy; rebuild and inspect a fresh signed/approved installer only after gates and owner acceptance. The existing installer is stale. The historical proposal and old counts below are retained for provenance, not current status.

**TypeScript gate regression resolved, 2026-09-28:** the two `checksum-allowlist.test.ts` mocks now satisfy `MigrationClient`; `tsconfig.server.json` includes the imported policy JSON. Focused tests 7/7 pass. A fresh `test:ci` passed 364 files / 2,834 tests / 0 skips; frontend/backend and Electron typechecks, E2E-mode build, and 12/12 browser Playwright all passed. Earlier failed attempt remains in dated evidence. This closes the TypeScript gate blocker, not the migration, security or operational blockers below.

2026-09-28 engineering update: the exact checksum allowlist is implemented locally and the shared JSON policy is now gated by `npm run audit:migration-drift` before the release-audit `test:ci` task. A deliberately wrong checksum on a **new disposable clone** was rejected (exit 1, thermal migration named); no existing migration history was edited. The read-only maintenance UI now displays thermal reconciliation notes. Additional synthetic rehearsals cover linked products, customization after the prior refinement, a full dump/restore, rollback, repeat execution, and an old-main chain with the refinement absent. The candidate forward migration remains in scratchpad, uncommitted and unapplied to any business database. The detailed older proposal below is retained for provenance; statements calling the allowlist/UI "proposed" are superseded by this update.

Current security review (`SECURITY_REVIEW.md`) finds **12 full-tree advisories**, including React Router code bundled into the frontend. Production-only audit has zero findings, but is not a complete shipped-client assessment. The pre-overrides installer is renamed `.pre-overrides.stale.exe` and still contains older vulnerable runtime dependencies.

1. **High — migration history consistency.** Two flagged rows in `_prisma_migrations`:
   - `20260924100000_add_appliance_shelf_thermal_template` — stored checksum matches the original 120×80 seed at commit `4aa36bc`. File on disk is the edited 76×50 seed at commit `e9bbeda`.
   - `20260914180000_add_product_categories` — CRLF vs LF drift only.

   **Do not edit historical migration files or rewrite `_prisma_migrations` rows.** The plan below is a forward-only correction; historical-checksum reconciliation across installations is discussed separately (see the `Historical checksum reconciliation` heading below).

   Candidate forward migration (drafted and rehearsed 2026-09-28, **not committed to `backend/prisma/migrations/`**): full text at `<scratchpad>/thermal-reconcile/candidate-migration.sql`. Proposed final name once approved: `20260928010000_reconcile_thermal_template_variants`.

   - Customization guard derived from the actual historical seed definitions rather than a guessed column list. The migration compares strict equality on every field the historical seed owned — `name`, `paperMode`, `paperSize`, `configVersion`, `specKeyOrder`, `defaultValidityDays`, plus variant-specific `description`, `cardWidthMm`, `cardHeightMm`, `featureMax`, `config` (JSONB equality). Both known shipped seeds are recognised:
     - **Variant A** — the original 120×80 seed (git `4aa36bc`, `description = 'Shelf card for appliances, pure black-on-white for XP-80T thermal printers'`, `featureMax = 4`, hero-prominence config).
     - **Variant B** — the intermediate 76×50 seed (git `e9bbeda`, current on-disk migration text, `featureMax = 4`, hero-prominence config, `config.appearance.layout = 'centered'`).
   - Behaviour:
     - Match variant A or variant B exactly → converge to variant C (76×80, `featureMax = 2`, stack layout, large-prominence pricing), record `CONVERGED_FROM_VARIANT_A` or `CONVERGED_FROM_VARIANT_B` in a new `_thermal_template_reconcile_notes` audit table.
     - Already at variant C → record `ALREADY_CURRENT`; do not touch the row.
     - Any other state (customised) → record `SKIPPED_CUSTOMISED` with a `diffFields` list naming exactly which owned columns diverged from every known seed; do not touch the row.
     - Row absent → record `NO_ROW`; do not fail.
   - Rehearsal 2026-09-28 against the disposable local database `homeconnect_thermal_reconcile_rehearsal` (created for this rehearsal only, then left in place for a repeat run):
     1. Variant A untouched → converges to C.  ✔
     2. Variant B untouched → converges to C.  ✔
     3. Variant C already current → no-op with `ALREADY_CURRENT`.  ✔
     4. Variant A + customised `description` → `SKIPPED_CUSTOMISED`, `diffFields=['description']`, row preserved.  ✔
     5. Variant A + customised `config.appearance.marginMm` → `SKIPPED_CUSTOMISED`, `diffFields=['config']`, row preserved.  ✔
     6. Variant B + customised `name` → `SKIPPED_CUSTOMISED`, `diffFields=['name']`, row preserved.  ✔
     7. Row deleted → `NO_ROW`, no failure.  ✔
     8. Repeat pass immediately after (8a) converged → `ALREADY_CURRENT` (safe repeat).  ✔
   - This is **synthetic coverage** against fixtures that reproduce known historical states. It is not an upgrade rehearsal on a real customer database. A separate upgrade rehearsal against a real 120×80-era snapshot (or an approved redacted copy of one) remains a prerequisite before the migration is committed.
   - CRLF drift on `20260914180000_add_product_categories`: add a `.gitattributes` rule `*.sql text eol=lf` in the same change so future installations never store a CRLF checksum again. The one already-recorded CRLF checksum stays as historical evidence.

   **Owner decisions required before this migration is committed and applied to any real installation:**
   1. Approve the derived seed-owned column list (above) as the customisation guard.
   2. Approve the audit table name (`_thermal_template_reconcile_notes`) — an operator-visible name is preferred so support can grep for it later.
   3. Supply, or approve synthesising, a real-shape upgrade rehearsal target (a redacted snapshot of a 120×80-era installation is enough; nothing needs to be written to the business database itself).

   ### Historical checksum reconciliation — Path P1 concrete policy

   **P2 (rewriting `_prisma_migrations` rows) is dropped.** Recorded checksums stay untouched on every installation. The proposal below is Path P1 only, made enforceable in code rather than left to documentation.

   **Where the check lives.** `backend/src/features/maintenance/migration-runner.ts` currently classifies each bundled migration against `_prisma_migrations` and returns `mismatched` when `row.checksum !== migration.checksum`. That state is surfaced through `maintenance.service.ts` (`getMigrationStatus`) and `diagnostics-export.service.ts` but is not currently a hard block; it is a signal callers can read. The forward-only guarantee below is that **any mismatch outside the exact allowlist keeps this signal as CHECKSUM_MISMATCH**, and release-readiness gates (health/preflight/CI) must treat that signal as a blocker.

   **Concrete allowlist.** Three-tuple keyed by `migration_name` × `recorded_checksum` × `on_disk_checksum`. Anything not matching this exact tuple stays MISMATCHED and continues to block:
   ```
   [
     {
       migrationName: '20260924100000_add_appliance_shelf_thermal_template',
       recordedChecksum: '863e3e6e201cd7c99d499a9fe0c5f83ceb8a51ab9e1ea5b185adbcc41259219a',
       onDiskChecksum:   'c0aadf8748468470579ed69df9a9ad28114c2f4044c070de039649e22a283330',
       reason: 'edited-after-application 2026-09-24 (git 4aa36bc -> e9bbeda); the ' +
               'forward migration 20260928010000_reconcile_thermal_template_variants ' +
               'converges the seed row from either historical state to variant C.',
     },
     {
       migrationName: '20260914180000_add_product_categories',
       recordedChecksum: '3a86cdb1e4e485e19749a6c39ea3ee0d1585417ffe809b8a3bc9c92def6c5372',
       onDiskChecksum:   'b774e3bcf474c2bb8db6c52ce18fd925113dcdf02cd52140c6bd58c84405ff5e',
       reason: 'CRLF vs LF encoding only; the SQL bytes are semantically identical.',
     },
   ]
   ```
   All four checksum values in this table were computed and confirmed on 2026-09-28 (thermal file at `4aa36bc` re-hashed against the current on-disk file; category file rehashed under both `.replace(/\r\n/g, "\n")` and `.replace(/\n/g, "\r\n")`).

   **Enforcement code change (proposed — not applied yet):** in `classifyMigrations` at `migration-runner.ts:130-132`, change:
   ```ts
   if (row.checksum !== migration.checksum) {
     if (isAllowlistedDrift({ name: migration.name, recorded: row.checksum, onDisk: migration.checksum })) {
       return { name: migration.name, state: 'APPLIED', checksum: migration.checksum, appliedAt: row.finished_at, historicalChecksumDrift: true };
     }
     return { name: migration.name, state: 'CHECKSUM_MISMATCH', checksum: migration.checksum, appliedAt: row.finished_at };
   }
   ```
   with `isAllowlistedDrift` matching all three fields of the tuple. `historicalChecksumDrift: true` is added so the diagnostics/health payload still surfaces the drift for operators; the difference is that classification no longer flags it as an unresolved MISMATCH. **Unknown drift (any migration name, or a name in the table but with a different pair of checksums) remains CHECKSUM_MISMATCH and continues to block.**

   **Interaction with Prisma tooling.**
   - Home Connect's runtime path uses this custom `migration-runner.ts` (see `MigrationExecutor` in the same folder), not `prisma migrate deploy`. That means the enforcement change actually takes effect in the running app.
   - `prisma migrate status` / `prisma migrate deploy` (used only in development and CI) will still print their own drift warnings for those two rows. That is acceptable and expected — those tools inspect the database themselves and do not consult our allowlist. CI must not treat those warnings as blockers for these two specific rows; a `scripts/assert-migration-drift-allowlisted.mjs` helper (added alongside the allowlist file) that re-checks the same tuple can gate CI while keeping the rest of the migration-status output strict.
   - **Documentation alone is insufficient.** The audit item is closed only after (a) the allowlist constant + `isAllowlistedDrift` are added to `migration-runner.ts` with tests, (b) the CI helper refuses any mismatch outside the allowlist, and (c) the health/diagnostics payload continues to expose `historicalChecksumDrift: true` so operators can still see the drift.
   - No change to `_prisma_migrations` rows. No historical migration file edited.

   **Owner decisions genuinely required:**
   1. Approve the derived seed-owned column list as the customization guard for `20260928010000_reconcile_thermal_template_variants`.
   2. Approve the audit-table name `_thermal_template_reconcile_notes` (or supply another).
   3. Supply, or approve synthesising, a real-shape 120×80-era upgrade rehearsal target — the synthetic rehearsal is not proof.
   4. Approve committing the P1 allowlist + `isAllowlistedDrift` code change and the CI helper.
2. ~~**High — product editing workflow.**~~ **RESOLVED 2026-09-27.** Code fixes to `ProductFormDialog.isProductPricingChanged` and `usePricingCalculation` gate. Playwright browser suite rerun after resetting the `AUDIT-KETTLE-AUDIT.notes` fixture: **12/12 pass, 0 fail, 0 skipped, 49.9 s** against `hc_audit_test_browser_20260926124725` (isolated). Evidence: `evidence/playwright.json`. Additional regression coverage: `products.components.test.tsx` (47 tests) exercises the normalised comparison; `business-date.test.ts` (13 tests) covers `businessDateStartInstant` including DST transitions; `monthly-debts.repository.range.test.ts` (4 tests) locks the `createdAt` instant-boundary contract.
3. **High — dependency advisories.** Verified 2026-09-28 with `npm ls` and `npm view` — earlier "must bump major" and "express doesn't advertise 6.16" claims were wrong. All three prod advisories now close via narrow in-major overrides.

   **Dependency-path evidence (from `npm ls`, exact):**
   - `undici` 7.x runtime: `home-connect → isomorphic-dompurify@3.19.0 → jsdom@29.1.1 → undici`.
       - `jsdom@29.1.1` declares `undici: ^7.25.0` (from `npm view jsdom@29.1.1 dependencies.undici`).
       - Advisory-affected range: `>=7.0.0 <7.29.0` (from `npm audit --json`).
       - Latest 7.x published: `7.30.0`.
       - `^7.25.0` semver-matches `7.30.0` → **no jsdom bump required**. `overrides.jsdom.undici: "^7.30.0"` is a minor-version bump inside the range jsdom already permits.
   - `undici` 7.x build-time: `home-connect → electron@43.2.0 → @electron/get@5.0.0 → undici`. Same fix, applied as `overrides["@electron/get"].undici: "^7.30.0"`.
   - `undici` 6.x build-time: `home-connect → electron-builder@26.15.3 → app-builder-lib → @electron/rebuild@4.2.0 → node-gyp@12.4.0 → undici@6.27.0`.
       - Advisory-affected range: `<6.28.0`. Latest 6.x published: `6.29.0`. `overrides["node-gyp"].undici: "^6.29.0"` — narrow in-major bump, no node-gyp bump required.
   - `qs`: `home-connect → express@5.2.1 → qs` and `express@5.2.1 → body-parser@2.3.0 → qs`.
       - `express@5.2.1` declares `qs: ^6.14.0` (from `npm view express@5.2.1 dependencies.qs`).
       - Advisory ranges: `array-limit bypass >=6.14.2 <=6.15.3`, `isBuffer DoS >=2.2.5 <6.16.0`.
       - Registry: no `6.15.4` published; next is `6.16.0`.
       - `^6.14.0` semver-matches `6.16.0` → **express does not need to explicitly "advertise" 6.16.0; its own `^6.14.0` constraint already accepts it**. Earlier claim to the contrary was wrong. `overrides.qs: "^6.16.0"` is the minimal fix.

   **Applied 2026-09-28 (in `package.json`, verified end-to-end):**
   ```
   "overrides": {
     "dompurify": "^3.4.16",
     "qs": "^6.16.0",
     "jsdom": { "undici": "^7.30.0" },
     "@electron/get": { "undici": "^7.30.0" },
     "node-gyp": { "undici": "^6.29.0" }
   }
   ```
   plus the earlier `xlsx` removal from `devDependencies` (zero code imports across `backend/`, `frontend/`, `desktop/`, `scripts/`; only inert Vite prebundle hints, since removed).
   After `npm install`: `npm ls undici qs dompurify` shows every occurrence as `overridden`, `qs@6.16.0` deduped everywhere, `dompurify@3.4.16` deduped everywhere. **`npm audit --production` = 0 vulnerabilities of any severity.**

   **Regression evidence (only for the touched packages — full unchanged gates were not repeated):**
   - `npx vitest run backend/src/features/pricing-card backend/src/features/service/products/products.validator.test.ts backend/src/features/pricing-card/feature-icon` → **13 files / 61 tests / 0 fail** (DOMPurify code path).
   - `npx vitest run backend/src/features` without `RUN_*_DB_TESTS` flags → **195 files / 1,569 tests / 0 fail, 15 files / 50 tests skipped** (opt-in DB integration suites). Exercises the express + zod validator path that consumes `qs`. No new failures.
   - Playwright browser project's `products: search, edit notes, preserve price and barcode` test now runs **twice consecutively with no manual DB reset**: 12.0 s + 5.7 s, both pass. Previous manual "reset kettle notes" workaround is retired — see the fixture fix under blocker #2.

   **Remaining full-tree advisories:** `react-router`/`react-router-dom` are declared as dev dependencies but their runtime code is bundled into the shipped frontend, so they remain a client security blocker until updated and retested or their specific advisory is shown inapplicable. `@xmldom/xmldom`, `brace-expansion`, `concurrently`, `fast-uri`, `js-yaml`, `nanoid`, `postcss`, `shell-quote`, `vitest`, and `@vitest/mocker` are build/test-side findings in the current tree. `nanoid` appears in the browser JS only as a Zod format name, not as the generator implementation. See SECURITY_REVIEW.md for artifact evidence. The old installer predates the fixes and still contains affected backend runtime versions.

   **No blanket `npm audit fix` executed. No forced major upgrade.** All applied changes are in-semver-major overrides that the parent packages' own constraints already accept.

   **Owner decisions still required:** none for the three closed backend runtime advisories. React Router's bundled-client finding remains open and needs a reviewed dependency update or a justified risk decision before security sign-off.
4. **High — startup incident not fully explained.** Historical diagnostic proves missing externally owned dev backend; why it was missing/why reopening worked is not retained. An initial compiled stall was observed too. Later success and instrumentation do not prove a first-run Windows/cold-cache cause. Need first-launch/reboot tracing and repeatable supported-launcher evidence.
5. **Required acceptance gap — existing-version installation/upgrade.** No disposable previous-version installed environment supplied; live installed app was deliberately not overwritten. Current realistic backup already has all migration records, so restored replay is not a populated old-main upgrade test.
6. **Required acceptance gaps — printing/scanner/backup/performance.** No physical scanner or printer certification, no independently stored off-machine backup verification, no large-catalogue or reboot benchmark. See MANUAL_ACCEPTANCE.md.
7. **Required automated coverage gaps.** UI-only purchasing/receiving, CSV conflict browser flow/concurrent real-DB commit, secret-preset/invalid secret browser flow, actual category-default and logo-upload matrix are not fully automated. Unit tests do not replace these.

Additional migration acceptance risks: legacy transaction DROP has historical zero-row confirmation but no nonempty guard; broad inclusive-price update and seeded-icon/template overwrites can change operator configuration on older upgrades. Do not apply arbitrary repair SQL to the business database.

8. ~~**High — final full-suite gate fails at the business-day boundary.**~~ **RESOLVED 2026-09-27.** Three UTC-date fixture mismatches were corrected by using `todayInBusinessTimezone()` in the affected supplier receiving / purchase / validator fixtures. The report/activity `newDebt` regression was fixed in production reporting: `MonthlyDebtsService.rangeBoundaries` now also carries the UTC instants of the Beirut business-day window, and `MonthlyDebtsRepository.loadActivityRecords` uses those instants when filtering `createdAt` (a timestamp column) so a debt created in the early local hours is attributed to the correct business day. Date-only columns (`paymentDate`, `returnDate`) still use the existing UTC-midnight boundaries. New helper `businessDateStartInstant` in `financial/domain/business-date.ts`. Full suite: 361 files / **2,816 pass / 0 fail / 0 skipped**. Evidence: `test-ci` background run 2026-09-27 19:00, exit 0.

9. **Packaged cold-start qualification remains open; final warm rerun passed.** Initial packaged run: 3/5 pass, normal launch hit the test's 90s total budget, DB-unavailable guidance arrived around 33.6s after boot (beyond the test's 30s expectation). Retained separately as electron-packaged-first.json. With a harness budget that can observe the unchanged 45s app deadline plus executable startup, final rerun is 5/5 PASS. This does not explain the original first-run delay. Installer is locally built and unsigned; installation/upgrade not certified.

Startup fixes and passing reconciliation do not waive any blocker. The final verdict is in FINAL_RELEASE_REVIEW.md. No main merge, tag, version change or publication performed.
