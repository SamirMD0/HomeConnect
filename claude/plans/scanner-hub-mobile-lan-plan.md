# Scanner Hub — Physical Scanner + React Native Mobile Scanner (LAN)

Status: **Plan approved. CP-RN1 (verification) complete — see §20. No folder created, no packages installed, no code written, no version bump.**

**Direction change (this revision):** mobile camera scanning moves from the LAN-served mobile *web* page to a small **React Native / Expo** app living at `HomeConnect/Mobile Scanner/`. See §21 for the full change summary.

---

## 0. What the repository already gives us (re-verified for this revision)

The scanner backend from the previous phase is **built and present**, not hypothetical. This changes the shape of the remaining work: the React Native app is a new *client* for an existing, tested LAN contract, not a new subsystem.

| Area | Reality in repo | Consequence for the RN app |
| --- | --- | --- |
| Scanner feature folder | [backend/src/features/scanner/](backend/src/features/scanner/) exists with `lan-listener.ts`, `scanner.lan.routes.ts`, `scanner.routes.ts`, `scanner.service.ts`, `scanner.store.ts`, `scanner-session.middleware.ts`, `scanner-rate-limit.ts`, `lan-address.ts`, `mobile-scanner.page.ts` + colocated tests. | **No new backend feature folder.** CP-RN1 is verification, not construction. |
| LAN listener | Separate Express instance, `SCANNER_LAN_PORT` default **3011**, `SCANNER_LAN_HOST` default `0.0.0.0`, idle auto-disable `SCANNER_LAN_IDLE_MS` default 8 h ([lan-listener.ts:11-25](backend/src/features/scanner/lan-listener.ts#L11-L25)). | The RN app targets `http://<PC-LAN-IP>:3011` exactly as the web page does. |
| LAN route surface | Exactly four routes ([scanner.lan.routes.ts](backend/src/features/scanner/scanner.lan.routes.ts)): `GET /mobile-scanner`, `POST /api/v1/scanner/pair`, `POST /api/v1/scanner/events`, `GET /api/v1/scanner/session`. | The RN app uses the last three. It ignores `/mobile-scanner`. |
| Loopback scanner API | Mounted behind `requireAuth` at [app.ts:117](backend/src/app.ts#L117): `lan/enable`, `lan/disable`, `lan-status`, `pairing-code`, `sessions`, `sessions/:id/revoke`, `events/recent`, event record ([scanner.routes.ts:20-49](backend/src/features/scanner/scanner.routes.ts#L20-L49)). | Admin-side flow is unchanged. The phone never touches :3001. |
| Session auth | `X-Scanner-Session` header, `requireScannerSession` never populates `req.user`, never issues a JWT, never sets a cookie ([scanner-session.middleware.ts](backend/src/features/scanner/scanner-session.middleware.ts)). Invalid/revoked/expired all return the same 401 `UNAUTHORIZED`. | The RN app stores an opaque token, not a JWT. It cannot escalate. |
| Scan response minimization | `serializeScanResult()` returns exactly `{ id, name, model, sku, barcode, brand, isActive }` ([products.service.ts:671-682](backend/src/features/service/products/products.service.ts#L671-L682)); a test asserts the key set. | The RN result screen can render only these six fields. There is nothing else to leak. |
| Scan lookup | `ProductsService.scanLookup()` normalizes server-side, matches exact barcode then SKU, returns `FOUND` / `NOT_FOUND` / `INVALID_CODE` ([products.service.ts:166-194](backend/src/features/service/products/products.service.ts#L166-L194)). | The phone sends `{ code }` and nothing else. It never asserts a match. |
| Camera over HTTP | The web page uses `BarcodeDetector` + `getUserMedia`, which require a secure context. `http://192.168.x.x:3011` is not one. | **This is the reason for the direction change.** See §5. |
| Root workspace | Root [package.json](package.json) has **no** npm `workspaces` field. `lint` targets `frontend/src backend/src desktop/src`; `typecheck` uses `tsconfig.json` (`include: ["frontend/src"]`) and `tsconfig.server.json` (`include: ["backend/src", "desktop/src"]`). | A sibling `Mobile Scanner/` folder is invisible to lint and typecheck by construction. Good. |
| Root Vitest | [vitest.config.ts](vitest.config.ts) excludes only `**/node_modules/**`, `**/dist/**`, `**/frontend/dist/**`. | ⚠️ **Real collision.** Root `npm test` would sweep up `Mobile Scanner/**` tests and run them in the Node/JSDOM root config. §14 handles this. |

---

## 1. Goal of this phase

Give the shop a **working phone camera scanner** by replacing the browser-based camera path with a native one, while changing **nothing** about the backend security model, the database, or the desktop app.

Definition of done:

1. A React Native (Expo) app at `HomeConnect/Mobile Scanner/` builds and runs on an Android phone via Expo Go.
2. The user can enter the PC LAN IP and port, test the connection, and see a clear status.
3. The user can pair once with a 6-digit code and the session token persists across app restarts.
4. The native camera scans a barcode and the scan reaches the PC's :3011 listener; the PC picks it up as it does today.
5. The phone shows only found / not-found / invalid, plus name, model, brand, SKU, barcode, active flag.
6. Manual code entry works at all times, including when camera permission is denied.
7. **Zero** backend, frontend, desktop, schema, or migration changes — apart from Scanner Hub *wording* and docs (§13, §15) and the root Vitest exclusion (§14).

---

## 2. Business workflow

**Counter workflow (USB scanner on the PC)** — unchanged. Scan → normalize → exact barcode then SKU → product opens/selects on the Products page; recorded in Recent Scans.

**Shelf / stockroom workflow (phone)** — this is what changes:

1. Admin opens Scanner Hub on the PC and enables **LAN Scanner Mode**.
2. The Hub shows the PC's LAN IP candidates, the port, and a short-lived 6-digit pairing code.
3. Employee opens the **HomeConnect Mobile Scanner** app on the phone, types the PC IP (once), and taps **Test connection**.
4. Employee enters the pairing code once. The app stores the session token.
5. Employee points the phone camera at a shelf label. The app sends the code to the PC.
6. The phone shows *found / not found* plus minimal product identity.
7. The PC picks the scan up and opens/selects the product.
8. Admin can revoke the phone session at any time; sessions expire on their own.

---

## 3. Architecture

```
Phone: HomeConnect Mobile Scanner (React Native / Expo)
  - native camera permission (no HTTPS needed)
  - no DB, no cache, no ERP data, no JWT
        |  plain HTTP, same Wi-Fi only
        v
PC: LAN scanner listener  :3011  (0.0.0.0, four scanner routes ONLY)
        |  in-process event bus + product lookup
        v
PC: main backend  :3001  (127.0.0.1 only, full API, requireAuth)
        |
        v
PostgreSQL on the business PC   <-- the single owner of all data
```

Decisions carried forward from the previous revision, still binding:

**D1 — The phone owns nothing.** No mobile DB, no sync, no queue, no cached catalogue. It is a keyboard with a camera. This is the rule that keeps the ERP's financial invariants untouched, and it survives the move to native unchanged.

**D2 — Separate LAN listener on :3011, not a rebind of :3001.** Routes that were never mounted cannot be reached. Security by absence.

**D3 — Same process, shared memory.** A scan on :3011 is visible to a poll on :3001 through an in-memory event bus.

**D4 — Electron never uses the LAN IP.** Desktop stays on loopback.

**D5 — LAN mode is off by default and admin-controlled.**

New decision for this revision:

**D6 — The camera is a native concern, not a web concern.** Browser camera access is gated on secure context; a native app is gated on an OS permission prompt. Moving the camera to React Native removes the single highest-likelihood risk in the previous plan (old R1) without adding certificates, flags, or per-phone setup.

**D7 — The RN app is a client, not a second app.** It adds no endpoint, no data model, no permission, and no build coupling to the HomeConnect root project.

---

## 4. Physical scanner plan (USB / keyboard-wedge)

Unchanged from the previous revision and unaffected by this direction change. The USB path already normalizes, gives found/not-found feedback, and records recent scans on the PC. Nothing in this document touches it.

---

## 5. Why React Native replaces the mobile web scanner

**The problem.** The LAN listener serves `http://192.168.x.x:3011/mobile-scanner`. `getUserMedia` and `BarcodeDetector` require a **secure context**. A plain-HTTP LAN origin is not one, so modern mobile browsers block the camera. Manual typing works; the camera — the entire point of a phone scanner — does not.

**The options that were on the table, and why they lose.**

| Option | Verdict |
| --- | --- |
| `chrome://flags/#unsafely-treat-insecure-origin-as-secure` on each phone | Per-device, per-Chrome-update fragility; breaks when the PC's DHCP IP changes; unsupported on iOS; asks a shop owner to weaken browser security. |
| Self-signed HTTPS on :3011 | A real secure context, but: an interstitial accepted per phone, a cert that expires and must be regenerated, cert storage in userData, and Android's increasing hostility to user-added CAs. Real work, permanent maintenance. |
| **React Native / Expo app** | Native camera permission. No certificates, no flags, no interstitial, no secure-context rule at all. Plain HTTP to the PC is still fine because it is an ordinary app network request, not a browser-gated capability. |

**Decision: build the React Native app.** The HTTP LAN API stays exactly as it is — HTTP was never the problem, *browser camera policy on HTTP* was.

**Recommended stack: Expo (managed), TypeScript.** Reasons: no Android Studio required for first-run testing (Expo Go on the phone is enough), one command to start a dev server from VS Code, first-class camera/barcode support in `expo-camera`, a straightforward path to EAS Build later if an APK is ever wanted. Bare React Native buys native-module freedom this app does not need and costs a Gradle toolchain on the business PC.

---

## 6. Folder layout: `Mobile Scanner/`

The app lives inside the HomeConnect repository root, in a folder named exactly:

```
Mobile Scanner
```

Two words, one space, title case.

```
HomeConnect/
  backend/
  frontend/
  desktop/
  docs/
  claude/
  scripts/
  Mobile Scanner/
    app/                 # expo-router screens (or src/screens/ if not using expo-router)
    components/          # ConnectionForm, PairingForm, ScanResultCard, StatusBanner
    src/
      api/               # scanner client: pair, events, session
      lib/               # base-url builder, validation, error mapping, duplicate-scan guard
      storage/           # token + settings persistence
      types/             # response types mirrored from the backend contract
    assets/
    app.json
    package.json
    tsconfig.json
    .gitignore           # node_modules, .expo, android/, ios/
```

**Path handling — the space matters.** This is a recurring source of broken commands on Windows, so it is called out as a plan requirement, not a footnote:

- Always quote the path in shells: `cd "Mobile Scanner"`, `npm --prefix "Mobile Scanner" run start`.
- PowerShell: `Set-Location "Mobile Scanner"`; use the call operator for executables in quoted paths.
- Never add `Mobile Scanner` to a script that builds a path by naive string concatenation without quoting.
- Any npm script *in the root package.json* that references the folder (§14 recommends none) must quote it.
- Prefer running commands **from inside** the folder rather than passing the path around.
- CI/installer scripts under [scripts/](scripts/) must not glob the repo root in a way that picks up the folder unquoted.

**Alternative considered:** naming it `mobile-scanner` to dodge the space entirely. Rejected — the requested name is explicit, and the space is a documentation problem, not a technical blocker. If tooling later proves it genuinely hostile, renaming is a one-line git move and an open decision (OD-RN5).

---

## 7. React Native app scope — "HomeConnect Mobile Scanner"

The app is a **scanner terminal**. Four screens, no navigation drawer, no dashboard, no lists.

### Hard architectural rules (binding)

The phone **must not** have:
- its own database or any persisted business data
- offline sync or an offline scan queue
- customer, debt, payment, installment, supplier, or ledger access
- product / stock / sales-order editing of any kind
- admin functions
- a user JWT, a login form, or any `requireAuth` credential
- a direct PostgreSQL connection

The phone **may** only:
- save the PC LAN base URL locally
- pair using a 6-digit code
- store the scanner session token locally
- scan a barcode with the native camera
- accept manual barcode input
- POST the scanned code to the LAN scanner endpoint
- display a minimal found / not-found / invalid result

The backend remains authoritative. The business PC remains the only database owner.

### Screen 1 — Setup / Connection

Fields and actions:
- PC IP address (text, e.g. `192.168.0.178`)
- Port (numeric, default `3011`)
- Derived base URL, shown read-only: `http://192.168.0.178:3011`
- **Test connection** button
- Connection status: Unknown / Reachable / Unreachable, with the failure reason

Behaviour:
- Validate the IP/port client-side before allowing a test (§16 covers the pure tests).
- The connection test should hit a route that exists on the LAN listener and does not consume a pairing code. Preferred: `GET /api/v1/scanner/session` **without** a token and treat a `401 UNAUTHORIZED` envelope as *reachable but unpaired* — a 401 proves the listener is up and is the HomeConnect backend. A network error means unreachable. (OD-RN1 records the alternative of asking for a tiny unauthenticated ping route; the 401 probe is recommended precisely because it needs **no backend change**.)
- Persist IP and port immediately on a successful test.

### Screen 2 — Pairing

Fields and actions:
- 6-digit pairing code entry (numeric keypad, no autocorrect)
- Optional device label (max 40 chars — the backend cap at [scanner.validator.ts](backend/src/features/scanner/scanner.validator.ts))
- **Pair device** button → `POST /api/v1/scanner/pair`
- Paired / Unpaired status with the session expiry
- **Unpair / clear session** button

Behaviour:
- On success (`201`, `{ success: true, data: { token, expiresAt, deviceLabel } }`) store the token and move to the Scanner screen.
- On failure show one generic message. Do **not** try to distinguish "wrong code" from "expired code" in the UI beyond what the server says — the server deliberately blurs that distinction, and the app must not undo it.
- Surface the rate-limit case ("too many attempts, ask the PC for a new code") without implying which attempt was closest.

### Screen 3 — Scanner (the default screen once paired)

Features:
- Live camera preview with barcode detection
- Manual code input + Send, always visible and always usable
- Last scan result card
- Status: FOUND / NOT_FOUND / INVALID_CODE / network error / session invalid
- Rescan action

Product details shown on FOUND — **exactly the six fields the server sends**:
- name
- model
- brand
- sku
- barcode
- isActive (rendered as an "Archived" warning when false)

Explicitly **not** shown, because the server never sends them: price, cost, internal price code, stock, supplier, notes, specifications, images. Adding an image would require a new backend route and is an explicit approval point, not a UI decision.

### Screen 4 — Settings

- PC IP, port, saved base URL (editable, re-tests on save)
- Device label
- **Test connection**
- **Clear pairing** (drops the stored token)
- App version / build

Keep the app simple. No theming system, no i18n framework — English with the four Arabic strings that matter (connected, scan, found, not found), matching the convention the web page already uses.

---

## 8. Camera and barcode plan

**Package: `expo-camera`.** It covers preview and barcode scanning in one dependency in current Expo SDKs, which is one fewer moving part than a separate scanner package.

Behaviour to implement:

1. Request camera permission on first entry to the Scanner screen, with a plain-language rationale ("HomeConnect Mobile Scanner needs the camera to read product barcodes").
2. If permission is **denied**: hide the preview, show manual input full-screen, and show a "Open device settings" hint. The app remains fully functional — manual input is the contract, the camera is the enhancement.
3. **Duplicate-scan guard**: ignore the same normalized code within a short window (~1.5–2 s). A camera fires continuously; without this the shop generates dozens of identical events per label.
4. **Throttle submissions**: one in-flight scan request at a time; drop rather than queue while one is pending.
5. **Feedback**: clear visual success/failure state; optional short haptic on success (Expo haptics is a dependency decision — OD-RN3; visual-only is acceptable for v1).
6. **Rescan** returns to the live preview after a result.
7. Manual submit is available in every state, including while the camera is active.
8. Restrict detected symbologies to what the shop actually prints (EAN-13, EAN-8, UPC-A, Code 128, QR if labels use it) to cut false reads.

**No HTTPS is required for the camera** — this is native camera access via an OS permission, not a browser secure-context capability. That is the whole point of the change.

**No offline scan queue in v1.** If the PC is unreachable, the scan fails loudly and is not retried later. A queue would mean the phone holds business events, which violates D1.

Disconnected-state message, listing the real causes in the order they actually occur:
- Cannot reach the PC
- Check the phone and PC are on the same Wi-Fi
- Check LAN scanner mode is enabled on the PC
- Check Windows Firewall / the network is set to **Private**
- Check the PC IP address has not changed

---

## 9. Networking plan

The app talks to the PC over the shop Wi-Fi. Nothing else.

- Configurable **PC IP** and **port** (default 3011). Never hard-code an IP — DHCP will change it.
- Base URL is always built as `http://<ip>:<port>` by a single helper, never string-concatenated at call sites.
- All three endpoints are relative to that base:
  - `POST {base}/api/v1/scanner/pair`
  - `POST {base}/api/v1/scanner/events`
  - `GET  {base}/api/v1/scanner/session`
- Sensible request timeout (~5 s) so an unreachable PC fails fast instead of hanging the UI.
- **Android cleartext HTTP**: Expo's default dev configuration permits cleartext traffic, but a release build may not. This must be verified before any APK is produced — it is a known trap, recorded as R-RN2 and gated at CP-RN10.

**Finding the IP.** The PC Scanner Hub already computes LAN address candidates ([lan-address.ts](backend/src/features/scanner/lan-address.ts)) and builds mobile URLs ([lan-listener.ts:154](backend/src/features/scanner/lan-listener.ts#L154)). The Hub shows the candidates; the user reads or copies the working one into the app. Multiple candidates are normal (Hyper-V, WSL, VPN adapters) — the Hub lists them all and the user picks.

Recommend a **router DHCP reservation** for the business PC so the IP is entered once and stays valid.

**Deferred:** encoding the base URL in a QR code the app could scan on the Setup screen. It is a genuinely nice fit — the app already has a camera — but it is not required for v1 and is an explicit approval point (OD-RN2).

HTTP is acceptable on the LAN for this phase. Security comes from: LAN-only listener, admin-enabled LAN mode, pairing code, session token, a four-route surface, no ERP data on the phone, and no JWT on the phone.

---

## 10. Security rules

The existing model is preserved exactly. The RN app is held to the same constraints the web page was.

1. The phone's session token is **not** a user JWT. It cannot satisfy `requireAuth` or `requireRole` — `requireScannerSession` never populates `req.user` ([scanner-session.middleware.ts](backend/src/features/scanner/scanner-session.middleware.ts)).
2. The phone cannot reach the main ERP API. :3001 is loopback-only; :3011 mounts four routes.
3. The phone cannot create, edit, archive, or price a product.
4. The phone cannot read customers, debts, payments, installments, suppliers, or the ledger.
5. The phone never receives price, cost, internal price code, stock, or supplier — `serializeScanResult()` is the ceiling.
6. The phone sends `{ code }` only. The server derives the match.
7. The token is stored as securely as practical (§11).
8. Clear-session / unpair is always available in Settings.
9. Revoked and expired sessions are handled cleanly: any `401` on `/events` or `/session` drops the stored token, returns the app to the Pairing screen, and shows "Session ended — pair again". The server intentionally returns one message for unknown, revoked, and expired; the app must not try to guess which.
10. Server-side limits the app must respect rather than fight: pairing 10/min/**IP**, events 60/min/**IP** (the limiter keys on `req.ip`, not the session — [scanner-rate-limit.ts:30](backend/src/features/scanner/scanner-rate-limit.ts#L30)), pairing code TTL 5 min, failed-pairing lockout 5 per IP per 15 min, session idle TTL 12 h, absolute cap 24 h, max 3 concurrent sessions, LAN auto-disable after 8 h idle.
11. Nothing sensitive is logged on the phone. No pairing code, no token, no full scanned code in any shipped log.

### Token storage — open decision (OD-RN4)

**Preferred: `expo-secure-store`** — Keystore/Keychain-backed, the right home for a bearer credential, one small first-party dependency.

**Alternative: `@react-native-async-storage/async-storage`** — plaintext in app-private storage. Acceptable only because the token is short-lived (12 h idle / 24 h hard cap), scoped to four scanner routes, revocable from the PC, and worthless off the shop LAN.

Recommendation: SecureStore for the token, AsyncStorage for non-secret settings (IP, port, device label). **Nothing is installed during planning** — this is a decision to make at CP-RN2.

---

## 11. Development workflow in VS Code

Goal: work on both the ERP and the mobile app from the same open workspace, without either breaking the other.

- The folder is created inside the HomeConnect repo root (at CP-RN2, not now).
- The same VS Code workspace opens both; Claude/Codex can read the backend contract and the mobile client side by side, which is the main reason the app lives in-repo rather than in a separate repository.
- **Mobile dependencies stay in `Mobile Scanner/package.json`.** They are never added to the root `package.json` without explicit approval. Expo pins its own React/React Native versions and would fight the root frontend's React version if merged.
- The folder gets its own `node_modules`, its own `tsconfig.json`, and its own lint config.
- Root scripts (`build`, `test`, `typecheck`, `lint`, `dist:win`) must behave identically before and after the folder exists. §14 lists the one change needed to guarantee that.

Scripts to define **inside** `Mobile Scanner/package.json`:

```
npm start          # expo start
npm run android    # expo start --android
npm run lint       # eslint on the app source
npm run typecheck  # tsc --noEmit
```

**Testing on a real Android phone (no Android Studio needed):**
1. Install **Expo Go** from the Play Store on the phone.
2. Run `npm start` from inside `Mobile Scanner`.
3. Phone and PC on the same Wi-Fi; scan the Expo dev QR with Expo Go.
4. In the app, enter the PC IP and port, pair, and scan a real shelf label.

**APK / standalone build:** Expo **EAS Build** is the path if a permanent install is wanted later. It is explicitly **not** part of this phase and requires separate approval — it brings an Expo account, a build queue, signing keys, and the cleartext-HTTP verification in R-RN2.

---

## 12. Relation to the existing mobile web page

**Recommendation: keep it, demote it, do not delete it in this phase.**

- `GET /mobile-scanner` on :3011 ([mobile-scanner.page.ts](backend/src/features/scanner/mobile-scanner.page.ts)) stays exactly as it is.
- It is repositioned as the **manual-entry fallback**: no install, works from any phone browser, useful when the app is not installed, the phone is a guest device, or Expo Go is unavailable.
- Its camera path stays in the code but is documented as unreliable over HTTP.
- Docs and Hub wording state plainly that **camera scanning is supported through the React Native app, not the web page**.
- Removal is a separate, reviewed decision (OD-RN6) once the app has been used in the shop for a while. Deleting it in the same phase that introduces an unproven replacement would remove the fallback exactly when it is most likely to be needed.

---

## 13. Scanner Hub updates (PC side)

Wording and guidance only. **No behavioural change to the Hub, and no new endpoint.**

The Hub should show:
- LAN mode status, with enable / disable (admin)
- LAN IP candidate list
- Copyable base URL (`http://<ip>:3011`)
- Pairing code with its countdown
- Paired devices, with revoke
- Recent scans
- Instructions for the **HomeConnect Mobile Scanner** app

Change the primary instruction from:

> Open this URL on your phone camera browser

to:

> Open the **HomeConnect Mobile Scanner** app and enter this PC address.

The old web URL stays visible, labelled as the manual-entry fallback. The primary mobile-camera path is the React Native app.

Touch points: the Scanner Hub page/panel under [frontend/src/features/scanner/](frontend/src/features/scanner/) and the `scanner` section of [business-labels.ts](frontend/src/shared/labels/business-labels.ts) (add label strings for the app instruction and the fallback note, following the existing `'English / عربي'` convention).

---

## 14. Repository hygiene — the one root change required

Everything else in the root project is safe because its scopes are explicit:

- `typecheck` → `tsconfig.json` includes only `frontend/src`; `tsconfig.server.json` includes only `backend/src`, `desktop/src`. ✅ unaffected
- `lint` → `eslint frontend/src backend/src desktop/src`. ✅ unaffected
- `build` / `dist:win` → Vite + tsc on those same scopes. ✅ unaffected

**The exception:** [vitest.config.ts](vitest.config.ts) excludes only `**/node_modules/**`, `**/dist/**`, `**/frontend/dist/**`. Root `npm test` would therefore discover and run any test file inside `Mobile Scanner/`, in the wrong environment and against the wrong config.

**Required change at CP-RN2** (the single approved edit to a root file in this phase):

```
exclude: ['**/node_modules/**', '**/dist/**', '**/frontend/dist/**', 'Mobile Scanner/**']
```

Also confirm at CP-RN2 that `Mobile Scanner/node_modules`, `.expo/`, `android/`, and `ios/` are git-ignored, and that [scripts/Build-SetupBundle.ps1](scripts/) and the electron-builder config do not sweep the repo root in a way that would pull the folder into the installer.

---

## 15. Documentation updates

Add an operator guide under [docs/](docs/) covering:

- How to run the Mobile Scanner app (Expo Go, dev server, same Wi-Fi)
- How to enable LAN scanner mode from the PC Scanner Hub
- How to find the PC IP address (Hub candidate list; DHCP reservation recommendation)
- How to pair with the 6-digit code
- How to scan with the phone camera
- How to use manual input as a fallback
- The Windows Firewall rule and the Private-network requirement (the Hub already surfaces the exact command — [lan-listener.ts:55](backend/src/features/scanner/lan-listener.ts#L55))

Troubleshooting section:
- Phone not on the same Wi-Fi
- Wrong PC IP (or the IP changed)
- Windows Firewall blocking 3011
- Network profile set to Public instead of Private
- LAN mode disabled, or auto-disabled after 8 h idle
- Pairing code expired (5-minute TTL) or already used
- Session revoked or expired → re-pair
- Camera permission denied → manual input
- Too many pairing attempts → generate a fresh code on the PC

Also explain, in plain language:
- The mobile **web** page cannot reliably use the camera because browsers block camera access on plain-HTTP pages.
- The React Native app solves this with a native camera permission.
- HTTP over the LAN is still used, and only to talk to the PC's scanner listener — it was never the cause of the camera problem.

Add one line in [README.md](README.md) pointing at the guide.

---

## 16. Implementation checkpoints

Each checkpoint is small, independently revertible, and ends by reporting. **Stop at each boundary.**

**CP-RN1 — Verify the backend contract. No code. ✅ COMPLETE — see §20. No backend change required.**
Re-read [scanner.lan.routes.ts](backend/src/features/scanner/scanner.lan.routes.ts), [scanner-session.middleware.ts](backend/src/features/scanner/scanner-session.middleware.ts), [scanner.validator.ts](backend/src/features/scanner/scanner.validator.ts), and `serializeScanResult` in [products.service.ts](backend/src/features/service/products/products.service.ts). Confirm the exact request/response shapes, status codes, headers, and rate limits the app must speak. Confirm **no backend change is needed**. Report any gap *before* writing app code — the default answer to a perceived gap is to adapt the client, not to add an endpoint.

**CP-RN2 — Create the app skeleton.**
Expo + TypeScript app at `Mobile Scanner/`. Its own `package.json`, `tsconfig.json`, `app.json`, `.gitignore`. Add the root Vitest exclusion (§14). Verify root `npm run typecheck`, `npm run lint`, and `npm test` are unchanged. Decide OD-RN4 (SecureStore vs AsyncStorage) here.

**CP-RN3 — Connection setup screen.**
IP/port fields, base-URL builder, validation, Test connection, persisted settings, status display.

**CP-RN4 — Pairing screen.**
`POST /api/v1/scanner/pair`; store the token; paired/unpaired status; unpair. Generic failure messaging.

**CP-RN5 — Scanner screen with native camera.**
`expo-camera` preview, permission flow with manual-input fallback, symbology restriction, manual input field.

**CP-RN6 — Send scans and show results.**
`POST /api/v1/scanner/events` with `X-Scanner-Session`; render the six safe fields; FOUND / NOT_FOUND / INVALID_CODE states. Verify end-to-end that the PC receives the event.

**CP-RN7 — Failure handling and guards.**
Session expired/revoked → drop token, return to Pairing. Network offline → the §8 message. Invalid code. Not found. Duplicate-scan guard and single-in-flight throttle. Rate-limit responses.

**CP-RN8 — Scanner Hub wording + docs.**
Update the Hub instruction text and labels (§13) and write the operator guide (§15). No Hub behaviour change.

**CP-RN9 — App typecheck, lint, and unit tests.**
`npm run typecheck` and `npm run lint` green inside `Mobile Scanner`. Add the pure-function tests in §17, running under the app's own test setup — never the root Vitest run.

**CP-RN10 — Real-phone verification and release notes.**
Run the full manual matrix in §17 on the shop's actual phone and the business PC. Verify Android cleartext-HTTP behaviour (R-RN2) before any thought of a standalone build. Write the release/readme instructions. **No version bump, no installer, no commit** without a separate instruction.

---

## 17. Testing plan

### Pure unit tests (inside `Mobile Scanner`, not the root run)

- Base URL validation: valid IPv4, invalid IPv4, out-of-range port, empty input, URL with a stray scheme or trailing slash
- Endpoint URL builder: pair / events / session paths from a given base
- Scan result mapping: FOUND / NOT_FOUND / INVALID_CODE → UI state; archived (`isActive: false`) → archived warning
- **Leak guard**: assert the result mapper renders only the six permitted fields and would ignore any extra field the server might one day send
- Error message mapping: network error, timeout, 401, 429, malformed envelope
- Duplicate-scan guard: same code inside the window is dropped; outside the window is sent; a different code is always sent
- Session state transitions: unpaired → paired → invalidated-by-401 → unpaired
- Barcode normalization **only if** the app mirrors it (recommendation: it should not — the server normalizes at [products.service.ts:167](backend/src/features/service/products/products.service.ts#L167), and a second implementation is a divergence risk; the app should trim whitespace and nothing more)

### Manual tests (the real verification)

1. Install and open the app on the phone
2. Enter the PC IP and port; Test connection succeeds
3. Enable LAN mode on the PC; generate a pairing code
4. Pair the phone
5. Scan a real shelf label with the camera → product FOUND on the phone and opened on the PC
6. Send a code via manual input
7. Scan an unknown barcode → NOT_FOUND
8. Send an invalid / over-long code → INVALID_CODE
9. Revoke the session from the PC → next scan returns the app to Pairing
10. Let a pairing code expire, then try it → rejected
11. Disable LAN mode → the app reports unreachable
12. Close the backend / desktop app → the app reports unreachable
13. Put the phone on a different Wi-Fi or mobile data → unreachable, with the correct guidance
14. Deny camera permission → manual input still fully works
15. Hold the camera on one label for several seconds → exactly one event recorded, not dozens
16. Confirm the PC Recent Scans shows the phone-sourced scans with the right source

**Unit tests do not prove this feature works.** Camera behaviour, permissions, Wi-Fi routing, and the firewall are only verified on real hardware. Do not report runtime verification on the strength of passing unit tests.

---

## 18. Out of scope

Not in this phase, and not to be added opportunistically:

- Any phone-side database, cache, or offline sync
- An offline scan queue
- Product create / edit / archive / pricing from the phone
- Customer, debt, payment, installment, supplier, or ledger access from the phone
- Sales checkout or order creation from the phone
- Inventory stock deduction or adjustment from the phone
- A React Native POS
- Cloud servers, public internet exposure, tunnels, port forwarding, UPnP, VPN
- HTTPS or local certificates
- Expo EAS production builds, app-store publishing, signing keys
- QR-code scanning of the base URL (OD-RN2 — separate approval)
- Any new **backend** endpoint (CP-RN1 gates this)
- Prisma migrations or any schema change
- Deleting the mobile web page (OD-RN6)
- Version bump, installer, or release

---

## 19. Risks and open decisions

**Risks**

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R-RN1 | The folder name's space breaks a script or tool path | Medium | Low | §6 path rules; quote everywhere; OD-RN5 holds a rename in reserve |
| R-RN2 | Android blocks cleartext HTTP in a release build | Medium | **High** if an APK is ever built | Dev via Expo Go is unaffected; verify explicitly at CP-RN10 before any standalone build |
| R-RN3 | Root `npm test` sweeps up mobile tests | **Certain** without action | Medium | §14 Vitest exclusion at CP-RN2 |
| R-RN4 | Expo/React version drift against the root frontend | Medium | Medium | Fully separate `node_modules` and `package.json`; never merge into root |
| R-RN5 | PC LAN IP changes via DHCP; the saved base URL goes stale | Medium | Medium | Editable in Settings; Hub shows live candidates; recommend a DHCP reservation |
| R-RN6 | Camera misreads or double-fires | Medium | Low | Restrict symbologies; duplicate-scan guard; single in-flight request |
| R-RN7 | Session expires mid-shift (12 h idle) | Low | Low | Clean re-pair flow; pairing takes seconds |
| R-RN8 | Scope creep — the app grows an ERP feature | Medium | **High** | §7's hard rules are binding; the LAN listener mounts four routes and nothing else, so growth is physically blocked server-side |
| R-RN9 | iOS support requested later | Medium | Medium | Expo covers iOS, but distribution outside TestFlight is genuinely hard; out of scope until asked |
| R-RN10 | Expo Go version drift vs the app's SDK | Low | Low | Pin the SDK; document the Expo Go version used in testing |

**Open decisions**

| # | Decision | Status |
| --- | --- | --- |
| OD-RN1 | Connection test: unauthenticated 401 probe against `/api/v1/scanner/session` vs a new ping route | **Resolved — 401 probe.** Verified in §20: the route carries no rate limit and returns a clean 401 envelope, so no backend change is needed. |
| OD-RN2 | QR-encoded base URL scanned on the Setup screen | **Deferred.** Out of scope; revisit only if pairing friction is observed. |
| OD-RN3 | Haptic feedback on a successful scan (extra dependency) | **Resolved — visual only for v1.** |
| OD-RN4 | Token storage: SecureStore vs AsyncStorage | **Resolved — `expo-secure-store` for the session token**, AsyncStorage for non-secret settings. The token is not a JWT and grants no ERP access, but it is a live scanner session credential and belongs in Keystore/Keychain. Install at CP-RN2, not before. |
| OD-RN5 | Folder name `Mobile Scanner` vs `mobile-scanner` | **Resolved — keep `Mobile Scanner`.** The space is approved. Quote paths in all docs and commands. Revisit only if tooling actually breaks. |
| OD-RN6 | Deprecate or delete the mobile web page | **Resolved — keep it** as the manual-entry fallback. Not deleted in this phase. |
| OD-RN7 | EAS Build for a standalone APK | **Deferred.** Not attempted until the Expo Go workflow has been used in the shop; gated with R-RN2 at CP-RN10. |
| OD-RN8 | `expo-router` vs a plain state-driven screen switch | **Recommend the plain switch** — four screens do not need a router. Confirm at CP-RN2. |

**Standing rule (approved):** if the app appears to need something the LAN contract does not offer, **adapt the client first**. A backend endpoint is added only if the existing contract genuinely cannot support the app, and only with explicit approval.

---

## 20. CP-RN1 verification record

**Result: the existing LAN scanner contract fully supports the planned app. No backend change is required.**

Verified by reading [scanner.lan.routes.ts](backend/src/features/scanner/scanner.lan.routes.ts), [lan-listener.ts](backend/src/features/scanner/lan-listener.ts), [scanner.service.ts](backend/src/features/scanner/scanner.service.ts), [scanner-session.middleware.ts](backend/src/features/scanner/scanner-session.middleware.ts), [scanner-rate-limit.ts](backend/src/features/scanner/scanner-rate-limit.ts), [scanner.validator.ts](backend/src/features/scanner/scanner.validator.ts), [scanner.routes.ts](backend/src/features/scanner/scanner.routes.ts), [error.middleware.ts](backend/src/middleware/error.middleware.ts), [validate.middleware.ts](backend/src/middleware/validate.middleware.ts), [scan-code.ts](backend/src/lib/scan-code.ts), and `scanLookup` / `serializeScanResult` in [products.service.ts](backend/src/features/service/products/products.service.ts).

### 20.1 Confirmed present

- Separate LAN listener on :3011, own Express instance, four routes only ([lan-listener.ts:70-83](backend/src/features/scanner/lan-listener.ts#L70-L83))
- Pairing with a 6-digit single-use code, 5-minute TTL, constant-time hash comparison, one indistinguishable failure message ([scanner.service.ts:57-124](backend/src/features/scanner/scanner.service.ts#L57-L124))
- Scanner sessions: opaque 32-byte token, only `sha256` stored, sliding 12 h idle window capped at 24 h absolute ([scanner.service.ts:109-145](backend/src/features/scanner/scanner.service.ts#L109-L145))
- Scanner events recorded with source `PHONE_SCANNER` and a server-derived status
- Safe serialization: `serializeScanResult()` returns seven keys and no more ([products.service.ts:671-682](backend/src/features/service/products/products.service.ts#L671-L682))
- No pricing, cost, internal price code, stock, supplier, notes, or image is reachable from :3011

### 20.2 The frozen contract (what the app must speak)

Base URL: `http://<PC-LAN-IP>:3011`

**`POST /api/v1/scanner/pair`** — no auth

| | |
| --- | --- |
| Body | `{ "code": string (trimmed, 1–12), "deviceLabel"?: string (trimmed, ≤40) }` |
| 201 | `{ success: true, data: { token, expiresAt (ISO), deviceLabel } }` |
| 401 | `UNAUTHORIZED` — `"Pairing failed"` (wrong / expired / already used / never issued — deliberately indistinguishable) or `"Too many failed pairing attempts. Try again later."` |
| 400 | `VALIDATION_ERROR` — missing or over-length code; also `"Device label is required"` if the label is only control characters |
| 429 | `RATE_LIMITED` — 10/min/IP |

The route substitutes `"Phone scanner"` when `deviceLabel` is absent or blank. Failed pairing attempts are counted 5 per IP per 15 minutes; rate-limited attempts are *not* counted, so a caller cannot extend its own lockout.

**`POST /api/v1/scanner/events`** — `X-Scanner-Session: <token>`

| | |
| --- | --- |
| Body | `{ "code": string (trimmed, 1–64) }` — **one field only**; Zod strips anything else |
| 200 | `{ success: true, data: { status, normalizedCode, matchedBy, alsoMatchedSku?, product } }` |
| `status` | `"FOUND" \| "NOT_FOUND" \| "INVALID_CODE"` |
| `matchedBy` | `"BARCODE" \| "SKU" \| null` |
| `product` | `{ id, name, model, sku, barcode, brand, isActive }` or `null` |
| 401 | `UNAUTHORIZED` — `"Scanner session required"` (no header) / `"Scanner session is not valid"` (unknown, revoked, or expired — one message for all three) |
| 400 | `VALIDATION_ERROR` (code empty or > 64 chars) or `INVALID_JSON` |
| 413 | `PAYLOAD_TOO_LARGE` (body over 4 KB) |
| 429 | `RATE_LIMITED` — 60/min/IP |

Middleware order is `requireScannerSession` → `rateLimit` → `validate`, so an unauthenticated flood is answered 401, never 429.

**`GET /api/v1/scanner/session`** — `X-Scanner-Session: <token>`

| | |
| --- | --- |
| 200 | `{ success: true, data: { deviceLabel, expiresAt (ISO) } }` |
| 401 | `UNAUTHORIZED`, as above |
| Rate limit | **None.** Safe as a heartbeat and as the connection probe. |

**Error envelope (every failure):**
`{ success: false, error: { code, message, details? }, meta: { timestamp } }`

Codes the app will encounter: `UNAUTHORIZED` (401), `VALIDATION_ERROR` (400), `INVALID_JSON` (400), `PAYLOAD_TOO_LARGE` (413), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500).

### 20.3 Server-side normalization — the app must not reimplement it

[scan-code.ts](backend/src/lib/scan-code.ts) is authoritative and stricter than the Zod schema:

- Strips C0/C1 control characters, zero-width characters, and the BOM; then trims
- **Minimum 4 characters**, maximum 64, after stripping
- Charset is exactly `^[A-Za-z0-9-]+$` — a space, dot, slash, or underscore is rejected
- Case is never folded and leading zeros are never stripped (EAN-13/UPC-A depend on them)

Two consequences the app must handle, because "invalid" arrives by **two different routes**:

1. A code of 1–3 characters, or containing a disallowed character, **passes Zod and returns `200` with `status: "INVALID_CODE"`**.
2. A code over 64 characters is rejected earlier by Zod and returns **`400 VALIDATION_ERROR`**.

The app therefore trims whitespace and nothing else, sends the code as scanned, and maps both outcomes to the same "invalid code" UI state. A second normalizer on the phone would be a divergence risk with no upside.

### 20.4 Findings that shape the client

- **No CORS middleware on the LAN app.** Irrelevant for React Native — a native `fetch` is not origin-restricted and sends no preflight — which is *why* no backend change is needed. It is also a concrete reason never to reimplement this app as a WebView pointed at a different origin.
- **No JSON 404 handler on the LAN app.** An unknown path returns Express's default HTML. The app must call only the three documented paths and must not assume every response is JSON. This reinforces OD-RN1: probe a real route, not an invented `/ping`.
- **Every LAN request resets the 8 h idle auto-disable timer** ([lan-listener.ts:96-103](backend/src/features/scanner/lan-listener.ts#L96-L103)), including an unauthenticated 401 probe. The app must therefore **not** poll `/session` on a background timer — that would silently hold LAN mode open indefinitely and defeat a deliberate safety control. Probe only on an explicit user action (Test connection) or immediately before a scan session begins.
- **Pairing a fourth device silently revokes the least-recently-seen session** ([scanner.service.ts:202-209](backend/src/features/scanner/scanner.service.ts#L202-L209)). A `401` is therefore ordinary operational traffic, not an error condition — the app must return calmly to the Pairing screen rather than showing a fault.
- **Disabling LAN mode revokes every session and clears the pairing code** ([lan-listener.ts:241-264](backend/src/features/scanner/lan-listener.ts#L241-L264)). After the PC toggles LAN mode off and on, every phone must re-pair. This is intended.
- **The 24 h absolute cap cannot be slid past.** A phone in continuous use will still be logged out once per day mid-shift; re-pairing takes seconds.
- **`alsoMatchedSku: true`** appears when a code is one product's barcode and a *different* product's SKU. Barcode wins. The app should surface a small note rather than hide the ambiguity.
- **`isActive: false`** means an archived product was matched — render it as an "Archived" warning, never as not-found.

### 20.5 Folder structure — confirmed

As specified in §6: `Mobile Scanner/` at the repository root (name approved with the space), with `app/`, `components/`, `src/{api,lib,storage,types}/`, `assets/`, and its own `package.json`, `tsconfig.json`, `app.json`, `.gitignore`. Dependencies stay inside the folder and are never added to the root [package.json](package.json).

Root-scope safety re-confirmed: `tsconfig.json` includes only `frontend/src`; `tsconfig.server.json` only `backend/src` and `desktop/src`; `lint` names its three directories explicitly. The sole required root edit is the [vitest.config.ts](vitest.config.ts) exclusion (§14), approved for CP-RN2.

### 20.6 Expo package choices — confirmed for CP-RN2

**Nothing is installed until CP-RN2 is approved.**

| Package | Purpose | Status |
| --- | --- | --- |
| Expo managed template + TypeScript | App skeleton | Confirmed |
| `expo-camera` | Camera preview + barcode scanning in one dependency | Confirmed |
| `expo-secure-store` | Scanner session token | **Approved (OD-RN4)** |
| `@react-native-async-storage/async-storage` | Non-secret settings: IP, port, device label | Confirmed |
| `expo-router` | Navigation | Not recommended — a plain state-driven switch suits four screens (OD-RN8) |
| `expo-haptics` | Scan feedback | Rejected for v1 (OD-RN3) |

Symbologies to enable: EAN-13, EAN-8, UPC-A, Code 128 (plus QR only if shop labels use it).

### 20.7 CP-RN1 conclusion

No gap was found between what the app needs and what the LAN contract provides. **CP-RN1 closes with no backend change.** The next step, CP-RN2, requires separate approval before any folder is created or any package installed.

---

---

## 21. Plan update summary — what changed from the mobile-web direction

**The change:** mobile camera scanning moves from the LAN-served mobile web page to a **React Native / Expo app** at `HomeConnect/Mobile Scanner/`.

**Why:** the mobile web page is served over plain HTTP on the LAN (`http://192.168.x.x:3011/mobile-scanner`). Mobile browsers block camera access outside a secure context, so `getUserMedia` / `BarcodeDetector` cannot be relied on there. This was the previous plan's highest-likelihood risk (old R1), and its two workarounds — a per-phone Chrome flag, or self-signed HTTPS with a per-phone interstitial and an expiring certificate — were both ongoing maintenance for a barcode feature. A native app gets the camera through an ordinary OS permission and does not care that the API is HTTP.

**What is superseded:**
- Old §5's "Option A — mobile web scanner, Expo deferred" is reversed: **Expo is the primary mobile-camera path.**
- Old §13's camera options 13a (Chrome flag) and 13b (self-signed HTTPS) are **dropped**. Option 13c (defer to Expo) is what is now being built.
- The old CP1–CP10 sequence is **retired** — its backend work is already implemented in [backend/src/features/scanner/](backend/src/features/scanner/) — and is replaced by CP-RN1…CP-RN10, which build a client only.
- "React Native / Expo app" moves **out of** the out-of-scope list and **into** the deliverable.

**What is unchanged, deliberately:**
- The backend stays authoritative and needs **no changes**. The RN app speaks the existing LAN contract: `POST /api/v1/scanner/pair`, `POST /api/v1/scanner/events`, `GET /api/v1/scanner/session`, with `X-Scanner-Session`.
- The phone still connects over the same Wi-Fi to the PC on **port 3011**, over HTTP.
- The phone remains **scanner-only**: no database, no offline sync, no ERP permissions, no JWT, no direct PostgreSQL access.
- The response minimization holds — the phone sees only `name`, `model`, `brand`, `sku`, `barcode`, `isActive`. No price, cost, or stock.
- The security model is untouched: LAN mode off by default, admin-enabled, pairing code, opaque session token, four-route surface, rate limits, revocation.
- The business PC remains the only database owner, and **no migration is required** — which continues to matter given that machine's unresolved migration state.
- The USB/keyboard-wedge scanner path on the PC is unaffected.

**What is newly required:**
- A `Mobile Scanner/` folder in the repo root, with its own dependencies and scripts, isolated from the root `package.json` (§6, §11).
- One root-file edit: excluding `Mobile Scanner/**` from the root Vitest run (§14) — without it, `npm test` would sweep the app's tests into the wrong environment.
- Scanner Hub wording pointing at the app instead of a phone browser, and an operator guide with the firewall/IP/pairing/camera troubleshooting matrix (§13, §15).

**What is kept as a fallback:** the existing mobile web page stays, demoted to manual-entry-only, and is not deleted in this phase.
