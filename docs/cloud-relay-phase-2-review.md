# Phase 2 relay review

The relay is a separate Express app with six relay-owned tables and a dedicated Prisma client. It stores the PC's JSON and phone action payloads opaquely. It uses its own entry point, `RELAY_DATABASE_URL`, generated `.prisma/relay-client`, schema, migrations and TypeScript configuration. The PC compiler excludes the relay directory. Import-boundary tests cover both directions. The existing PC build and Prisma script definitions retain their original commands.

| Client | Endpoints under `/relay/v1` |
| --- | --- |
| Worker | `POST /worker/records`, `GET /worker/state` |
| Worker | `POST /worker/outbox/claim`, `GET /worker/outbox/:id/blob`, `POST /worker/outbox/:id/result` |
| Worker | `POST /worker/devices`, `GET /worker/devices`, `POST /worker/devices/:id/revoke` |
| Worker | `GET /worker/usage` |
| Device | `GET /device/records`, `POST /device/actions`, `GET /device/actions?ids=…`, `PUT /device/actions/:id/blob` |
| Public | `GET /health`, which executes zero database queries |

Worker authentication hashes the supplied secret and compares fixed-size digests in constant time. Device authentication looks up its SHA-256 digest and checks revocation on every request. Worker credentials are rejected by device routes, and pairing requires a separate device digest. Device activity timestamps update at most once a minute. Rate limits are 120 requests per minute per device and 120 per minute for the worker, held in process memory.

Record batches run in one transaction. The PC cursor is written after all records, and stale cursors receive 409. Replaying an equal cursor is accepted and assigns new revisions. A database sequence and producer advisory lock assign revisions in commit order, including updates to existing records. The follow-up `20261115100000_relay_review_fixes` migration adds branch history, photo declarations and a pruning horizon, widens the outbox status check, and replaces the revision trigger.

When a record changes its branch, the trigger retains each previous non-null branch ID once in `previous_branch_ids`. Device reads include current/global records and records overlapping the device's historical branches. A phone that has access to the current branch receives the current upsert. A phone limited to a previous branch receives a delete with null data at the same new revision. Branch history stays internal to the relay response projection. A GIN index supports the history overlap filter.

Upkeep advances `relay_worker.pruned_through_rev` to the highest deleted tombstone revision using `GREATEST`, in the same transaction as pruning. Record reads use a repeatable-read transaction for the horizon check and record query. A positive cursor below that horizon receives HTTP 410 with `{ "code": "RESYNC_REQUIRED" }`. Cursors at/above the horizon continue normally, and revision zero starts a full copy that the phone uses to replace local data.

A phone recovering from 410 requests `after=0&fullCopy=true`. Each full-copy response includes `snapshotHorizon`. While `hasMore` is true, the phone carries that value into `after=<nextRev>&fullCopy=true&snapshotHorizon=<value>`. These continuation pages can read retained live records below the horizon. If pruning advances, continuation receives 410 and the phone restarts at zero. The horizon check and record query share a repeatable-read transaction on every page. A completed full copy advances `nextRev` to at least the horizon, including an empty copy. The phone replaces its local copy and resumes ordinary incremental reads from that cursor. Incremental reads retain the positive-cursor 410 rule.

The phone action UUID is the unique outbox key. Concurrent duplicate inserts use conflict-safe insertion. A replay by its owner returns the first action's current status. Another device receives 409. The relay always takes the acting user ID from the paired device. Concurrent claimers use a single `UPDATE` with `FOR UPDATE SKIP LOCKED`. A five-minute claim lease permits recovery after a PC interruption and increments the attempt count. The PC must also deduplicate action IDs when applying business operations in Phase 3.

An action can declare `photo: { mime, size }` with JPEG/PNG/WebP MIME and a positive size up to 2 MB. Declared photo actions start in `awaiting_photo`, and polling returns that status directly. Claimers select pending actions and expired claims. The initial upload must match the declared MIME and stay within five percent of the declared size, including both boundary values. Blob storage and the transition to pending commit together while holding the action row lock. Pending actions continue to accept photo replacements before a claim.

Results and photo uploads lock their action row, coordinating with claimers. The first final status/result is retained. A replay with that status succeeds, and a different final status receives 409. Each action has one photo, enforced by a unique outbox foreign key. Applied/refused results remove that photo transactionally. Images have a 2 MB application and database limit. Action JSON has a 256 KB serialized limit, and request JSON has a 2 MB limit.

Usage is one asynchronous UTC-day upsert per API request, tracking request/body/response counts and successful record/action writes. Health requests skip accounting entirely. Logging contains only method, path without query, status and elapsed milliseconds. Unexpected failures return sanitized messages. Hourly upkeep runs lazily on worker traffic. A `last_upkeep_at` field on the singleton worker durably coordinates the hourly throttle across restarts, with an in-process throttle avoiding repeated checks. Upkeep removes 30-day tombstones/results, resolved-action photos and photos older than seven days. Declarations still awaiting a photo seven days after the server received the action become failed with `{ "reason": "PHOTO_NEVER_ARRIVED" }` and a resolved timestamp.

For an ordinary sync with one worker upload of N records and one phone download, estimate N upserts plus roughly 9–10 small queries, with transaction BEGIN/COMMIT in addition. This includes worker state/heartbeat, device authentication, the pruning-horizon check, the scoped download, two usage upserts and an optional device timestamp update. Hourly upkeep adds a short maintenance transaction. Prisma may emit additional statements around upserts. With the plan's five-minute idle window, an isolated wake can occupy about five idle minutes plus active query time. Overlapping phone/worker traffic changes the monthly total. The plan's 30–50 hour estimate still needs measurement after deployment.

Render's production block now defines `home-connect-relay` on the free Frankfurt plan with manual deploys. CI and release verification create a separate relay test database, apply only relay migrations and typecheck the relay before enabling the new database-test flag.

Later clients must retain original photo uploads until a final action result and reconcile full snapshots after the tombstone retention window or a branch-scope change. The relay currently serves one shop database. Revocation remains persistent when the same device ID is registered again, so a new pairing uses a new device UUID.

Isolation checks load and parse runtime source files once in `beforeAll` with a sixty-second timeout. Cached import information preserves the checks in both directions while keeping filesystem work outside five-second test bodies. Database tests require `RUN_RELAY_DB_TESTS=1` and a relay database name ending in `_test` or `_ci`.

Review validation covers photo readiness and tolerance boundaries, concurrent upload/claim behavior, seven-day abandonment, branch-move deletes, duplicate-free branch history, the pruning horizon, full-copy pagination below that horizon and restarts if pruning advances. The follow-up migration was applied to a test database containing rows created under the foundation schema and preserved those rows. The foundation migration's checksum was verified against the prior commit.

All 56 targeted tests pass, including sixteen PostgreSQL integration tests. `npm run relay:generate`, `npm run relay:typecheck` and `npm run typecheck:backend` complete successfully.
