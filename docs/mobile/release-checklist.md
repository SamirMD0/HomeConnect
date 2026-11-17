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

## Cloud release 2.3.0 with PC 2.4.0

These are release-day checks, not steps performed by the Phase 8 implementation. Use test customer/supplier/product records and check the PC before repeating a queued action.

**Preparation and order**

- [ ] Claude's full-suite review and deferred cloud fixes are complete; the [Phase 8 review](../cloud-sync-phase-8-review.md) has no unresolved release blocker.
- [ ] Make a PC backup with **Settings → Create backup now**. Install PC **2.4.0 with Phone cloud sync disabled** first, solely to make the new secret-creation button available (approved first-install exception).
- [ ] Deploy the **relay before enabling cloud or installing the APK**, using the [click-only guide](../setup/CLOUD_RELAY_SETUP.md). Wait for all six relay migrations, including role/visibility and device status, to finish; health shows `{"ok":true}`. An older relay rejects the phone's status heartbeat.
- [ ] On PC **2.4.0**, save the relay address/secret, enable sync, click **Sync now**, and check **Last sync**. Do not update the phone before this succeeds.
- [ ] Install the new native **phone 2.3.0 / Android versionCode 13** APK over the existing app. SQLCipher and local-authentication modules require this native build; OTA alone is insufficient. Preserve saved connection and pending work.

**Cloud smoke test**

- [ ] Pair from PC **Settings → Phone cloud sync → Create pairing QR**, select the intended user/branches, and set a matching 4–6 digit PIN twice. There is no data-screen access before PIN setup. Optional enrolled fingerprint/face unlock works; cancel returns to PIN.
- [ ] Finish the first copy; compare products, customer financial summary, suppliers, Home and reports with the PC. Set airplane mode, cold-open and unlock: cached data remains readable. Restore connectivity.
- [ ] Cold start locks. Background longer than the selected 1/5/15-minute timer locks; shorter trips do not. Recents and locked screens reveal no amounts. Measure PIN check time on a mid-range Android; retain the Phase 7 iteration floor pending review of real measurements.
- [ ] Upgrade an existing plain-cloud installation with queued work: outbox IDs and photos survive, a full record copy completes, and device inspection confirms SQLCipher files/key handling. Perform a revoke/reset test and confirm DB/key removal while unsent summaries remain protected.
- [ ] With the relay unreachable, queue a customer payment, supplier payment, order and bill photo. Reconnect; Waiting changes to **Done** only after PC application. Each appears exactly once on the PC, with authoritative balances/stock after sync. Do not expect pending writes to alter cached money/stock.
- [ ] Open the applied customer payment receipt and **Share / WhatsApp / Print**. Its PC snapshot timestamp and business details are correct. An older result without receipt data shows the existing shop-Wi-Fi fallback.
- [ ] As admin, request a report period absent from snapshots; Waiting receives the PC result and opens it. As staff, reports/directory records are unavailable. Downgrade a previously admin device and verify cached ADMIN records disappear after sync.
- [ ] Refuse an invalid action on the PC and verify the phone shows that exact message. Check the PC before any manual correction; no retry creates a new action ID automatically.
- [ ] Revoke from the PC. On the phone's next sync it unpairs and removes local records; unsent summary count remains, and summary text is accessible only after a new pairing/PIN. PC **Refresh phones** shows PIN set and reported Last unlock for active phones after sync.
- [ ] During the first week, record Neon dashboard compute CU-hours, storage and transfer daily, with phone count/shop hours. Keep fixed 0.25 CU and five-minute suspension; review actual allowance/usage with Claude.

**Rollback/pause**

- [ ] On the PC, uncheck **Enable phone cloud sync** and **Save sync settings**. This stops the PC worker; cached phone reads, relay traffic and already queued actions are not erased by that switch.
- [ ] Switch each phone to its shop-Wi-Fi connection and sign in normally. Check cloud Waiting work on the PC before recreating it over Wi-Fi. Keep the APK/local data until unsent work is reconciled; do not uninstall as a rollback.
- [ ] If a phone must lose cloud access, use **Revoke** while relay access remains available, then sync it and check retained summaries. Leave additive PC/relay migrations in place.
