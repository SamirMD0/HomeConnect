# Phase 5 suppliers complete review

Branch `feat/mobile-erp-suppliers`, stacked on Phase 4 (`86f5062`). Mobile 1.6.0, Android versionCode 8. Claude built this phase directly.

## What was built

### Bills inbox (phone, Suppliers tab)

- **Inbox list:** the top of the Suppliers tab now shows **Bills inbox · N waiting**, listing bill photos saved without a purchase for every supplier in the branch.
- **Bill actions:** opening a bill shows the photo (loaded with the login header, never a token in the URL) and two actions:
  - **Link to a purchase:** lists that supplier's purchases that have a receiving document, the same rule as the desktop Bills tab, and links in the bill's own branch.
  - **Create purchase from this bill** (admins): opens the existing supplier invoice screen with the bill photo pinned at the top and the supplier preselected. After saving, the bill is attached automatically if the purchase received stock.
    - If no stock was received, or a different supplier was chosen, the PC has nothing to attach the bill to. The phone says so, and the bill stays in the inbox.
- **Shortcuts:** the supplier entry tools (bill photo, pending uploads, invoice, payment) are now at the top of the Suppliers tab. The hidden "Supplier tools" page under More, and the old standalone statement route, are removed; statements live on each supplier's page.

### PC

- **New routes**, shared by both clients:
  - `GET /api/v1/supplier-bills?linked=false&limit=` lists unlinked bills across suppliers within the caller's branch scope, with the supplier name.
  - `GET /api/v1/supplier-bills/unlinked-count` returns the count.
- **Badge:** the desktop sidebar shows an amber count on **Suppliers** when bills are waiting, refreshed every minute. The accessible name reads "Suppliers, 3 unlinked bills".

### Prepaid items (phone, Sell tab)

The plan listed prepaid purchases under suppliers. On the PC they are a **customer** feature (a customer pays ahead for an item), so they live in the Sell tab.

- **List:** Prepaid items, filtered by status and searchable, with the total still to collect.
- **Detail:** payments and status.
- **Admin actions:**
  - **Mark as delivered:** asks for a due date only when money is still owed, as the PC requires.
  - **Deliver and convert the remainder** into a debt or installments.
- **New prepaid item:** from a customer's page (admin).
- **Kept on the PC:** reverting a delivery.

### Double-save safety

- **Deliver and convert:** a repeat is refused by the PC ("already delivered"), so a retry cannot apply twice.
- **New prepaid item:** this PC route has no duplicate-protection ID. If the reply is lost, the phone does not just resend. It shows the customer's pending items and asks the operator to confirm whether the item is there before sending again.

## Also fixed

`src/stock/stock.test.ts` from Phase 4 had a mock type error that the mobile typecheck rejects. The tests passed, but `npm run typecheck` failed. The mocks are now typed.

## Live check (2026-11-12)

The check ran the real desktop API (:3001) behind the real LAN gateway (:3011), against the disposable `mobile_sales_qa` database (synthetic data only).

| Check | Result |
| --- | --- |
| Employee saves a bill without a purchase | 201 |
| Inbox lists it with the supplier name; count | 200; count 0 → 1 |
| Purchase from bill (same body as the phone), stock received | 201, receiving created |
| Link the bill to that receiving | 200; count back to 0 |
| Purchase list includes `supplierReceivingId` | yes |
| Admin creates a prepaid item; employee tries | 201; 403 |
| Deliver with money owed and no due date | 400 "A due date is required…" |
| Deliver with a due date; deliver again | 200 DELIVERED; 409 "already delivered" |

## Tests

- **Phone:** typecheck and lint pass (one existing warning). **244 tests** pass, including 8 new ones: inbox routes, link branch header, linkable-purchase rule, link-after-purchase outcomes, prepaid payloads and routes.
- **PC:** 2 new route tests (inbox list with scope, gateway, and validation; count and branch rejection), all 25 receipt route tests, and a sidebar badge test. The route-registry and gateway tests pass, and so do the frontend and backend typechecks.
- **Android:** the bundle export succeeds (3.34 MB).

## Not verified

- Real Android device.
- Live shop data.
- No screenshots.
- The desktop badge was checked by a render test, not in the running Electron app.
