# Phase 3D handoff — 2026-10-28

Implemented on feature/multi-branch-phase-3 in D:/User/Documents/HomeConnect-mb-phase3. Final merge gate passed. No push, merge, migration change or Phase 4 implementation.

## 1. Commits

Implementation commits are below. The final evidence commit hash is supplied in the handoff response.

```
b299de0 feat(scanner): forward mobile JWT requests with branch scope
a8cdb71 feat(mobile): select and persist an accessible branch
27696a5 feat(branches): complete API coverage and scope product service jobs
a41dc5b docs(releases): describe Phase 3 scoping and reporting corrections
f84d5c4 feat(documents): show record branch only for multi-branch shops
3536071 fix(mobile): preserve global scans and verify secure branch cleanup
0626b8e test(branches): update debt transaction and mobile storage fixtures
f957917 test: preload SVG sanitizer and complete branch audit fixture
5c45876 test: preload real sanitizer before service and safety assertions
e4edde1 fix(mobile): require a branch choice after access denial
```

## 2. Merge-sensitive files

| File | Added | Removed |
|---|---:|---:|
| `Mobile Scanner/App.tsx` | 2 | 2 |
| `Mobile Scanner/src/api/hc-client.ts` | 5 | 1 |
| `Mobile Scanner/src/storage/secure-storage.ts` | 2 | 1 |
| `backend/src/features/scanner/lan-listener.ts` | 5 | 4 |
| `frontend/src/features/documents/components/__snapshots__/MultiBranchDocuments.test.tsx.snap` | 9 | 0 |

The new MultiBranchDocuments snapshot is listed because it matches the protected directory pattern. All four existing document snapshots are byte-identical to baseline 50cb896; their SHA-256 evidence is in snapshot-integrity.json. Other files from the merge-friendliness list were untouched. Test-generated line-ending rewrites in unrelated snapshots were discarded from this worktree.

## 3. Mobile

After JWT login or session restoration, load /branches/accessible. One branch auto-selects. Several show a picker; a saved selection is restored only if still accessible. The home header always shows the selected branch name and a switch button. Zero branches shows the requested assignment message, disables supplier actions, and keeps global product scans available.

Branch IDs use device-only Expo SecureStore. Logout/session invalidation clears the selection. Every hc-client request and raw supplier receipt upload sends X-Branch-Scope. A matching 403 BRANCH_ACCESS_DENIED clears the stored/current selection, immediately unmounts supplier forms, reloads access, and requires an explicit choice even if one branch remains. Late denials from an old selection do not clear a newer selection.

New files: Mobile Scanner/src/branches/{BranchScannerScreen.tsx, BranchPickerScreen.tsx, branch-selection.ts, branch-storage.ts, branch-selection.test.ts, branch-storage.test.ts}. Existing Node Vitest setup reused; no version bump or APK.

Mobile API/logic/storage validation: initial 6 files / 21 passed / 0 failed / 0 skipped; changed selection file then 8 passed / 0 failed / 0 skipped, including the new denial rule. Latest per-file coverage totals 22 tests across 6 files. Typecheck and changed-file lint pass. Native screens were not tested in a UI runner.

## 4. Scanner routes

All scanner pairing sessions remain global product/device state. The JWT supplier gateway uses its destination API scope, not x-scanner-session credentials.

| Route | Why global |
|---|---|
| `POST /api/v1/scanner/pairing-code` | Creates a product-scanner pairing code; no branch-owned data. |
| `POST /api/v1/scanner/lan/enable` | Enables the global product-scanner listener. |
| `POST /api/v1/scanner/lan/disable` | Disables the global scanner listener and sessions. |
| `GET /api/v1/scanner/lan-status` | Reports global listener availability. |
| `GET /api/v1/scanner/sessions` | Lists product-scanner device sessions only. |
| `POST /api/v1/scanner/sessions/:sessionId/revoke` | Revokes a global product-scanner device session. |
| `GET /api/v1/scanner/events/recent` | Reads product code scan events only. |
| `POST /api/v1/scanner/events` | Records a global product code scan only (desktop or paired phone). |
| `POST /api/v1/scanner/pair` | Pairs a product scanner; session token cannot authorize supplier APIs. |
| `GET /api/v1/scanner/session` | Reports product-scanner session expiry/device label only. |

Gateway tests prove GET /api/v1/branches/accessible is allowed, scope headers are forwarded unchanged, raw bytes/JSON survive, desktop denial status survives, cookies/scanner credentials are not forwarded, and unlisted methods/paths are refused. The approved worktree lacked the gateway referenced by the plan; its exact mobile allow-list was implemented in a new module with minimal listener wiring.

## 5. Documents

Document data endpoints now add branch: {name, address, phone} and showBranchLine, derived from the record branch and the count of all active branches:

- GET /sales-orders/:salesOrderId (invoice data; existing shared detail endpoint)
- GET /payments/:paymentId/receipt
- GET /sales-returns/:salesReturnId
- GET /customers/:customerId/statement (customer branch)

List/create responses were not expanded. Existing scope/parent guards remain in place. A shared presentation-only DocumentBranchLine renders supplied metadata below the shop header when showBranchLine is true, omitting empty contact parts. Components make no queries. One active branch renders exactly as before. Nine backend metadata checks and six new rendering checks pass. Four new snapshots live only in MultiBranchDocuments.test.tsx.snap; all four existing snapshots remain byte-identical.

## 6. Complete route classification

Actual Express router walk: 286 main routes = 154 scoped + 132 global; all three LAN scanner registrations are separately global. Full method/path allow-list and reasons: route-classification.md and route-inventory.json.

Scoped prefixes:

- `/api/v1/customers`
- `/api/v1/suppliers`
- `/api/v1/debts`
- `/api/v1/installment-plans`
- `/api/v1/payments`
- `/api/v1/financial-ledger`
- `/api/v1/receivables`
- `/api/v1/prepaid-purchases`
- `/api/v1/corrections`
- `/api/v1/sales-orders`
- `/api/v1/sales-returns`
- `/api/v1/service-jobs`
- `/api/v1/supplier-transactions`
- `/api/v1/supplier-purchases`
- `/api/v1/supplier-ledger`
- `/api/v1/inventory/receivings`
- `/api/v1/reports`
- `/api/v1/dashboard`
- `/api/v1/products/:productId/service-jobs`

Global groups and reasons (every route within these groups is individually pinned in the registry):

- `health`: Process and database health, with no branch-owned records.
- `auth`: Identity and JWT session lifecycle are global.
- `users`: User administration is global; branch grants are managed separately.
- `branches`: Branch catalog and access administration define the accessible set.
- `admin/exchange-rates`: Global FX configuration; stored transaction conversion amounts are unchanged.
- `products`: Shared product catalog, stock and pricing under D3.
- `categories`: Shared product categories under D3.
- `inventory`: Shared stock counts, onboarding and movements under D3; receivings are scoped.
- `pricing-presets`: Shared pricing configuration.
- `pricing`: Global product pricing calculator.
- `shop-profile`: Global shop presentation settings.
- `brand-logos`: Shared catalog artwork.
- `pricing-card-feature-icons`: Shared product artwork.
- `pricing-card-templates`: Shared product print templates.
- `pricing-card-prints`: Global product print snapshots.
- `admin/backups`: Whole-database administration and restore.
- `admin/diagnostics`: Global operational diagnostics.
- `admin/preflight`: Whole-installation readiness checks.
- `admin/maintenance`: Whole-database migration maintenance.
- `system`: Desktop process status.
- `business-settings`: Singleton shop/document settings.
- `scanner`: Global product-scanner sessions only; JWT supplier gateway requests use their destination scope.

The exception to the expected global products group is GET /products/:productId/service-jobs: it returns branch-owned service jobs. It now uses the existing branch middleware and required BranchScope query predicate for rows and count. A newly registered route outside these explicit classifications fails the gate; global route additions also require exact method/path entries.

## 7. Validation

Exact commands and environment handling are in commands.txt. Credentials were never printed or committed. All DB commands checked their resolved target; the live homeconnect database was never accessed.

| Check | Passed | Failed | Skipped |
|---|---:|---:|---:|
| Initial targeted run, 24 files | 211 | 0 | 0 |
| Mobile API/logic/storage, 6 files | 21 | 0 | 0 |
| Updated mobile selection file | 8 | 0 | 0 |
| First full test:ci, 409 files | 3311 | 4 | 0 |
| Failure-only retry 1 (debt + seed) | 9 | 1 | 0 |
| Failure-only retry 2 (seed) | 2 | 0 | 0 |
| Failure-only retry 3 (CSP + credit limit) | 21 | 0 | 0 |
| Permitted full rerun, 409 files | 3314 | 1 | 0 |
| Failure-only retry 4 (icon service) | 1 | 0 | 0 |
| Owner-approved additional final test:ci, 409 files | 3315 | 0 | 0 |

Three full runs total; the owner explicitly approved the additional final run after the second encountered another cold jsdom load timeout. No further full-suite runs were performed. The final test:ci also passed scripts/assert-zero-skips.mjs.

First-run fixes preserved all assertions: debt route mock now executes its transaction/activity log; credit-limit transaction mock supplies the customer branch; the CI launcher explicitly sets NODE_ENV=test instead of inheriting developer mode; SVG tests preload the real sanitizer during collection. No timeout increases, mocks of sanitization, CSP behavior changes, money formula changes or balance algorithm changes.

Root npm run typecheck and mobile npm run typecheck pass. ESLint covers 44 distinct changed TS/TSX files: zero errors, zero warnings. Graphify query documentBranch and final graphify update . completed.

Rehearsal: npm run rehearse:migrations -- --confirm-scratch passed on newly created homeconnect_test_mb_phase3d_20261028_1012, including interrupted-migration detection. The owned scratch DB was dropped. The existing shared test database remains homeconnect_test_phase4_phase5_phase6. DATABASE_URL was explicitly passed from ignored worktree backend/.env to the guarded child process, with NODE_ENV=test for CI and all nine DB suite flags enabled by test:ci.

Migration SHA-256: `776a8bb45e18c487cf8841c4f53416f7faba327c44e43e67e42327e98ca55ee5`. No migration file changed.

## 8. Plan decisions, assumptions and Phase 4 items

- D2 supersedes the old pairing-bound branch wording: product scan sessions are global; mobile JWT supplier actions select a branch. Plan wording was corrected.
- The product service-job history route is the one branch-owned exception found inside the expected global product group; it is now scoped and documented.
- The gateway referenced by the plan was absent from the approved worktree; it was implemented locally without copying main-checkout files. Its new module may need normal add/add conflict resolution against the owner's uncommitted gateway when merging.
- MULTI_BRANCH_SCOPING_ENABLED must stay OFF in production until Phase 4 ships the desktop selector. Phase 4 still owns API headers/query-key scoping, branch badges/columns, and write UX in All branches.
- The per-branch phone unique database index remains deferred by the approved no-migration decision; application checks remain in place.
- Mobile native screen/device verification remains a release task. No mobile app version change or APK build was performed.
- Release notes explicitly disclose corrected stored-USD supplier totals and the restored legacy dashboard summary. No production data, backups or business database were requested or read.

No push, merge or Phase 4 work.
