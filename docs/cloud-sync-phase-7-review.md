# Phase 7: phone PIN lock and encrypted cloud storage

Implemented on `feat/phone-pin-lock`, starting from merged Phases 1–6 on `main`. LAN username/password sign-in stays on its existing path. The items in `CLOUD-SYNC-FIXLIST.md`, including polling intervals, worker scheduling and provider usage estimates, are unchanged. No APK was built, deployment performed or branch pushed.

## PIN and biometrics

Cloud pairing and existing cloud pairings without a PIN enter mandatory PIN setup before any data screen mounts. Setup requires matching 4–6 ASCII digits. `@noble/hashes` 1.8.0 derives a 32-byte PBKDF2-SHA256 hash with **150,000 iterations**, a fresh **16-byte random salt**, and asynchronous work slices (`asyncTick: 8`). Hash comparison checks all bytes. The PIN exists only in the input/check's memory; it is never saved, logged or sent to the PC/relay.

SecureStore holds the salt, hash, iterations, failedCount and lockedUntil, plus the device/user owner, biometric preference, timer and last successful unlock timestamp. Writes are serialized and read back before success. Pairing changes/wipes stop the old controller and join pending credential writes so an old write cannot resurrect security settings after removal. SecureStore uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; Android protection uses Expo SecureStore's Keystore-backed encryption.

Fingerprint/face unlock is offered after setup when hardware and enrollment are present. It requires strong enrolled biometrics, with OS device-passcode fallback disabled. Cancellation leaves the PIN available. More → Phone lock offers change PIN (current PIN required), biometric on/off, 1/5/15-minute timer, and Lock now.

**Benchmark, 2026-11-17:** the same noble PBKDF2 parameters, one warm-up then three measured checks, Node v22.13.1 on an Intel i5-1135G7 host: **373.4 / 383.5 / 288.5 ms** (median 373.4 ms). This is a host measurement, not an Android benchmark or a promise about Hermes performance. No Android device/ADB was available. The requested mid-range Android ≤400 ms check remains pending for the next native build; iterations were not reduced. The unit test also compares the real JS derivation with Node's PBKDF2 implementation.

## Locking and recovery

- Every cold start with an existing PIN starts locked. Returning after at least the configured background interval locks; default is five minutes. Shorter absences preserve the unlocked session. Pending PIN/biometric checks cannot override a later manual lock or expired background timer.
- Content hides immediately on inactive/background. Native screen-capture protection is requested for cloud sessions; iOS app-switcher protection is also requested. During a short camera/gallery round trip, the data tree may remain mounted with `display: none` only after native preview protection succeeds. If protection is unavailable, background content unmounts. On an actual lock, navigation, data screens, update banners and the portal host always unmount; only generic lock UI is rendered.
- `CloudSyncRuntime` stays outside the gate, so sync and outbox sending continue while the app is PIN-locked within their existing lifecycle. OS background suspension and the existing foreground polling cadence are unchanged. Locked UI contains no shop amounts and this phase adds no notifications.
- Wrong PIN counts and deadlines survive restarts. Attempts 1–4 have no delay; attempt 5 waits 30 seconds, then 60/120/240/480 seconds for attempts 6–9. The delay formula caps at 15 minutes. Attempt 10 wipes immediately. A successful PIN or biometric unlock resets the failure sequence. PIN changes use the same failure counter for incorrect current PINs.
- The tenth failure uses the revoke/unpair wipe and shows exactly: **“Too many wrong PINs. Pair this phone again from the shop PC.”** Forgot PIN counts unfinished actions and requires confirmation explaining that unsent actions/photos cannot be sent after reset and that summaries are retained; users should check the PC before entering work again.

Before deleting data, non-dismissed, non-applied action summaries are saved in a separate paged SecureStore archive. Pages are written and verified before atomically publishing their manifest. It retains only action ID, type, summary and creation time, never payloads, results or photo bytes. If archival fails, the encrypted DB/key are retained instead of losing actions. Unpaired setup shows only the retained count; summary text becomes visible in Waiting after a new authorized pairing and PIN setup. The archive remains encrypted by SecureStore independently of the deleted database key. Archive entries cannot be resent and can be dismissed.

## SQLCipher and migration

`app.json` enables the expo-sqlite config plugin's `useSQLCipher: true`; it also configures the native Face ID permission. The random **32-byte database key** is generated once, stored/read back in SecureStore before opening the file, and never transmitted. Opening checks `PRAGMA cipher_version`, sets the hex key and verifies a read before schema access. An old native binary without SQLCipher fails closed rather than silently creating a plain database. A missing key for an existing encrypted file also fails closed without overwriting that file.

The encrypted `home-connect-cloud-secure.db` contains records, staging records, sync state, outbox payloads/results, saved cloud sales drafts and queued photo BLOBs (schema v4). Cloud bill photos are inserted in the same transaction as their action. An action-save failure rolls back its photo and retains the scratch source for retry. Applied/refused cleanup removes the BLOB; queued/failed actions retain it. LAN draft files and the LAN receipt queue keep their existing storage behavior.

The installed expo-sqlite version opens a separate connection for `withExclusiveTransactionAsync`. To avoid an unkeyed transaction connection, the adapter serializes all reads, writes and `BEGIN IMMEDIATE`/commit/rollback on the original keyed connection. SQLCipher is used with WAL and `synchronous=FULL`; the key protects persisted database/WAL contents, not just selected fields.

First-open migration:

1. Initialize the encrypted schema with transactional version upgrades. Read all outbox rows and sync state from `home-connect-cloud.db`, then close the plain connection.
2. In one encrypted transaction, copy outbox IDs, submission keys, statuses, payloads and other columns; import their existing photo files as BLOBs and replace paths with `cipher-photo:<id>`. Import legacy cloud draft slots too. Verify copied actions, preserve identity/profile state, omit old cursor/snapshot timestamps, and set `fullCopyInProgress=true` plus the migration-complete/cleanup markers.
3. Only after that commit, delete legacy photos/draft files and the plain DB, including leftover WAL/SHM/journal files. Record caches are re-downloaded through the existing full-copy protocol.
4. A crash before commit rolls back the target while leaving the plain source intact. A crash after commit resumes cleanup from the marker and does not re-import stale action statuses. Missing/unreadable source photos or copy errors preserve the source and block opening rather than silently dropping saved work.

Revoke, unpair and PIN reset stop/join the controller, queued saves and sync before archiving summaries, closing/deleting the encrypted DB and sidecars, and removing its key and PIN record. Deletion tolerates already-absent files. Native camera/picker/decoder scratch caches are cleared on cold/locked states and wipe, and a successfully queued photo's app-cache source is removed. Native capture and explicit PDF/share exports necessarily use temporary OS/app-private files; they are not SQLCipher files, and a gallery original belongs to the user's photo library. The feature encrypts durable cloud application data, not the user's gallery or another app's shared exports.

## PC status

New additive relay migration: `20261117140000_relay_device_security_status`. It adds `relay_devices.pin_set boolean NOT NULL DEFAULT false` and nullable `last_unlock_at`. Earlier migrations are unchanged.

Each existing sync, after `/device/me` refresh and before outbox/record traffic, sends device-authenticated `POST /relay/v1/device/status` with exactly `{ pinSet, lastUnlockAt }`. The schema is strict: unknown keys (including PIN/hash/salt/iterations) return 400. Worker device registration is also strict. Authentication selects the device; the body cannot select another user/device. Revoked devices cannot update. Status fields are included in the worker's device list and displayed as **PIN set: Yes/No** and **Last unlock** (or Never) in PC Settings → Phone cloud sync → Paired phones.

These are self-reported display fields, not authorization evidence. Last unlock reaches the PC on the next ordinary sync, not a new polling loop. Existing PC action authorization still reloads the actual current user. Relay schema/API should be deployed before the next native app, otherwise the new heartbeat will fail and sync will retry.

## Validation and remaining native checks

- Phone: `npx vitest run src/offline src/security src/session src/sales/sales.test.ts src/sales/draft-files.test.ts` — **24 files, 133 tests passed**. Covers PIN hashing, persisted backoff, cold/timed lock, stale unlock rejection, biometrics/fallback, data-tree gating, migration interruptions, photo transaction rollback, encrypted draft recovery, summary archives, and archive-before-DB/key deletion on ten wrong PINs.
- Relay/PC: targeted route, metadata-store and paired-phone display tests — **3 files, 42 tests passed**.
- PostgreSQL: all six relay migrations applied to a newly created local `_test` database; the touched integration file passed **20 cases**, including security metadata persistence/listing. The disposable database was then removed. No shop/production tables were migrated or changed.
- `npm run relay:generate`, `npm run relay:typecheck`, `npm run typecheck:backend`, `npm run typecheck:frontend`, and phone `npx tsc --noEmit` passed. Project graph refresh uses structural extraction only.

No full suite, root `npm test`, `test:ci`, whole-app Vitest or APK build was run. Native SQLCipher file inspection, actual Android/iOS biometric/recents/camera smoke tests and the mid-range Android benchmark remain unverified until the next native build/device session. SQLite migration tests use real in-memory SQLite plus mocked native boundaries; they do not substitute for inspecting a SQLCipher file on a device.
