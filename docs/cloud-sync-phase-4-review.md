# Phase 4 — phone database and cloud reads

Branch: `feat/phone-local-db`, with one commit per requested step. No push, APK build, OTA publish or deployment.

## Pairing

Admin Settings → Phone cloud sync now offers user/branch selection, a phone name, a one-time QR, and the paired-phone list with last seen and Revoke. These routes share the existing ADMIN protection under `/api/v1/sync/worker/devices`; the mobile LAN gateway continues denying `/api/v1/sync`. Pairing checks that the user is active and every selected branch belongs to that user's current grants.

The PC generates a device UUID and 32 random bytes encoded as a URL-safe token. Only its SHA-256 digest is registered with the relay. The plaintext token is returned once in a no-store response and held only in the panel's component state. The existing Barcode Scanner canvas QR component is reused, with an accessible label that excludes the encoded credentials. Closing the QR or waiting five minutes removes it; refreshing the device list cannot retrieve it. The relay's device metadata excludes hashes and plaintext tokens.

The QR payload is `{ v: 1, relay, deviceId, token, userId, userName, role, branchIds }`. Cloud pairing requires HTTPS; credentials in the relay URL and malformed token/UUID/branch declarations are rejected. Showing a QR does not expire the registered device after five minutes: that timer controls the display. An abandoned pairing can be revoked from the list.

The phone's existing scanner recognizes cloud JSON alongside its existing LAN codes. It stores the pairing, including a user object, in device-only SecureStore. Cloud and LAN credentials remain separate. Cloud starts as the paired identity with the user's current PC role from the QR. Only ADMIN and EMPLOYEE are accepted; older QR codes without role default to EMPLOYEE. Each sync refreshes that role from the authenticated relay device profile, and cached user records cannot overwrite it. `pairedUser` contains the explicit Phase 7 PIN/biometric hook; no password database or PIN flow was added.

Sign out in cloud mode removes the credential, stops outstanding sync work, clears records/staging/state and the query cache, and returns to Connect. Device revocation does the same and shows **“This phone was removed by the shop.”** A generation guard also prevents an asynchronous database bootstrap from repopulating an unpaired cache. The local database is bound to its device ID so a different pairing cannot inherit another phone's cached data.

## Local database

`src/offline/local-db.ts` defines exec/query/transaction. Production uses Expo SDK 54's compatible expo-sqlite package, WAL, parameter binding and exclusive write transactions. Tests use the same SQL with a sql.js in-memory implementation; sql.js is a dev dependency and is never imported by production.

Schema version 1 is recorded in `PRAGMA user_version`; a newer database version is refused rather than reset. Tables:

| Table | Contents |
| --- | --- |
| records | `(entity,id)` primary key; nullable branch_id; exact decimal-text rev; PC JSON in data; extracted name/code/phone search columns. |
| staging_records | A fresh working copy with the same record columns, invisible to screen reads until publication. |
| sync_state | Cursor, snapshotHorizon, lastSyncAt, fullCopyInProgress, and the owning deviceId. |

Indexes cover `(entity,name)`, `(entity,code)` and `(entity,phone)`. Product code includes SKU and barcode. SQL filters/search and branch predicates run before results are mapped back to the existing API shapes. Category filtering includes descendants. No phone totals or balances are derived. Sorting existing positive decimal balances compares their text digits without converting money to floating point.

More → Settings shows allocated SQLite page size, last sync/error, and **Re-download all data**. That action requests a full copy while keeping the current data readable. The size includes reusable allocated database pages; it is not a measurement of transient WAL files. After successful sync, orders strictly older than the ninety-day UTC date cutoff are pruned; the boundary date is retained. Other entities and their PC money values are untouched.

## Sync protocol and lifecycle

Sync runs after pairing, at app start/foreground, every fifteen minutes while active, and on pull-to-refresh. The header puts sync time/spinner below the branch selector and offers retry. Concurrent triggers join one flight. Opening and refreshing the cached read source happens before contacting the relay, so a sleeping Render instance or a missing internet connection cannot delay access to saved records.

Each sync first calls GET `/relay/v1/device/me` once, then GET `/relay/v1/device/records` pages with limit 500. Both use the device Bearer credential in a header. Redirects are rejected; raw errors and tokens are never logged or shown. The first request in a sync gets 75 seconds, later requests 20 seconds, including response consumption.

With no cursor, an interrupted copy, a forced re-download, or HTTP 410, the engine starts at `after=0&fullCopy=true`. Subsequent pages carry both fullCopy and snapshotHorizon. Pages go into staging while screens continue querying records. A changed horizon/410 clears staging and restarts at zero. Repeated changes are bounded; a failed attempt leaves the previous complete cache and cursor intact. A later sync starts that incomplete copy again.

Publication copies the fresh staging set into records and replaces the cursor in one SQLite transaction. This is an atomic replacement, including the empty-copy case. Incremental pages omit fullCopy, apply upserts and deletes, and save nextRev in the same transaction. Synthetic branch-move deletes therefore remove the record at its new revision. Cursors/revisions remain strings, including values above JavaScript's safe integer range. A 401 wipes data and invokes session teardown; teardown still runs if local wiping reports an I/O failure, and another pairing must successfully wipe before it can start.

## Read coverage and disabled flows

The existing API entry points use a cloud data source before any PC HTTP/auth recovery. LAN mode retains the current HTTP behavior.

| Screen/read | Cloud source |
| --- | --- |
| Product list, filters, detail, scanner, price check | Product JSON and its PC inventory projection. Exact barcode wins over SKU; leading zeros are preserved. The scanner normalization helper is shared with the PC. |
| Customers and customer detail | Customer JSON with its PC financial projection. |
| Customer financial summary | The existing PC financial-summary service response stored as financialSummary; debts, plans and summary amounts pass through unchanged. |
| Receivables | Each customer's PC standing, outstanding, overdue, due date and last-payment fields. The totals card is hidden; summary is explicitly null. |
| Orders list/detail | Stored sales-order JSON, filtered by the local ninety-day retention rule. |
| Suppliers list/detail | Supplier JSON including the PC's balance and summary. |
| Bills inbox and supplier bills | Unlinked bill-group/page metadata. Images say **“Photo available on the shop Wi-Fi”** and perform no image request. |
| Branch/category filters | Local branch/category records. Branch selection never widens the device's paired scope. |

Customer financial detail and inventory detail were absent from the earlier feed. The feed now adds the existing PC service projections without replacing earlier fields. The follow-up `20261116100000_sync_phone_read_projections` migration requests a staged worker snapshot to backfill existing relay data automatically; previous migrations remain unchanged. The worker splits large record batches by encoded byte size so count-bounded pages containing financial detail fit the relay's JSON limit. It acknowledges the local cursor only after all parts succeed.

Inventory detail contains the PC inventory endpoint's ten recent movements; it is not a complete offline stock ledger. Financial detail uses that endpoint's existing bounded debt/plan/payment defaults, while the PC still computes its summary from the complete account. Only unlinked supplier bills are in this phase's cache.

New orders/customers, payments, supplier payments, bill capture/link/edit/delete, stock count/receive/adjust and prepaid creation are disabled in cloud mode with **“Coming soon over the cloud. Use the shop Wi-Fi”**. Route guards prevent the underlying write/camera screens from mounting, and the data-source boundary rejects non-GET requests before networking. Existing LAN bill queues are not flushed in cloud mode. Direct scanner “Add to order” is also disabled. AppButton, QuickAction tiles and ListRow write shortcuts use an explicit cloudWrite flag. Labels never determine whether an action is a write; flagged controls show the note, while unflagged controls with the same wording stay enabled. The route guards remain the protection against entering cloud write flows.

Home/report totals, statements, supplier purchase history and prepaid history have no pushed snapshot in this phase. They show a Wi-Fi-only state rather than making PC requests or fabricating totals. Product photos also remain placeholders. Phase 5 enables cloud writes; Phase 6 supplies report/Home snapshots.

## Validation and review limits

Targeted checks passed:

- Phone: `npx vitest run src/offline src/api/lookup-api.test.ts` — 75 tests, including the existing LAN contracts and a shared LAN/cloud financial fixture; `npx tsc --noEmit` clean.
- PC: the touched sync-feed, relay-client, device/settings-route and Settings-page tests — 37 tests passed.
- PC database: all 9 cases in sync-db.integration.test.ts passed with RUN_SYNC_DB_TESTS on a newly migrated `_test` database, then that database was removed. This includes matching the expanded inventory projection to the PC endpoint.
- `npm run typecheck:backend` and `npm run typecheck:frontend` clean.

Tests cover atomic full-copy/re-download visibility, horizon restart, exact cursor persistence and rollback, branch-move deletes, 410 recovery, revocation wipe, concurrent sync and late-response cancellation, retention boundaries, SecureStore persistence, read-shape/money pass-through, branch isolation, hash-only registration, admin authorization and QR accessibility redaction. No full suite was run.

Native SQLite/camera behavior still needs device smoke testing when the later APK is built; this phase validates the adapter types and shared SQL on Windows through sql.js. The retention clock uses the phone's UTC date, so an incorrect device clock affects pruning. Role and branch changes made by re-registering a device are refreshed at its next sync. New branch grants trigger a full copy, and removed branches are immediately excluded from the local read source. No live relay was contacted with real device credentials, and no APK was built.


## Phase 4 review fixes

The new additive relay migration `20261116110000_relay_device_role` adds `relay_devices.role text NOT NULL DEFAULT 'EMPLOYEE'` with an ADMIN/EMPLOYEE check. Earlier migrations are unchanged. Both new PC pairing and relay device registration carry the current role, and the device list returns it. Older registrations default to EMPLOYEE. Re-registration updates the stored role and branch list without reviving a revoked device.

GET `/relay/v1/device/me` is device-authenticated and returns only `{ deviceId, userId, userName, role, branchIds }`, with no token/hash. The engine calls it once before records on every sync; 401 follows the same wipe and unpair path as a records rejection. Changed profile fields update SecureStore and the live session. This updates menus without restarting or overlapping the active sync. Unpair cleanup joins pending profile saves before deleting the credential, preventing a late SecureStore write from restoring a signed-out pairing. Cached PC user JSON cannot restore an outdated role. An empty branch grant is also retained safely and leaves the phone at branch selection rather than restoring its previous scope.

Branch changes mark fullCopyInProgress before persisting the new pairing, so a crash cannot skip unchanged records in a newly granted branch. The read source and query cache switch to the new scope before the copy proceeds. A user reassignment also clears the prior user's cache. A role-only change updates menus without changing the record filtering in this phase. The phone role controls screen visibility; Phase 3 still reloads the user's real current PC role and applies the PC API's rules for every action.

Write entry points were audited by their destinations and submit/capture handlers. Explicit flags cover Home/Customers tiles, stock and supplier shortcuts, customer/prepaid creation, order/payment submission, stock correction/receiving/count submission, scanner order entry, bill capture/upload/link/edit/delete and pending-upload retries. Route-level CloudWriteGuard behavior is unchanged.

Review validation: 45 targeted phone/component tests and 44 touched PC/relay route tests passed. All 18 cases in the touched relay database test passed against a newly migrated `_test` database, which was removed afterwards. Relay client generation, relay/backend typechecks and the phone TypeScript check passed. Component regressions verify flagged writes are disabled with the note, an identical unflagged label stays enabled, and LAN controls stay enabled. No full suite, push or APK build.

### FOLLOW-UP — Phase 6, outside this fix

Employee phones currently receive the same records as admin phones for their branches. Phase 6 must filter admin-only data per device role on the relay, including report snapshots and supplier money where the PC restricts it. Hidden menus are not data filtering. This review fix adds role propagation and presentation behavior only; it does not implement those Phase 6 record filters.
