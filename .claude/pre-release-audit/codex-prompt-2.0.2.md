# Codex prompt — bump Home Connect to v2.0.2 and build the Windows installer

Copy the block below into a fresh Codex session (or wherever you run the agent). The prompt is self-contained: it names the repo path, the branch, the constraints, and the exact commands to run so the agent doesn't need to re-derive context.

---

```
Repo: D:\User\Documents\Home Connect
Branch: main (already at d173b98, up to date with origin/main)
Goal: bump the version to 2.0.2, run every pre-release gate on main, build the unsigned Windows Electron installer, verify source-to-package, place the artifact in release/2.0.2/, and stop.

Hard constraints — do NOT break these:
- Do NOT push, tag, merge, or open a PR. Only commit locally.
- Do NOT touch the live business database. Every DB command must target a database whose name matches /(^|[_-])(test|ci|rehearsal|reconcile)([_-]|$)|phase\d/ or the hc_audit_test_* prefix.
- Do NOT sign the installer. Unsigned is an accepted limitation for this release; Authenticode will report NotSigned, that is expected.
- Do NOT change any dependency version, override, or lockfile entry. package.json overrides must stay as-is (dompurify ^3.4.16, qs ^6.16.0, undici via jsdom / @electron/get / node-gyp).
- Do NOT run installers over the live app or ship the artifact anywhere.
- Do NOT skip a gate. If a gate fails, stop and report — do not paper over it.

Preconditions to verify before starting:
1. `git rev-parse --abbrev-ref HEAD` prints `main`.
2. `git status --short` is empty.
3. `git rev-parse HEAD` matches `origin/main`.
4. `node -v` prints something ≥ 22, `npm -v` prints something ≥ 10.
5. `cat package.json | jq -r '.version'` prints `2.0.1`.
6. The isolated audit databases still exist:
     psql -h localhost -p 5433 -U postgres -l | grep -E 'hc_audit_test_(ci|browser|recovery)'
   Password: read from your environment or the local .env; never echo it.
   If any of ci/browser/restored databases are missing, create fresh ones via `npx tsx scripts/release-audit-databases.ts` first.

Step 1 — version bump
- Edit `package.json`: change "version": "2.0.1" to "2.0.2". No other edits.
- Regenerate `package-lock.json` for the version bump only:
    npm install --package-lock-only
- Commit:
    git add package.json package-lock.json
    git commit -m "chore(release): 2.0.2

Version bump only. No dependency, code, or config changes. Overrides
(dompurify, qs, undici via jsdom / @electron/get / node-gyp) stay
identical to 2.0.1.

Co-Authored-By: <author line per your workflow>"

Step 2 — clean install (deterministic)
- Delete node_modules/ and re-install from the lockfile:
    rm -rf node_modules
    npm ci
  This guarantees the build is not influenced by any leftover phase-03 install state.

Step 3 — full zero-skip test gate
    DATABASE_URL="postgresql://postgres:<pw>@localhost:5433/<hc_audit_test_ci_*>" \
    BUSINESS_TIMEZONE="Asia/Beirut" \
    npx tsx scripts/release-audit-run.ts test:ci
  Expected: exit 0. Vitest report says at least 365 files / 2,841+ tests / 0 skipped.
  Log written to `.claude/pre-release-audit/evidence/test-ci.log` (archive the prior copy under evidence/history/2026-<date>-pre-2.0.2-test-ci.log before it's overwritten).

Step 4 — typechecks
    npx tsx scripts/release-audit-run.ts typecheck
    npx tsx scripts/release-audit-run.ts typecheck:electron
  Expected: exit 0 for both.

Step 5 — Playwright critical suite
    npx playwright test
  Expected: 16/16, 0 flaky, 0 skipped. If any test fails, stop. Do NOT retry until you understand the failure. Playwright rebuilds `frontend/dist` with the audit VITE_API_URL — that is expected and gets overwritten in Step 7.

Step 6 — isolated backup/restore integrity
    npx tsx scripts/release-audit-isolated-recovery.ts
  Expected: exit 0. JSON at `.claude/pre-release-audit/evidence/isolated-backup-restore.json` must show:
    - checkedTables: 50
    - changedTables: []
    - addedTables: ["_thermal_template_reconcile_notes"]  (the pending forward migration is applied on the restored copy)
    - failed: [], mismatched: [], pending: []
    - backendReady: true

Step 7 — production build (no audit URL)
    env -u VITE_API_URL npx tsx scripts/release-audit-run.ts build
  Expected: exit 0. After it finishes, verify no audit URL leaked:
    grep -rn '127.0.0.1:4311\|127.0.0.1:4312' frontend/dist
  Expected: no matches. Then:
    grep -rl '127.0.0.1:3001' frontend/dist | wc -l
  Expected: ≥ 1 (production API URL baked in).

Step 8 — build the installer
- First move any prior 2.0.1 artifact out of the way so nothing clashes:
    if [ -d release/2.0.2 ]; then mv release/2.0.2 release/2.0.2.pre-attempt.$(date +%s); fi
- Then:
    npm run dist:win
  Expected: exit 0. Output ends up in `release/2.0.2/HomeConnect-Setup-2.0.2.exe` (electron-builder reads the version from package.json).

Step 9 — source-to-package verification
    npx tsx scripts/verify-current-installer.ts
  Expected: exit 0. The JSON at `.claude/pre-release-audit/evidence/current-installer-verification.json` must show:
    - electron.missing: 0, electron.changed: 0
    - resources.frontend.missing: 0, extra: 0, changed: 0
    - resources.backend.missing: 0, extra: 0, changed: 0
    - resources.migrations.missing: 0, extra: 0, changed: 0
    - resources.repair.missing: 0, extra: 0, changed: 0
    - runtimePackages.dompurify == 3.4.16
    - runtimePackages.qs == 6.16.0
    - runtimePackages.undici == 7.30.0
    - clientHasAuditUrl == false
    - forbiddenResources == 0
    - latestVersionMatches / latestFileHashMatches / latestFileSizeMatches all true

Step 10 — record hashes + Authenticode status
    sha256sum release/2.0.2/HomeConnect-Setup-2.0.2.exe
    powershell -NoProfile -Command "(Get-AuthenticodeSignature 'release/2.0.2/HomeConnect-Setup-2.0.2.exe').Status"
  Expected: `NotSigned` — this is the accepted limitation. Record both the SHA-256 and the NotSigned status.

Step 11 — update installer-checksum.json
- Edit `.claude/pre-release-audit/evidence/installer-checksum.json`:
    - Move the current "current" entry into "historical" with a `status` field explaining it's the 2.0.1 build.
    - Replace "current" with the fresh 2.0.2 record: path, bytes, sha256, builtAt, signature: "NotSigned", sourceToPackageDrift: "none", clientHasAuditUrl: false, forbiddenResources: 0, runtimePackages block, verification / packageLog paths.
- Copy the fresh package log:
    cp <the dist:win stdout you captured> .claude/pre-release-audit/evidence/dist-win-2.0.2-final.log

Step 12 — commit the release evidence + checksum record
    git add package.json package-lock.json .claude/pre-release-audit/evidence/
    git commit -m "chore(release): 2.0.2 installer + gate evidence

Fresh Windows installer at release/2.0.2/HomeConnect-Setup-2.0.2.exe
(NotSigned, accepted limitation). Every pre-installer gate green on
main:
- test:ci 365 files / 2,841 tests / 0 skipped
- typecheck (frontend+backend+electron) clean
- Playwright critical 16/16
- Isolated backup/restore integrity: 50 tables unchanged
- Production build: no audit URL in dist/, prod 127.0.0.1:3001 baked
- Source-to-package verification clean: electron 19/19,
  frontend/backend/migrations/repair all match, dompurify 3.4.16,
  qs 6.16.0, undici 7.30.0, no forbidden resources.

installer-checksum.json updated: 2.0.2 promoted to current, 2.0.1
retained as historical.

Co-Authored-By: <author line per your workflow>"

Step 13 — final report
Print, in one block:
- HEAD short SHA and log line
- release/2.0.2/HomeConnect-Setup-2.0.2.exe: bytes + SHA-256 + Authenticode status
- Every gate: command + exit code + short pass/fail line
- Any gate that did NOT run and why
- Manual acceptance items still open (they belong to the operator, not you):
   * Install + first-launch + Windows-reboot verification against a disposable Windows profile
   * Physical printer, scanner, receipt/invoice, staff-secret preset checks
   * Off-machine backup: create in-app, copy to independent media, verify SHA-256 matches, restore into disposable DB

Do not push, tag, or open a PR. If any step above fails, stop at that step, print the failing command and its last 40 lines of output, and do NOT proceed. Do not attempt automated retries.
```

---

Notes for you (not the agent):
- The prompt assumes you'll paste your PostgreSQL password inline or via `PGPASSWORD` env — replace `<pw>` before running, and pick the newest `hc_audit_test_ci_phase4_phase5_phase6_*` from the current `e2e/.runtime/databases.json` when you fill in the DATABASE_URL for step 3.
- If Codex reports a gate failure, share the exact log with me and I'll help diagnose before we retry.
- The install-and-reboot / hardware / off-machine-backup manual acceptance still needs your hands — no agent can do those.
