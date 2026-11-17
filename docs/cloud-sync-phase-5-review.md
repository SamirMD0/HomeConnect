# Phase 5 — phone cloud actions review

Branch: `feat/phone-cloud-actions`, created from `main`. Commits are local; no push, deployment or APK build.

## PC payment targets

Customer sync records use `CustomerFinancialSummaryService.getCustomerFinancialSummary` with `includeCancelled=false`, `includePayments=false`, `debtLimit=100`, `planLimit=100` (and the service's default paymentLimit). The JSON equals the real financial-summary endpoint for those parameters. The phone does no new money calculation. Existing debt, installment-plan, installment, payment and payment-allocation triggers already invalidate the customer; targeted migration tests verify each target. The new `20261117090000_sync_payment_targets` migration requests a fresh worker snapshot so existing phones receive the larger payment-target projection. Earlier migrations remain untouched.

## Durable phone storage

Phone SQLite schema advances from version 1 to 2 in a transaction, preserving records and sync cursors. `outbox` contains:

| Columns                              | Purpose                                                                                                                                                   |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id TEXT PRIMARY KEY                  | Action UUID generated only on the first Save; reused for every relay retry.                                                                               |
| type, branch_id, payload             | Action type, selected branch and exact request JSON.                                                                                                      |
| photo_path, photo_mime, photo_size   | Nullable copied document-directory photo and declaration.                                                                                                 |
| local_status                         | queued, sent, awaiting_photo, pending, claimed, applied, refused or failed.                                                                               |
| result, created_at, updated_at       | PC result JSON and ISO timestamps.                                                                                                                        |
| attempts, last_error, summary        | Retry count, safe error text and a short list description.                                                                                                |
| owner, submission_key                | Device/user ownership and a unique `(owner, submission_key)` constraint. This bridges a crash between committing SQLite and acknowledging the saved form. |
| next_attempt_at, archived, dismissed | Persisted backoff and visibility/redaction flags.                                                                                                         |

Save contains no network operation: copy an image into `documentDirectory/cloud-outbox/`, verify its size (1 byte–2 MB) and MIME, and insert the row. The enclosing SQLite transaction commits before requesting a sync. Order/payment builders and existing validation remain shared with LAN. Their existing draft key identifies a submission; the outbox creates its separate action UUID on Save and substitutes that UUID into the payload idempotencyKey. A duplicate Save returns the original row.

Done items leave the list after 24 hours, including while offline; their business payload, result and summary are cleared. A minimal hidden ID/submission receipt remains so an old form whose acknowledgement was lost cannot become a second action after cleanup. Refused and failed items remain until dismissed. Dismissal also keeps that minimal receipt. Failed photo files are retained even after dismissal because a timeout could have committed on the PC. Applied/refused photos are removed only after the PC confirms the final result; unsuccessful file cleanup retries later. Unpairing/revocation may remove all photos.

## Send and result loop

`outbox-sender.ts` runs one sender per open database, using device authentication. It sends durable queued rows and polls unfinished accepted IDs in batches of at most 100. POST retries preserve the UUID, payload and createdAt. HTTP 409 `ACTION_ID_CONFLICT` becomes a terminal, explicit check-the-PC error; its ID is never regenerated. Network failures back off 2/4/8 seconds through a 30-minute cap, persisted per action. Metadata/network failures also back off the automatic sync wakeup. Manual refresh and reconnect can request a pass; action backoff still applies.

Each sync refreshes `/device/me`, processes actions/results, then pulls authoritative records. Therefore an applied result causes a record pull in the same cycle. Saves arriving during a cycle request another pass. Start, foreground, connectivity restoration, Save, pull-to-refresh and opening Waiting request sync. While active with unfinished work, a 15-second timer checks whether retries/results are due; ordinary record-only sync retains its existing cadence. All relay requests retain the engine's abort timeout and redirect rejection. No internet work is inside a SQLite record-application transaction.

| Type                    | Exact payload inside `{ id, type, branchId, payload, createdAt, photo? }`                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sales_order.create      | Existing `buildOrderPayload` output.                                                                                                                                                                                       |
| customer_payment.create | `{ targetType: 'DEBT' \| 'INSTALLMENT_PLAN', targetId, ...buildPaymentPayload(...) }`.                                                                                                                                     |
| supplier_payment.create | `{ supplierId, ...buildSupplierPaymentPayload(...) }`, also used directly by LAN recordSupplierPayment: SUPPLIER_PAYMENT, decimal-string amount, currency, paymentMethod, transactionDate, description and optional notes. |
| supplier_bill.upload    | `{ supplierId, note?, billGroupId? }`, plus the photo MIME/size declaration, followed by raw PUT to `/actions/:id/blob`.                                                                                                   |

Photo actions first become awaiting_photo, then pending after PUT. Awaiting-photo results retry the local file. A lost upload response is recovered by polling before another upload, so a photo already claimed by the PC is not incorrectly failed. Later pages wait for the first page to be applied before sending its ID as billGroupId; a refused/failed first page stops the later pages for PC review. Optional photos captured during supplier payment are independent bill actions; the PC links them to the payment later, since the Phase 3 bill envelope has no payment-link field.

Applied is shown as Done. Refused displays the PC's message. Failed displays “The shop PC could not apply this. Check it on the PC before trying again.” A relay validation/conflict error explains that acceptance failed and asks the user to check the PC. No failed action has a button that invents a new action ID and resubmits it.

## UI and revocation

Cloud mode enables only new orders (draft/confirm), customer payments, supplier payments and new supplier bill capture. Stock count/receiving/adjustment, prepaid writes, new customers, supplier invoices and bill editing/linking keep their explicit cloud flags and route protections. Pending actions never alter cached stock, balances, orders or customer money. A saved form shows its waiting status instead of a receipt or a success claim.

Saved orders open only after applied **and** the created order exists in synced records. **Approved Phase 5 scope:** payment receipt viewing/printing remains on the shop Wi-Fi because neither receipts nor business settings are in the cloud feed. The cloud payment status states that limitation. LAN receipts and direct writes remain unchanged.

The cloud pending-bills route now shows **Waiting for the shop PC**, all four action types, timestamps, status, refusal reasons and explicit dismissal for refused/failed. Home shows **Waiting** with a count. The bell counts waiting and refused actions (and retained revoked summaries). LAN mode retains its receipt queue and existing pending-bills screen.

401 uses the existing session/credential/record wipe. Unfinished outbox rows retain only redacted metadata and their summaries with “Not sent: this phone was removed by the shop”; they cannot be sent under a new pairing. These summaries remain accessible on Connect and in Waiting after re-pairing. Cloud sales drafts use a separate directory and device-specific scope. Wiping closes/join pending draft writes before deleting those files, and joins local Saves before redacting the outbox. User reassignment uses the same ordering. The real current PC user and permissions remain authoritative for every action.

## Validation

Only targeted tests were run. Phone: 61 tests across ten touched/new test files, plus `npx tsc --noEmit`. PC: sync-feed and sync-migration tests (65 passed), backend typecheck, and all nine sync database integration cases with `RUN_SYNC_DB_TESTS=1` on a newly created `_test` database. Migrations deployed successfully; the disposable database was removed afterward. Coverage includes the real endpoint comparison, v1 database migration, stable IDs across crash/cleanup, all four wire envelopes, photo readiness/retention, lost responses, results and record pull, backoff/single-flight, revocation summaries, receipt gating and unchanged cached stock/balances. No full suite, root npm test, test:ci, whole-app Vitest, APK build or push.
