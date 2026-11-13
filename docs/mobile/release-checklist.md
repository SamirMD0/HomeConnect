# Phone release checklist

Use this before every phone build or over-the-air update, and after every desktop release that changes routes the phone uses.

## 1. Before building

- [ ] `npm run typecheck`, `npm run lint` and `npm test` pass in `Mobile Scanner/`.
- [ ] Targeted backend and frontend tests for anything the change touched pass. Before a release that also ships the desktop, run the full `npm run test:ci` once against a throwaway database (a name containing `test` or `phaseN`).
- [ ] `app.json`: `version` raised if native code changed; `android.versionCode` raised for every build.
- [ ] `REQUIRED_API_VERSION` (phone) and `MIN_MOBILE_VERSION` (PC) are still right.
- [ ] No CSV files in the commit.

## 2. Build and install

- [ ] `eas build --platform android --profile preview` succeeds.
- [ ] The APK installs **over** the previous version without uninstalling it; saved connection and pending bills are still there.

## 3. Smoke test on a real phone, on the shop Wi-Fi

Use a test customer, supplier and product; delete or reverse them on the PC afterwards.

**Connect**

- [ ] Connect by QR and by typing the address; sign in; pick a branch.
- [ ] Turn Wi-Fi off, then on: offline banner, no sign-out, work continues.
- [ ] Leave the app for over an hour, then return: still signed in.

**Home**

- [ ] Figures match the PC's dashboard, or are hidden if the PC hides them.

**Sell**

- [ ] Create an order by scanning; totals match the PC.
- [ ] Take a payment and share the receipt PDF through WhatsApp.
- [ ] Open a prepaid item; as an admin, deliver one.

**Stock**

- [ ] Price check by scanning.
- [ ] Receive goods by scanning several items; the stock rises once.
- [ ] As an admin, run a short stock count: enter a wrong password first (an error is shown, no sign-out), then the right one.

**Suppliers**

- [ ] Photograph a **bill without a purchase**. It appears in the Bills inbox, and the PC's Suppliers badge goes up.
- [ ] **Create purchase from this bill** with stock received. The bill is attached, and the badge goes down.
- [ ] The photo opens full size on the PC (supplier → Bills).
- [ ] Turn Wi-Fi off, photograph a bill, turn Wi-Fi on. Pending uploads empties.

**More**

- [ ] The version row shows the new version. Reports open.
- [ ] Switch branch: no data from the previous branch remains.

**Roles**

- [ ] Sign in as an **employee**. Admin actions (stock count, corrections, supplier invoice/payment, prepaid create/deliver, reports) are hidden.

## 4. Version handshake

- [ ] Against a PC older than `REQUIRED_API_VERSION`: the app warns but works.
- [ ] With `MIN_MOBILE_VERSION` set above the app's version on a test PC: the app shows **Update the app** and blocks.

## 5. Over-the-air update (when publishing one)

- [ ] `eas update --channel preview --message "…"` succeeds.
- [ ] On a phone with the same app version: More → version row → the update downloads → restart → the version row shows the new update id.
- [ ] Drafts and pending bills survive the restart.
