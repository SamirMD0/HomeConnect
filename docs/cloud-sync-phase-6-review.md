# Phase 6 — cloud figures, reports and payment receipts

Branch: `feat/cloud-snapshots`, from merged `main`. Commits are local. No push, deployment, paid resource or APK build.

## Visibility decisions

The additive relay migration `20261117120000_relay_snapshot_visibility` adds nullable `min_role` to both live and staged records, with NULL/ADMIN checks. Snapshot staging, publication and ordinary writes preserve it. Employee delta and full-copy pages replace ADMIN data with `{ op: 'delete', data: null }` at the original revision, so their cursor still advances. Admin devices receive the original record. Report and user records also fail closed to ADMIN for older workers that omit the field. The relay performs access control and JSON transport only; it computes no money.

| Entity              | minRole | PC policy checked                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| product             | NULL    | `getCatalogRecord` already calls the product serializer with isAdmin=false. Cost inputs and pricing configuration are excluded for everyone in this shared projection. Inventory uses the existing inventory read projection.                                                                                                                                     |
| customer            | NULL    | Customer reads, financial-summary and receivables reads require authentication and branch access; their read services do not strip employee fields. Financial mutations retain their own PC admin rules.                                                                                                                                                          |
| supplier            | NULL    | Supplier list/detail/summary routes expose the same summary to authenticated employees. Writes, audits and detailed ledger operations have separate restrictions; those restricted projections are not copied here.                                                                                                                                               |
| supplier_bill       | NULL    | Existing unlinked bill metadata is the ordinary supplier-bill read projection; no bill image is included.                                                                                                                                                                                                                                                         |
| sales_order         | NULL    | The existing feed keeps historical sale facts and line product identity. It already excludes nested live stock/pricing/inventory and product costs.                                                                                                                                                                                                               |
| category            | NULL    | Shared catalogue paths and counts.                                                                                                                                                                                                                                                                                                                                |
| branch              | NULL    | The row belongs to its own branch and remains limited to paired branch IDs.                                                                                                                                                                                                                                                                                       |
| user                | ADMIN   | `/users` uses ADMIN middleware. Employee identity comes from its own authenticated `/device/me` response, not the directory.                                                                                                                                                                                                                                      |
| dashboard           | NULL    | The phone calls `/dashboard/overview`, not the admin-only month-end endpoint. Overview has no requireRole gate and uses the same service for both roles; its customer aggregation explicitly uses includeAdminData=false for everyone. Employee overview money is therefore visible exactly as on the PC. Other dashboard endpoints are not silently substituted. |
| receivables_summary | NULL    | `/receivables` is authenticated/scoped and has no admin-only gate or employee field stripping.                                                                                                                                                                                                                                                                    |
| report              | ADMIN   | All selected report routes use the PC's ADMIN report authorization.                                                                                                                                                                                                                                                                                               |

The phone upgrades SQLite v2 to v3, storing min_role alongside records/staging. Existing directory/report copies are removed and an existing database requests a full copy. The data source rejects ADMIN records for staff even while a new copy is downloading. Either direction of role change marks fullCopyInProgress before persisting the pairing. Downgrade also clears cached ADMIN records and stored report results immediately. Report result polling rechecks the current device role, branch grant and user ownership, so a formerly privileged result cannot bypass a later downgrade or reassignment.

## Snapshot set and source

The additive PC migration `20261117121000_sync_figure_snapshots` adds `sync_worker_state.figure_snapshots` JSON and requests a normal primary snapshot to backfill visibility. No earlier migration is edited.

Each active branch receives:

- Three dashboard records: today, week, month, using `/dashboard/overview?range=...&includeArchived=false`.
- One receivables summary: `{ summary, tierCounts }` from the phone's default onlyWithBalance=true query, with a one-row page because pagination does not affect these totals.
- Every catalogue report with kind rows for today and thisMonth: currently 26 reports × two periods.
- Both legacy monthly reports for the current business month: customer-debt-snapshot and financial-activity.

That is 58 records per active branch. A loopback HTTP GET uses a freshly signed active PC admin token and X-Branch-Scope, so existing PC validators, service calculations and route response shapes remain authoritative. There must be an active PC administrator; no synthetic user or permission bypass is created. Inactive branches are excluded because the PC's accessible-branch middleware excludes them.

Report request selection is shared with the phone in `shared/report-request.ts`; this is the same builder formerly in the phone API. Monthly report pages use 25 rows and gather up to 40 pages, matching the existing phone cap. This can represent at most 1,000 monthly rows, even when the PC has more pages. No totals are summed or recomputed while gathering pages.

IDs are UUIDv5 in the URL namespace over `dashboard|branchId|period`, `receivables_summary|branchId`, or `report|branchId|reportId|period`. Monthly snapshots use the stable currentMonth period and overwrite themselves as the business month changes. Data wraps the exact route response with entity, branch, period/report ID, businessDate and updatedAt from the PC.

## Schedule, hashes and recovery

After primary records/date refresh and before action processing, the worker spends its remaining figure budget, reserving fifteen seconds for actions. Home and receivables tasks for every branch precede report tasks. Completed tasks and hashes are saved after relay acknowledgement. The next cycle resumes the saved task index. Source requests use the cycle deadline and the existing twenty-second per-call abort limit. Already running PC SQL remains cooperative; an HTTP abort cannot cancel arbitrary underlying service work.

A new run starts inside opening hours only when sync_changes has advanced past the run's captured PC cursor and at least fifteen minutes have elapsed since its start. The first cycle on a new business date can run even outside opening hours and without a cursor change. An incomplete run resumes across cycles; one that crosses a business-date boundary restarts for the new date. With the ten-minute worker cadence of the original build, normal changing-day refreshes occur about every twenty minutes (the default is now fifteen minutes, so about every thirty); fifteen minutes is a minimum separation, not a latency promise.

Sorted JSON is SHA-256 hashed, including businessDate and the response. Volatile metadata generation timestamps are excluded from the hash, while the pushed response remains intact. updatedAt is not hashed. Unchanged hashes produce no relay record write. Completed runs save lastSeq, lastDate and lastAt. Primary snapshot replacement clears figure state because replacement removes the old figure records as well; all figure hashes must then be republished. Network failures before acknowledgement leave progress retryable.

Report JSON above 1.5 MiB becomes a small `{ tooLarge: true }` response. Relay JSON already accepts 2 MiB, so an ordinary result plus its envelope fits without raising the action-payload limit. Record pages and action-result responses are bounded around 1.75 MiB; record scans take at most 26 candidates so several large reports cannot form a hundreds-of-megabytes response. Cursor pagination returns the remaining records on subsequent pages. Large action results can be omitted from a batch once its byte budget is full; unresolved IDs are polled again after acknowledged results leave the phone's poll set.

## On-demand reports

The Phase 5 outbox accepts `report.request` with `{ reportId, filters }`, where filters are the existing ReportFilters. Reopening a screen or tapping twice finds the same durable request. The PC resolves only known catalogue routes, loads the action's real current user, and performs a GET as that user. Staff hit the actual PC admin route and receive its code/message. An oversized response is refused with REPORT_TOO_LARGE and a shop-Wi-Fi message. Applied report JSON, report ID, filters and a PC timestamp are journaled before relay reporting. The permanent PC journal handles transport replays; the phone retains the result for 24 hours, then clears its payload/result while preserving the existing minimal submission receipt.

## Payment receipts

After customer_payment.create succeeds, the worker selects the newly created payment by the action's idempotency key, fetches `/payments/:id/receipt` and `/business-settings` as that same user, and stores `result.receipt = { payment, business, updatedAt }` before reporting applied. Business is limited to shopName, address, phone, email and taxNumber: those are the fields the existing receipt HTML actually uses. No image is needed or included, so image bytes are zero, below the 200 KB allowance. A transient receipt read leaves the action retryable; the original payment endpoint key prevents another payment.

The existing receipt screen loads an applied result only for the current device/user and selected branch. Share/WhatsApp/Print reuse the same PDF/share path as LAN. Older results without a receipt show the shop-Wi-Fi fallback. The receipt is an as-issued PC snapshot, explicitly dated; a later PC void/correction is not automatically rewritten into that stored action result. Users can check later changes on the shop Wi-Fi. Receipt availability follows the existing 24-hour Done-result retention; older receipts remain available on the PC.

## Phone screens

Home removes the cloud Wi-Fi placeholder and reads its three preset snapshots. Longer Home ranges remain LAN-only. Receivables cards/totals use the PC summary and show the snapshot time. In cloud mode the totals are explicitly labelled as branch totals for all customers; search and standing chips filter the customer list, not a locally recomputed total.

Reports use snapshots for today/thisMonth and the current legacy month. Other selections offer Request from the shop PC, with the ordinary outbox status and PC refusal reason. Applied results feed the existing tables and PDF export. Waiting links reopen the requested report/filter or its payment receipt. Missing automatic snapshots say Waiting for the first figures from the shop PC. Too-large reports direct the user to shop Wi-Fi. Last updated and PDF snapshot timestamps come from stored PC values, never the phone's current time. Report menus and reads remain admin-only. Stock, prepaid, customer creation and supplier-invoice cloud write guards remain intact.

## Neon estimate and limits

### After the post-phase fixes (2026-11-19)

These replace the original estimate below, which is kept for the record.

- The worker now syncs every **15 minutes** during opening hours by default. Settings → Phone cloud sync → **Sync every** offers 10, 15 or 30 minutes. It stays hourly outside opening hours.
- The phone no longer polls every 15 seconds while an action waits. Only actions not yet sent (queued, or waiting for a photo) retry, at least 30 seconds apart. Actions the relay has accepted check for results at most every 5 minutes, and only while the app is open. Pull-to-refresh is limited to once per 30 seconds. Nothing polls in the background.
- The Neon compute is fixed at 0.25 CU with a 5-minute suspend (`docs/setup/CLOUD_RELAY_SETUP.md`).
- The relay records which minutes of each UTC day had a database request (`relay_usage.active_minutes`). It counts each active minute plus the 5-minute suspend delay, merges overlaps, and multiplies by 0.25 CU. `GET /relay/v1/worker/usage` returns the month-to-date figure and a straight-line projection. PC Settings shows "Cloud usage this month: about X of 100" and warns from 80 % projected. It reads this once per visit, because each read wakes Neon.

Estimate with these settings (07:00–22:00, 0.25 CU):

| Traffic case | Awake time/day | CU-hours/day | 30-day estimate |
| --- | --- | --- | --- |
| Worker every 15 minutes while open | 60 wakes × 6 minutes = 6 hours | 1.5 | 45 |
| Hourly worker outside opening | 9 wakes × 6 minutes = 0.9 hours | 0.225 | about 7 |
| An open phone checking a waiting action all day | up to 15 more wakes/hour between worker wakes, at most | up to about 1.5 more | up to about 45 more |

A quiet shop comes to about **50 CU-hours a month**. A phone left open with a waiting action all day adds more, but results usually arrive within one worker cycle, after which checks stop. Syncing every 30 minutes halves the worker part. The PC's usage line is an estimate; Neon's dashboard is the real figure.

### Original estimate (before the fixes)

Checked 2026-11-17: Neon currently measures the Free allocation as **100 CU-hours per project per month**, with 1 GB database storage and suspension after five idle minutes. CU-hours are capacity × active wall-clock hours; they are not identical to the plan document's informal “hours.” [Neon pricing](https://neon.com/pricing) and [Neon's current Free-plan announcement](https://neon.com/blog/neon-free-plan-1-gb-per-project).

The following is an estimate from the code's polling cadence, not a measured deployment. Assume a fixed 0.25 CU, 07:00–22:00 opening hours, fifteen hours open, no overlapping phone wakeups, and five idle minutes after each short database burst:

| Traffic case                                                    | Estimated active wall-clock time/day             | CU-hours/day at 0.25 CU | 30-day estimate    |
| --------------------------------------------------------------- | ------------------------------------------------ | ----------------------- | ------------------ |
| Worker every ten minutes while open                             | 90 wakes × five minutes = 7.5 hours              | 1.875                   | 56.25 CU-hours     |
| Hourly worker outside opening                                   | Nine wakes × five minutes = 0.75 hours           | 0.1875                  | 5.625 CU-hours     |
| Combined quiet baseline                                         | About 8.25 hours, plus active query time         | About 2.06              | About 62 CU-hours  |
| Pending actions keep an active phone polling throughout opening | Up to 15.75 hours including the outside baseline | About 3.94              | About 118 CU-hours |

Figure writes normally overlap an existing worker wake. On a continuously changing day the ten-minute scheduler allows roughly 45 opening-hour figure runs plus a daily boundary run; unchanged hashes reduce actual writes substantially. At an illustrative one minute of additional active database time per full figure pass, that adds about 0.19 CU-hours/day, or six CU-hours/month. A few non-overlapping phone opens add several more CU-hours/month. A quiet/moderate case around 65–80 CU-hours/month is plausible under these assumptions; sustained pending polling or autoscaling can exceed 100. No deployment CU setting was changed, and measured usage must replace this estimate before release.

Storage also needs measurement: 58 records/branch at an illustrative 10 KiB average is roughly 580 KiB/branch, whereas 54 report snapshots each just below the size cap approach 81 MiB/branch before indexes, history, actions and photos. The per-record cap alone does not guarantee the project stays under 1 GB. The existing relay usage counters track requests/bytes/records, not authoritative CU-hours. Provider usage and a real week of traffic remain Phase 8 validation. Hitting a free quota leaves durable actions/cursors retryable; this phase enables no paid plan.

## Validation

- Backend: 95 targeted unit/route tests across the touched sync-worker/feed and relay files passed.
- Phone: 42 targeted tests across eight touched/new files passed, including SQLite migration, role-change full copies, offline figure reads, exact large money strings, request/send/result flow, result retention, receipt access and UI gating.
- Isolated PostgreSQL: ten PC integration cases and nineteen relay cases passed with their explicit test flags on newly created `_test` databases. Both sets of migrations applied; both disposable databases were removed. The new PC case checks dashboard, receivables and two reports against the exact HTTP response consumed by the worker.
- relay:generate, relay:typecheck, typecheck:backend and phone `tsc --noEmit` passed. The project graph is refreshed using AST extraction only.

No root npm test, test:ci or whole-app Vitest was run. Native device smoke testing, live provider usage and later receipt corrections remain the limits described above. No production/shop database was migrated or changed.
