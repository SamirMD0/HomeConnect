# Codex Prompt — CP-RW8B fix · CP-RW8C hygiene · cut v2.0.0

Run this once, start to finish, on `main`. It closes the last code gap in CP-RW8B, cleans the tree per CP-RW8C, bumps to `2.0.0`, builds the installer, commits in four parts, and pushes.

**Push is pre-authorised for this run.** You still show the commits before pushing, but you do not stop to ask.

## Authority

| Document | What it is for |
|---|---|
| [`claude/plans/real-work-v2.0.0-release-plan.md`](../real-work-v2.0.0-release-plan.md) | What is being released and why. §7 safety rules are binding. |
| [`Prompts/release-version-bump-and-db-repair-prompt.md`](release-version-bump-and-db-repair-prompt.md) | Release mechanics. Phases 0–2 and 4–6 apply. **Phase 3 does not** — see below. |
| [`Prompts/real-work-cp-rw8-release-codex-prompt.md`](real-work-cp-rw8-release-codex-prompt.md) | Release-specific facts and the smoke-test groups you hand back. |

Do not rewrite those. Do not work around a failing gate in them.

---

## Verified state — do not re-derive these

Measured on this repo on **2026-08-25**, immediately before this prompt was written:

| Fact | Value |
|---|---|
| Branch / upstream | `main` → `origin/main` (`https://github.com/SamirMD0/HomeConnect.git`) |
| `package.json` version | `1.9.6` |
| `npm run typecheck` | clean, frontend and backend |
| `npm run lint` | **0 errors, 89 warnings** — that is the baseline, not a regression |
| `npm test` | **256 files · 2179 passed · 10 skipped · 0 failed** |
| Schema | `backend/prisma/schema.prisma` **unmodified**; no new directory under `backend/prisma/migrations/` |
| Previous installer | `release/1.9.6/HomeConnect-Setup-1.9.6.exe` — **117,104,529 bytes** |
| `stash@{0}` | v1.8.1 leftover. **Do not pop it, do not list it as release content, do not touch it.** |

CP-RW8B is otherwise complete: the endpoint, the ADMIN guard at route *and* service, the strict schema with no `accountPassword`, exact-string matching, the 500-row abort, one `ServiceAudit` row per product with `UPDATE_DETAILS` and a shared `requestId`, the dry-run/preview UI, the Apply gate, the stale-preview fingerprint, and the removal of the SQL-script notice all exist and are tested. **Phase 1 below is the only code change in this run.**

---

## Phase 1 — CP-RW8B: the typed reason field

`frontend/src/features/products/components/BrandFixDialog.tsx` sends a hardcoded constant as the audit reason. The plan (§3 · UI · items 2 and 4) specifies a **typed reason field, minimum 5 characters**, whose edit invalidates the preview. The CP-RW8B smoke test already says "Apply with a typed reason". The backend schema already demands `reason` at min 5 / max 1000 — [`products.validator.ts:156`](../../../backend/src/features/service/products/products.validator.ts#L156).

Consequence of leaving it: every brand cleanup ever run writes an identical audit reason, so batches are distinguishable only by `requestId`. Fix it.

### Changes to `BrandFixDialog.tsx`

1. **Delete `BRAND_FIX_REASON`** (line 26). It has exactly two consumers — this file and `brands.test.tsx`. Nothing else imports it.
2. `BrandFixState` gains `reason: string`. `initialBrandFixState` sets it to `''`.
3. `BrandFixAction` gains `{ type: 'reason'; value: string }`. Like `target` and `source`, it sets `preview: null`.
4. **`brandFixFingerprint` must include the reason.** Widen its `Pick<>` to `'targetBrand' | 'sourceBrands' | 'reason'` and put the reason in the serialised tuple. A preview response that arrives after the reason changed must be discarded by the existing `action.fingerprint !== brandFixFingerprint(state)` guard.
5. `validateBrandFix` gains a `reason` error when `state.reason.trim().length < 5`, bilingual, matching the house pattern of the existing `sourceBrands` message. Also reject `> 1000` characters so the client never sends what the server will refuse.
6. `preview()` already calls `validateBrandFix` before firing — so a short reason blocks the preview, and because Apply requires a preview, it transitively blocks Apply. Do not add a second gate in `canApplyBrandFix`; leave that function as it is.
7. `preview()` and `applyBrandFix()` both send `reason: state.reason.trim()`.
8. Render the field between the "Spellings to include" fieldset and the preview: a label reading `Reason / السبب`, a `dir="auto"` text input or textarea, the min-5 hint, and the error paragraph in the same style as `errors.sourceBrands`. Its `onChange` calls `invalidate()` then dispatches `{ type: 'reason', value }`, exactly as the radio and checkbox handlers do.
9. Reset clears the reason to `''` — it already does, via `initialBrandFixState`.

### Tests — `frontend/src/features/products/components/brands.test.tsx`

Update the two places that reference the deleted constant (the import block and the failure-path assertion at line 187), then **add**:

- Preview is refused and a reason error is surfaced when the reason is under 5 characters.
- Editing the reason after a successful preview re-disables Apply.
- The typed reason is sent on both the `dryRun: true` and the `dryRun: false` call.
- A preview response computed for an earlier reason is discarded when the reason has since changed (extend the existing late-response test).

These are pure-function and `renderToStaticMarkup` tests, like the rest of the file. **Do not introduce testing-library or jsdom** — this repo has neither.

### Backend

**No backend change.** The schema, service, audit write, and tests are already correct for a typed reason. If you find yourself editing `products.validator.ts`, `products.service.ts`, or `products.normalize.*.test.ts`, stop — you have misread the task.

**Gate: `npx vitest run frontend/src/features/products/components/brands.test.tsx` green, and `npm run typecheck` clean.**

---

## Phase 2 — CP-RW8C: tree hygiene

Two file operations, no code.

1. **`.gitignore`** — add `*.backup` next to the existing `backups/` line. A 1.3 MB database backup is sitting untracked *and unignored* at the repo root; one `git add -A` puts it in history permanently.
2. **Move the backup out of the repo.** `homeconnect-2026-08-21-151618-manual.backup` at the repo root — move it to a sibling directory outside the working tree. **Do not delete it.** It is the business's backup. Report where you put it.

Then confirm with `git status --porcelain` that the `.backup` file no longer appears at all.

**Gate: `git status` shows no `.backup` entry, and `.gitignore` carries the new line.**

---

## Phase 3 — Verification gates

Runbook Phase 1, all five, in order, before any bump:

```
npm run lint
npm run typecheck
npm test
npm run build
npm run prisma:validate
```

Then, **because this tree changes `desktop/src/`**, one more that the runbook marks optional and this release does not:

```
npm run check:electron-production-runtime
```

Report real output for each. `npm run lint` returning 89 warnings and 0 errors is a pass. A failing or skipped-to-green test is the release blocker — do not weaken a test to clear a gate.

**Gate: all six clean.**

---

## Phase 4 — No repair SQL. Confirm it, do not build one.

Runbook Phase 3 is **skipped**, deliberately. Before skipping, prove it:

```
git status --porcelain -- backend/prisma/
```

Expect exactly one entry — the untracked `backend/prisma/data-fixes/2026-08-21-normalize-product-brands.sql`. No `schema.prisma` modification, no new `migrations/` directory.

**If a migration has appeared, stop and report it.** A schema change here is a plan violation (§7 rule 11), not a release task.

`data-fixes/2026-08-21-normalize-product-brands.sql` is **committed as a record and never executed.** It is not in `backend/prisma/repair/`, not in `manifest.json`, and `RepairRegistry` will never see it. Do not bundle it, do not register it, do not compute a checksum for it, do not run it. CP-RW8B replaced it as the workflow; it stays on disk as the evidence trail for the one-time cleanup (plan §9, decision 4 — resolved as *keep*).

---

## Phase 5 — Version bump

```
npm version 2.0.0 --no-git-tag-version
```

That updates `package.json` and `package-lock.json` together. Do not hand-edit either. Do not create a tag.

The version lives in `package.json` **only** — `__APP_VERSION__` and the diagnostics `appVersion` both read from it. There is no second file.

Check `README.md` and `docs/`: correct only statements this release makes false. `README.md` carries no version string, so it likely needs nothing. **Do not create a CHANGELOG** — this repo does not keep one; the release narrative lives in the commit message.

**Gate: `git diff --stat` shows the bump and nothing unexpected.**

---

## Phase 6 — Installer

```
npm run dist:win
```

Verify and report:

- `release/2.0.0/HomeConnect-Setup-2.0.0.exe` exists.
- Its size against the 1.9.6 baseline of **117,104,529 bytes**. Within ~10% (roughly 105–129 MB) is expected. A larger swing means something was included or dropped that should not have been — investigate before continuing.
- `release/2.0.0/latest.yml` exists.
- The SHA-256 of the `.exe`.

**Never commit anything from `release/`.** It is gitignored and the `.exe` is 110+ MB.

**Gate: installer exists, size sane, hash reported.**

---

## Phase 7 — Four commits, in this order

Three unrelated bodies of work share this tree (plan §4). They get separate commits so `git log` stays readable. Stage explicitly — **never `git add -A`, never `git add .`**.

### 7.1 · Housekeeping — plan documents and `.gitignore`

```
.gitignore
claude/plans/                     (all of it: the deletions, Completed/, Prompts/, both plan docs)
```

```
chore: reorganise release planning docs and ignore database backups
```

### 7.2 · WhatsApp / customer communication

This is unrelated to the ERP work and must not ride along in the release commit:

```
desktop/src/index.ts
desktop/src/preload.ts
desktop/src/preload.test.ts
desktop/src/whatsapp-link.ts
desktop/src/whatsapp-link.test.ts
frontend/src/features/customer-communication/          (whole directory)
frontend/src/features/backup/types/backup.types.ts
frontend/src/pages/customers/CustomerProfilePage.tsx
frontend/src/pages/customers/CustomerProfilePage.communication.test.tsx
```

```
feat: send a customer a prefilled WhatsApp message from their profile
```

Write a real body describing what it does, in the repo's prose style.

**Say plainly in your report that this code is compiled into the 2.0.0 installer.** Separating the commits keeps history legible; it does not keep the feature out of the binary. Nothing about that is wrong — it just must not be described as excluded from the release.

### 7.3 · The release — RW2 through RW9, Quick Order, CP-RW8B, and the bump

Everything that remains:

```
backend/prisma/data-fixes/
backend/src/features/inventory/
backend/src/features/service/products/
frontend/src/App.tsx
frontend/src/features/inventory/
frontend/src/features/products/
frontend/src/features/sales-orders/
frontend/src/hooks/useDialogFocus.ts
frontend/src/pages/inventory/
frontend/src/pages/products/
frontend/src/pages/sales-orders/
frontend/src/pages/scanner/
frontend/src/shared/labels/business-labels.ts
package.json
package-lock.json
```

One commit, matching this repo's actual release convention — `bf43347` bundled 132 files of feature work with the version bump in a single commit. Subject line:

```
feat: release the inventory-managed ERP v2.0.0
```

The body must cover, in prose paragraphs rather than a bullet list:

- Add Product can enable stock tracking; `stockQuantity` remains structurally unreachable from create.
- Batch opening-count onboarding with a dry-run preview and one password per atomic batch; the Inventory Untracked tab is server-filtered and paginated.
- The product surface reworked — image and name open details, an overflow menu, Inventory and Make Order quick actions, and the RW9 product-page pass.
- Live barcode / SKU / model duplicate detection that self-excludes on edit.
- Brands: endpoint, combobox, near-match hint, filter dropdown, and admin brand-duplicate cleanup with a preview, a typed reason, and one audit row per affected product.
- Scanner Quick Order — a scanned product becomes an order without the six-step wizard.

And it **must** state, in its own paragraph, that this is not a breaking release:

> No schema change, no migration, no repair SQL. Upgrade is install-over-the-top from any 1.9.x. The major number marks the milestone — HomeConnect stops being a catalogue with a stock field bolted on and becomes an inventory-managed ERP — not a break in data or workflow.

Without that sentence, anyone reading `git log` will assume `2.0.0` carries a migration.

### 7.4 · Trailer

Every commit ends with the trailer this repo uses:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

**Gate: `git status` is clean except for ignored paths. `git log --oneline -4` shows the four commits in order. `git show --stat HEAD` shows the bump inside the release commit and no `release/` artefacts in any of them.**

---

## Phase 8 — Push

Show `git log --oneline -4` and the exact command, then run it:

```
git push origin main
```

Never force-push. Never push a branch other than `main`. If the push is rejected because the remote moved, **stop and report** — do not rebase, merge, or force your way past it.

---

## Phase 9 — Hand-off report

Produce the runbook's Phase 6 report, filled in for real, plus:

```
HomeConnect 2.0.0 — release ready

Installer:   release/2.0.0/HomeConnect-Setup-2.0.0.exe
SHA-256:     <hash>
Size:        <bytes>  (1.9.6 was 117,104,529 — delta <x>%)
DB repair:   none — this release carries no migration
Commits:     <4 shas, subjects>   pushed: yes
Backup file: moved to <path outside the repo>
Gates:       lint / typecheck / test / build / prisma:validate /
             check:electron-production-runtime — all passed, with real numbers
```

Then state explicitly:

1. That **no migration** was included, and that the brand `data-fixes` SQL was committed but **not** bundled, registered, or executed.
2. That the WhatsApp / customer-communication feature ships inside this binary, in its own commit.
3. That **CP-RW8D real-data QA has not been run** — it is the user's step, on a local restore, before the business PC sees this installer. Hand back the four smoke-test groups from [`real-work-cp-rw8-release-codex-prompt.md`](real-work-cp-rw8-release-codex-prompt.md) §"Release-specific smoke tests" verbatim, plus a fifth group for the work added since that file was written:

   **Scanner Quick Order** — scan a product → Quick Order opens with it prefilled at quantity 1 → submit → the order exists with the right total, and a hard reload of the prefilled URL still works.

   In the CP-RW8B group, step 3 now reads: **Apply with a typed reason of at least 5 characters; a shorter reason must refuse the preview.** Spot-check that the typed reason — not a fixed string — is what appears in the affected product's audit history.

A smoke test you did not run is reported as **not run**, never as passed.

---

## Hard rules

- **Do not touch the business database.** Local only. Do not run the brand `data-fixes` SQL anywhere.
- **Do not pop, apply, or drop `stash@{0}`.** It is a pre-existing v1.8.1 leftover, out of scope.
- **Do not `git add -A` or `git add .`** at any point. Every commit is staged by explicit path.
- **Do not commit `release/`**, the `.exe`, `latest.yml`, or the `.backup` file.
- **Do not bump before Phase 3 is green.** A version that does not build is worse than no release.
- **Do not weaken, skip, or delete a test** to clear a gate. A failing gate is the finding — report it and stop.
- **Do not add a migration.** If one becomes necessary, that is a plan violation (§7 rule 11): stop and report.
- **Do not add a password prompt to brand normalization.** §7 rule 5 — brand work is role-gated, server-audited, no password, deliberately.
- **Do not put credentials, connection strings, or `.env` contents** in a committed file, a commit message, or your report.
- After every phase, state in one or two lines what you ran, what it produced, and whether the gate passed. If a gate fails, stop there.
