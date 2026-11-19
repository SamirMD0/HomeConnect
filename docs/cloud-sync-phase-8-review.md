# Phase 8: end-to-end verification and release preparation

Branch: `feat/cloud-release-prep`, from `main` with Phases 1–7 merged. This prepares a release; it does not deploy, push, tag, build an APK or enable a real shop's worker. The [existing deferred fix list](../.claude/mobile-erp-plan/CLOUD-SYNC-FIXLIST.md) is unchanged and remains Claude's work.

## Harness and database safety

`backend/src/features/sync/cloud-e2e.integration.test.ts` has eight sequential scenarios. It skips without `RUN_CLOUD_E2E=1`; with that flag it **refuses** unless both PC and relay URLs name isolated test/CI databases. Separate guard tests cover missing/unsafe URLs. `test:ci` now enables the flag alongside the existing DB suites; the full suite was not run during this phase.

The suite creates its own two random `cloud_e2e_*_test` databases using the supplied test-server credentials and applies the complete PC and relay migration histories. This needs database-creation permission, supplied by the CI PostgreSQL service. A dedicated Prisma instance replaces any previous suite's cached global client; `current_database()` is checked against the private database before seeding and again before truncation. Thus the restore scenario cannot reset CI's shared fixture database. Cleanup closes HTTP listeners/clients, restores environment/global state, and removes both private databases. The local launcher also used fresh `_test` base databases and removed them afterwards.

The real PC and relay Express apps listen on free loopback ports. The real scheduler, encrypted worker settings, device-pairing routes, PC authentication/permissions, financial endpoints, change feed, action journal and relay store are used. A narrow test transport maps the synthetic HTTPS relay origin to the local HTTP listener; production HTTPS requirements stay intact. This is not a TLS/deployment test.

The simulated phone imports the real `SyncEngine`, outbox, sender and record-store modules from Mobile Scanner. The existing sql.js LocalDb supplies real SQLite transactions. Only photo-file IO is an in-memory adapter, passed through a new optional `SyncEngine.files` seam; production defaults are unchanged. No financial, stock or report calculations are mocked. Fixtures include an administrator, employee, one branch, product, customer/debt, supplier and an effective default VAT profile.

## Scenario results

All **8/8 passed** on 2026-11-17.

| Scenario | Final checks |
| --- | --- |
| 1. Pair/full copy | Real PC pairing registers the device; the worker publishes catalog/customer financialSummary/supplier data and Home, receivables and report snapshots; the phone has the complete copy. |
| 2. PC edits/delta | Product price becomes 25.00. A PC customer payment produces the same full financial-summary object on the phone as the HTTP endpoint, including byte-equal outstanding amount text (90.00). JSONB object key ordering is immaterial; no amount is recomputed. |
| 3. Offline actions/replays | While transport is unreachable, four actions remain queued and absent from the relay. Reconnection sends payment, supplier payment, order and PNG bill. Each action POST is repeated and every real claim applied twice. PC/journal/relay have one successful operation per ID; the phone shows applied/Done and its payment result includes the receipt. Stored PC photo bytes equal the captured bytes. |
| 4. Exact refusal | A real employee requests an admin report. PC, journal, relay and phone retain the exact code/message from a direct call to the same PC endpoint. |
| 5. Role filtering | Staff wire responses contain no ADMIN upsert data, and the local DB has no reports/users. Downgrading the previously admin device removes its cached ADMIN records on the next profile refresh/copy. |
| 6. Revoke | PC Revoke is followed by the phone's normal sync. Records, staging and cursor state are wiped; queued work is not applied, and its redacted unsent summary remains. Relay revocation is persistent. |
| 7. Restore | Truncate/reseed the private PC database as restored contents, yielding a lower cursor. Worker snapshot replacement tombstones ghosts. Every primary phone record equals the restored PC projection, and all phone data equals the relay's live records. |
| 8. Relay interruption | Destroy the socket/listener after the relay commits a worker write but before acknowledgement. The PC cursor stays unchanged. Construct a fresh relay app against the same DB and retry; the cursor advances and PC/relay/phone agree without lost or duplicated records. |

Restore uses a test-helper truncate/reseed of completed backup contents, not the backup-file import UI or an actual pg_restore process. Interruption restarts the in-process relay HTTP app and its volatile middleware, not the whole test machine.

## Measured relay traffic

The final local run printed these measurements and saved its artifact at `node_modules/.cache/home-connect/cloud-e2e-metrics.json`. Values are measured, not assertions. They count all worker/phone requests to the relay and application body bytes, including the failed acknowledgement attempt; PC loopback traffic and HTTP/TLS headers are excluded. A per-scenario test clock advances rate-limit windows without sleeping. This is a small single-branch fixture, not a shop-sized load or measured Neon CU usage.

| Scenario | Relay requests | Bytes into relay | Bytes out of relay |
| --- | ---: | ---: | ---: |
| 1. Pair/full copy | 77 | 63,817 | 65,693 |
| 2. Price/payment delta | 4 | 3,744 | 4,099 |
| 3. Offline actions/replays | 27 | 15,764 | 20,146 |
| 4. Exact refusal | 15 | 641 | 34,467 |
| 5. Staff/downgrade | 5 | 0 | 32,593 |
| 6. Revoke | 2 | 2 | 137 |
| 7. Restore/replacement | 85 | 65,364 | 136,918 |
| 8. Lost acknowledgement/restart | 5 | 2,978 | 1,788 |
| **Total** | **220** | **152,310** | **295,841** |

Initial and replacement copies include the 58 figure records per branch. Real catalogs, reports, photo counts, sleeping-service delays and polling patterns will change traffic. Actual first-week compute/storage/transfer must be read from the Neon dashboard; no provider budget or new polling cadence is inferred from these bytes.

## New findings, separate from the existing fix list

1. **Staff report refusals were overwritten and pending requests finalized early. Fixed here.** The relay used a generic refusal for every employee report result, even pending ones; the phone then stopped polling before the PC's exact refusal arrived. It now preserves nonfinal status with null result, and returns only the PC's refused `code`/`message`. Applied admin report data remains redacted. Device/user filtering and branch denial still take priority. A regression test deliberately includes extra secret report fields in a refusal and verifies they are stripped.
2. **Pooled Neon setup needs a migration connection path. Addressed here.** The requested pooled runtime string must not require an operator command to migrate. `scripts/relay-migrate.mjs` maps standard Neon `-pooler` hostnames to their matching direct endpoint only for the Prisma CLI subprocess, preserving TLS/credentials and leaving runtime/non-Neon settings alone. URL tests and a complete fresh local relay migration validate the wrapper; an actual Neon deployment remains untested. [Neon Prisma guidance](https://neon.com/docs/guides/prisma)
3. **First-install order depended on the new PC secret button. Resolved with the user's approved order.** Install PC 2.4.0 with cloud sync disabled first, create the secret in Settings, deploy/migrate the relay, then enable the PC and finally install the APK. A separate preparation installation is not required. The relay must be healthy before the new phone's heartbeat or any cloud use.
4. **The disable switch pauses the PC worker, not all cloud traffic. Documented, runtime unchanged.** In-flight actions can finish, and phones can retain cached records/contact the relay after the PC switch is off. The rollback checklist therefore switches phones to shop-Wi-Fi mode for new work and prohibits recreating waiting/uncertain cloud actions until reconciled; Revoke is the existing way to remove device access. It does not promise an immediate remote wipe or zero relay traffic from disabling the PC alone.
5. **Windows DOM test initialization could exceed the worker startup timeout. Fixed in the new test.** The PC secret interaction test now loads its DOM and React client in `beforeAll` with a local 120-second setup budget, then closes the window/restores globals. It exercises the same clicks and assertions without changing global Vitest timeouts. The combined five-file targeted run passed using the default worker pool after this change. The e2e teardown also has a local 120-second budget. Three inactive disposable databases left by earlier timed-out development runs were removed explicitly; a final catalog check found no Phase 8 test databases remaining.

No deferred phone polling, worker cadence, usage-estimate panel, Phase 6 estimate or PIN-performance implementation was changed. The setup guide explicitly includes the requested fixed 0.25 CU/five-minute Neon settings, but no real compute setting was changed and the deferred list was not marked complete.

## Release deliverables and validation

- PC/package lock: **2.4.0**. Phone app/package lock: **2.3.0**, Android **versionCode 13**. Phone `REQUIRED_API_VERSION`: **2.4.0**, with compatibility tests updated; older PCs still follow the existing LAN warning behavior.
- [Click-only setup](setup/CLOUD_RELAY_SETUP.md), [desktop release notes](releases/2.4.0.md), and [cloud phone release/rollback checklist](mobile/release-checklist.md#cloud-release-230-with-pc-240) are prepared. Every new PC sync migration and all six relay migrations are listed. Earlier migrations were not edited.
- **End-to-end:** 8 scenarios passed with `RUN_CLOUD_E2E=1`; all disposable databases removed. The migration wrapper also applied all six relay migrations to a fresh relay `_test` database.
- **Targeted root tests:** guard, worker settings/secret API, relay visibility, migration URL and PC secret UI — 23 tests. **Phone:** sync-engine and compatibility files — 22 tests. Database-name guards are included in the 23, not counted again from the e2e command.
- `npm run typecheck:backend`, `npm run typecheck:frontend`, `npm run relay:typecheck` and phone `npx tsc --noEmit` all passed. Structural graph refresh uses AST extraction only, without semantic/API calls.

No full suite, root npm test, test:ci, whole-app Vitest, real deployment, tag, push or APK build was performed. Claude's full-suite/deferred-fix review, actual Render/Neon rollout, first-week provider measurements, and the existing real-device SQLCipher/PIN/biometric/recents/share smoke checks remain release gates. The Node harness cannot validate native key storage, biometric hardware, APK upgrade behavior, WhatsApp/printing or mid-range Android PIN timing.
