# Phase 4 mobile stock work review

Branch `feat/mobile-erp-stock`, stacked on Phase 3 (`6fcb2ac`). Mobile 1.5.0, Android versionCode 7. Claude built this phase directly while Codex was out of usage.

## What was built

Everything uses the routes the PC already has. There are no backend changes, apart from adding an optional `costPrice` field to the shared product contract.

| Screen | Who | PC route |
| --- | --- | --- |
| **Stock count** (Stock tab, Home) | ADMIN | `POST /products/:id/stock-movements` `STOCK_COUNT`, one per changed product |
| **Adjust stock** (product page) | Employees: add, return. Admins: also remove, damage/loss, count | same route, the type chosen from the desktop's five |
| **Price check** (Stock tab) | everyone; cost price only when the PC sends it (admins) | `GET /products/scan`, `GET /products/:id` |
| **Receive goods** (Stock tab, Home for employees) | ADMIN, EMPLOYEE | `POST /inventory/receivings`, duplicate warning from `GET /inventory/receivings/duplicate-check` |

- **Shared stock:** every screen says "Shared stock · all branches", matching the PC's single quantity per product.
- **Scanning:** an inline camera stays open between scans. The same code is ignored for 2.5 s, and a code can also be typed.
- **Drafts:** stock counts and receivings are saved on the phone (the same two-slot storage as the sales drafts), so they survive the app being killed. Passwords are never saved.

### Plan change

The plan said "receive goods against an existing supplier purchase". The PC has no such flow: a receiving is its own document, with an optional supplier and reference. The phone mirrors the PC's **New receiving** page instead.

## Double-apply protection

- **Stock changes** always send `expectedBefore`, the stock the operator saw. The PC compares it before writing, so a retry after a lost response is rejected as "stock changed" instead of applied twice.
- **Counts:** if the PC already shows the counted number, the line is marked saved. Otherwise it is marked as a conflict, with a "use the PC's current stock as the start" option.
- **Receivings** send one `idempotencyKey` per document, using the PC's existing support.

## Bug found and fixed in the app

A wrong **account password** comes back from the PC as HTTP 401, the same status as an expired login. Through the normal client, one typo would have refreshed the login, retried, and **signed the operator out**.

Password-protected stock requests now use their own path (`src/stock/stock-api.ts`). A 401 about the account password is shown as a form error. Any other 401 refreshes the login once and retries. Tests cover both cases.

## Live check (2026-11-12)

The check ran the real desktop API (:3001) behind the real LAN gateway (:3011), against the disposable `mobile_sales_qa` database (synthetic data only).

| Check | Result |
| --- | --- |
| Count with a wrong password | 401 "Account password is incorrect"; `/auth/me` still 200 (session intact) |
| Count 12 → 15 | 201, stock 15 |
| Same count request re-sent | 400 "Stock changed from expected 12 to 15"; stock stays 15 (the app marks the line saved) |
| Employee add +2, then the same request again | 201, then 400 stale (no double add) |
| Employee remove | 403 "Only administrators can remove or correct stock" |
| Same receiving key sent 3 times (2 at the same moment) | one receiving id; stock 17 → 22 (+5 once) |
| Duplicate-check route | 200 |

**PC follow-up (not fixed here):** in that last check, one of the two simultaneous receivings returned **500** instead of the existing record. Sales orders catch this database race (`P2002`) and return the saved record; `supplier-receivings.service.ts` does not. No stock was added twice, and the phone never sends two at once, but the PC should handle it the same way sales orders do.

## Tests

- Mobile typecheck and lint pass (one existing warning).
- **236 mobile tests** pass, including 16 new ones in `src/stock/stock.test.ts`: movement rules per role, payload validation, count scans, stale resolution, receiving payload, and the password/401 handling.
- The Android bundle export succeeds.

## Not verified

- Real Android device: the inline camera, continuous scanning, and the number keyboard.
- Live shop data.
- No screenshots.
