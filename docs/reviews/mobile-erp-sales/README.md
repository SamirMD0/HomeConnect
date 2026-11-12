# Phase 3 mobile sales & collect review

Branch `feat/mobile-erp-sales`, stacked on Phase 2 (`7307cfd`). Mobile 1.4.0, Android versionCode 6.

Codex built the feature and ran out of usage before the final integration check and this README. Claude finished both.

## What was built

- **New sales order** (Sell → New order): pick or create a customer, add lines by scanning or searching, and save as a draft or confirm. The payload mirrors the desktop `CreateSalesOrderDialog`. Totals and tax come from the server; the phone does no tax math.
- **Customer payment** (customer detail → Take payment): pay against an unpaid debt or installment plan, with the same payload as the desktop receivables dialogs. The new balance comes from the server.
- **Payment receipt**: the desktop receipt data, rendered with `expo-print` (all text HTML-escaped) and shared with `expo-sharing`.
- **Double-submit protection**: each form gets one `idempotencyKey`, using the existing server support. Drafts are stored in two slots, and the submitted payload is saved before any network call, so a killed app or a lost response resubmits with the same key.

No backend changes.

## Integration check (Claude, 2026-11-12)

The test ran the real desktop API (:3001) and the real LAN gateway (:3011) against a disposable `mobile_sales_qa` Postgres database on :5439 (`scripts/qa/mobile-sales-runtime.cjs`). It used only synthetic data and never touched shop data.

| Check | Result |
| --- | --- |
| Same order sent 3 times (2 at the same moment, 1 retry) | 3 × 201, **one** order id, total 139.00 from the server |
| Same debt payment sent 3 times (2 at the same moment, 1 retry) | 3 × 201, **one** payment id |
| Payment receipt fetch through the gateway | 200 |
| Order with an unpaid balance and no due date | Server rejects with "Debt due date is required when a balance remains"; the phone shows the server message, and the due-date field is in the form |
| Customer created twice with the same phone | Second request rejected by the server (no duplicate customer) |

## Tests

Mobile typecheck and lint pass (one existing warning). **220 mobile tests** pass: payload parity with the desktop forms, idempotency key reuse across retries and restarts, draft storage, permissions, and receipt HTML.

## Not verified

- No screenshots: the browser preview did not finish before Codex stopped, and it was not re-run.
- Real Android device: camera scanning into an order, the share sheet with the PDF, and Wi-Fi toggling on hardware.
- Live shop data.
