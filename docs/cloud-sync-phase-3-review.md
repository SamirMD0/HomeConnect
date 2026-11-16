# Phase 3 — PC cloud worker review

Branch: `feat/cloud-sync-worker`. Nothing is pushed or deployed. The worker ships disabled.

## Cycle and operator controls

Settings → **Phone cloud sync** is admin-only: relay address, a write-only password field, enable switch, business opening hours, last completed sync, a plain-language error and **Sync now**. Save changes before running sync. GET `/api/v1/sync/worker` explicitly selects public status fields; ciphertext, plaintext and ephemeral access tokens are never returned. PUT validates HTTPS (HTTP is limited to localhost/127.0.0.1), rejects embedded credentials/query strings, and encrypts secrets with AES-256-GCM using a domain-separated SHA-256 key derived from `JWT_SECRET`. Changing JWT_SECRET requires saving the worker secret again.

The additive PC migration creates the singleton state and permanent applied/refused action journal. It also stores JSON snapshot progress so a large copy can resume across bounded cycles and process restarts. No earlier migration is edited. The phone gateway still denies the entire `/api/v1/sync` prefix.

Backend startup registers the scheduler after the HTTP listener is ready. Disabled/unconfigured settings remain idle until saved; HOSTED_MODE never starts it. The separate relay process has no PC worker imports. Opening hours use BUSINESS_TIMEZONE (Asia/Beirut by default), support overnight hours, and treat equal start/end as all day. Cadence is ten minutes inside opening hours, hourly outside, with an earlier wake at opening. Run-now queues asynchronously and returns 202. Requests during a cycle queue another pass.

An in-process guard and `pg_try_advisory_xact_lock(74103, 2)` serialize cycles across app instances. This lock uses a dedicated one-connection pool; internet work holds no connection from the counter's pool and no business-row lock. The change feed retains its separate, short `(74103, 1)` transaction and 2-second lock timeout. A busy feed leaves its cursor unchanged.

Cycles have a two-minute deadline, checked between pages, records, batches and actions. Fetch includes response-body consumption in its abort timeout: first relay call up to 75 seconds, subsequent calls up to 20 seconds, always bounded by remaining cycle time. Push and date refresh leave time for outbox work. Individual local database operations complete cooperatively; an already running database query cannot be cancelled by the JS deadline. Snapshot pages resume at the last completed ID. Delta reconstruction that reaches the deadline returns busy without acknowledging anything. Failures back off 2/4/8/16/30 minutes, capped at 30; successful work resets backoff. Redirects are rejected to prevent credential forwarding.

## PC → relay

Records now carry branchId. Product/category/user are global (null); customer/supplier/order/bill use their own current branch and branch records use their ID. Tombstones retain change-log ownership. Existing data projections are reused, including PC financial calculations, pricing and bill metadata; no photos are pushed with record pages. Orders retain historical sale facts and convenient line names/SKUs, while phones resolve current product details from product records.

1. Read max sync sequence **before enumerating anything**, using the feed's producer barrier. A timed-out barrier defers the snapshot.
2. Persist the snapshot ID, immutable cursor, 90-day order cutoff, entity and last source ID. Enumerate pages of at most 200: products, undeleted customers, suppliers, active unlinked bill pages grouped by bill identity, branches, categories, active undeleted users and sales orders by orderDate in the last 90 days. Archived products/suppliers remain readable PC records and are included.
3. Stage pages on the relay with the same snapshot identity/cursor, persist progress only after acknowledgement, and publish on finish. Only then mark snapshot_done and set last_pushed_seq to its original cursor.
4. Read deltas in batches of 500 with all system branches, including inactive branches. POST records and save nextSeq **only after HTTP 200**; at most 20 batches per cycle. Writes during enumeration are subsequently covered by deltas.
5. After opening, scan customer projections once per business day, push customers whose PC-calculated outstanding balance is nonzero, and set last_date_refresh after all pages succeed. Progress resumes across cycles. The refresh does not calculate balances or overdue amounts itself.

### Approved relay recovery extension

The original STALE_PC_CURSOR rule would reject a restored PC's entire snapshot forever when its maximum local sequence is lower. The approved extension adds a separate additive relay migration, staging table and worker-authenticated `/snapshot/begin`, `/snapshot/page`, `/snapshot/finish` operations. Begin includes the relay cursor observed by GET state, so conflicting replacements restart. Matching IDs and finish retries are idempotent. Ordinary delta writes are refused while a replacement is staged.

Phones continue reading the previous complete cache during staging. Finish atomically tombstones every formerly live record absent from the replacement, upserts every staged record, and establishes the restored PC's cursor, even when lower. Relay revisions continue increasing and branch history is retained by the existing trigger. The pruning horizon and full-copy pagination remain intact. A crash after finish but before the PC checkpoint is recovered through completed_snapshot_id. A conflicting/stale cursor clears local snapshot progress; the next scheduled pass performs replacement. Operators never alter relay cursors or database rows by hand. An abandoned staging session is replaced by the next worker snapshot begin.

## Relay → PC action mapping

Claim up to 20 actions per cycle. Requests go to `http://127.0.0.1:PORT/api/v1`, with `X-Branch-Scope` and a freshly signed two-minute `{ userId, role }` access token. Existing PC authentication, branch access, permissions, validators, balances and stock rules remain authoritative. Missing, deleted or inactive users are refused as USER_INACTIVE. Other action types are refused as UNSUPPORTED_ACTION.

| Action | Payload and PC route | Idempotency |
| --- | --- | --- |
| customer_payment.create | `targetType` DEBT/INSTALLMENT_PLAN and `targetId` identify `/debts/:id/payments` or `/installment-plans/:id/payments`. Remaining fields are exactly the phone PaymentPayload. | Override body idempotencyKey with action UUID. |
| sales_order.create | Phone OrderPayload → POST `/sales-orders`. | Override body idempotencyKey with action UUID. |
| supplier_payment.create | `supplierId` identifies `/suppliers/:id/transactions`; remaining fields are the JSON generated by recordSupplierPayment (`type: SUPPLIER_PAYMENT`, decimal-string amount, currency, paymentMethod, transactionDate, description, notes?). | Public validator now accepts the existing database UUID idempotencyKey. Creation, audit and key commit in the PC financial transaction; matching replays return the first transaction, mismatches conflict. Unique-key races load and verify the committed transaction. |
| supplier_bill.upload | `{ supplierId, note?, billGroupId? }`; fetch relay blob then POST raw image to `/suppliers/:id/bills`, with note in the existing query parameter and optional X-Bill-Group. | X-Receipt-Id = action UUID; existing PC receipt deduplication. |

The payment target identifiers and supplierId are routing metadata removed before forwarding the unchanged PC body. This explicit envelope is required because today's phone APIs put those IDs in URL paths rather than payment JSON. The future cloud phone client must use this envelope and declare a photo before creating a bill action.

Before HTTP, check sync_applied_actions. A replay sends the stored status/result without loading the user or calling the API. Successful 2xx responses store only created IDs/key fields; PC 4xx responses store refused `{ code, message }` with the PC's explanation. Journal status and result are committed together before reporting. An API commit followed by a PC crash before journaling is safe through the endpoint's idempotency key; a journal commit followed by relay failure replays the journal.

PC 5xx, network failures and timeouts leave the action lease retryable without reporting a final result. At attempt five or later they report failed `{ reason: 'PC_ERROR' }`. Failure fetching a blob or reporting an already committed result remains retryable and never overwrites a journaled success. As with any HTTP timeout, the PC might commit after the caller disconnects; a final PC_ERROR can therefore require checking the PC before submitting a new action ID. Restoring a PC backup also restores its journal and endpoint keys; recovery cannot reconstruct business writes that were absent from that backup.

Worker code never logs credentials, access tokens, actions, photos or raw exceptions. Persisted cycle errors are fixed plain-language messages. Internal PC calls carry X-Sync-Action so existing HTTP/error logging excludes bill notes from query strings.

## Validation

Only targeted Vitest files and backend/frontend/relay typechecks are used. No full suite, npm test or test:ci. Unit coverage includes snapshot ordering and acknowledgement, busy handling, stale-cursor replacement, daily refresh, action allowlist, token/branch mapping, stored replay, PC refusals/transient errors, fifth-attempt failure, bill headers, safe status, secret encryption and scheduler isolation/backoff/deadline. Relay route coverage verifies worker-only snapshot operations.

RUN_SYNC_DB_TESTS / RUN_RELAY_DB_TESTS integration cases ran against newly created `_test` databases with migrations deployed, then both databases were removed. They verify supplier payment replay including the crash gap, customer balance equality with GET financial-summary, unchanged Phase 1 trigger guarantees, Phase 2 transport guarantees and atomic lower-cursor snapshot replacement. Final command results are recorded in the delivery summary.
