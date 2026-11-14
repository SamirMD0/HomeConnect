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

Record batches run in one transaction. The PC cursor is written after all records, and stale cursors receive 409. Replaying an equal cursor is accepted and assigns new revisions. A database sequence and producer advisory lock assign revisions in commit order, including updates to existing records. Device reads return global records and records belonging to the device's stored branch IDs, with decimal-string revision cursors and tombstones.

The phone action UUID is the unique outbox key. Concurrent duplicate inserts use conflict-safe insertion. A replay by its owner returns the first action's current status. Another device receives 409. The relay always takes the acting user ID from the paired device. Concurrent claimers use a single `UPDATE` with `FOR UPDATE SKIP LOCKED`. A five-minute claim lease permits recovery after a PC interruption and increments the attempt count. The PC must also deduplicate action IDs when applying business operations in Phase 3.

Results and photo uploads lock their action row, coordinating with claimers. The first final status/result is retained. A replay with that status succeeds, and a different final status receives 409. Each action has one replaceable photo while pending, enforced by a unique outbox foreign key. Applied/refused results remove that photo transactionally. Images have a 2 MB application and database limit. Action JSON has a 256 KB serialized limit, and request JSON has a 2 MB limit.

Usage is one asynchronous UTC-day upsert per API request, tracking request/body/response counts and successful record/action writes. Health requests skip accounting entirely. Logging contains only method, path without query, status and elapsed milliseconds. Unexpected failures return sanitized messages. Hourly upkeep runs lazily on worker traffic. A `last_upkeep_at` field on the singleton worker durably coordinates the hourly throttle across restarts, with an in-process throttle avoiding repeated checks. Upkeep removes 30-day tombstones/results, resolved-action photos and photos older than seven days.

For an ordinary sync with one worker upload of N records and one phone download, estimate N upserts plus roughly 8–9 small queries, with transaction BEGIN/COMMIT in addition. This includes worker state/heartbeat, device authentication, the scoped download, two usage upserts and an optional device timestamp update. Hourly upkeep adds a short maintenance transaction. Prisma may emit additional statements around upserts. With the plan's five-minute idle window, an isolated wake can occupy about five idle minutes plus active query time. Overlapping phone/worker traffic changes the monthly total. The plan's 30–50 hour estimate still needs measurement after deployment.

Render's production block now defines `home-connect-relay` on the free Frankfurt plan with manual deploys. CI and release verification create a separate relay test database, apply only relay migrations and typecheck the relay before enabling the new database-test flag.

Later clients must retain original photo uploads until a final action result and reconcile full snapshots after the tombstone retention window or a branch-scope change. The relay currently serves one shop database. Revocation remains persistent when the same device ID is registered again, so a new pairing uses a new device UUID.

The specified enqueue and photo-upload endpoints are separate requests. A worker can claim an action before its photo arrives, after which uploads receive 409 because the action is claimed. Phase 3 needs an agreed readiness/retry protocol for photo actions. The current claim response exposes `hasBlob` for the worker to make that decision.

Validation passed 39 tests across the three relay test files, including all ten isolated PostgreSQL integration tests. Relay build/typecheck and the backend typecheck pass. The compiled entry point is checked with an unreachable database while serving health. The staging Blueprint block was compared with main, and all edited YAML files were parsed.
