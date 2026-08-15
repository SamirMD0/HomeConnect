# Codex Implementation Prompt — Mobile Scanner React Native App

Copy everything below the line into Codex.

**Start CP-RN1 only. Do not implement beyond CP-RN1 until the user approves.**

---

You are implementing a **standalone React Native (Expo) barcode scanner app** for the **HomeConnect**
repository. The phone app talks to the existing HomeConnect PC backend over the shop LAN. It is a scanner
peripheral with a screen — nothing more.

## Why this work, and not the financial work

HomeConnect's next financial feature (`claude/plans/financial-truth-foundation-plan.md`) is **paused: the
business currently carries high active customer debts**, and any change to payments, balances, or dashboard
cash figures is high-risk while that is true.

This project was chosen **because it cannot touch a financial record.** That property is the point of the
work, not a side effect. Preserve it in every checkpoint.

## Absolute boundaries — violating any of these fails the task

**Do not modify, read for the purpose of changing, or write to any of the following:**

- `backend/src/features/financial/**` — debts, payments, allocations, installments, prepaid, receivables,
  corrections, ledger, customer summary
- `backend/src/features/sales/**` — in particular `SalesOrder.paidAmount`
- `backend/src/features/service/service-jobs/**` — in particular `ServiceJob.finalPrice`
- `backend/src/features/dashboard/**` — any financial figure or aggregate
- `backend/prisma/schema.prisma` and `backend/prisma/migrations/**` — **no migrations, none, for any reason**
- The business database

**Do not** create a migration, alter a table, seed data, or run anything against a live database.

If a task appears to require any of the above, **stop and report** rather than proceeding. There is no
version of this feature that needs a schema change.

## What you are building

An Expo + TypeScript app that:

1. Connects to the PC's scanner LAN listener over the shop network
2. Pairs once using a pairing code shown on the PC's Scanner Hub screen
3. Scans barcodes with the phone camera, with manual text entry as a fallback
4. Sends the scanned code to the PC and displays the product the PC matched

That is the entire product.

## What the phone is NOT

- **Not an ERP client.** No customers, debts, payments, sales orders, or service jobs. Ever.
- **No product editing.** Read-only lookup results, nothing writable.
- **No phone database.** No SQLite, no WatermelonDB, no Realm, no local product cache.
- **No offline sync.** If the LAN is unreachable, the app says so and waits. It does not queue, replay, or
  reconcile.
- **Not a second login.** A scanner session is not a user session and cannot become one.

The phone reports a code and learns an outcome. It never asserts what it matched, and it never holds
business state.

## Verified backend contract — do not re-derive these incorrectly

Confirmed against the repository at version 1.6.0. **CP-RN1 exists to verify these are still exact.**

**LAN listener port:** `3011` — `SCANNER_LAN_PORT` in
[backend/src/features/scanner/lan-listener.ts:11](backend/src/features/scanner/lan-listener.ts#L11),
overridable via `SCANNER_LAN_PORT`. This is a **separate listener from the main API port** and must be
enabled by an admin on the PC first (`POST /api/v1/scanner/lan/enable`, admin-only, on the main API).

**Endpoints, all on the LAN listener** — [scanner.lan.routes.ts](backend/src/features/scanner/scanner.lan.routes.ts):

| Method | Path | Auth | Rate limit |
|---|---|---|---|
| `POST` | `/api/v1/scanner/pair` | none (pairing code in body) | 10 / 60s |
| `POST` | `/api/v1/scanner/events` | scanner session header | 60 / 60s |
| `GET` | `/api/v1/scanner/session` | scanner session header | — |
| `GET` | `/mobile-scanner` | none | — (existing HTML fallback page; leave it alone) |

**Session header:** `x-scanner-session` — `SCANNER_SESSION_HEADER` in
[scanner-session.middleware.ts:6](backend/src/features/scanner/scanner-session.middleware.ts#L6).
**It is NOT `Authorization: Bearer`** — the middleware explicitly does not look at that header. Sending a
bearer token will fail with "Scanner session required".

**Pair request/response:**

```
POST /api/v1/scanner/pair
{ "code": "<pairing code from the PC>", "deviceLabel": "<optional>" }

201 → { "success": true, "data": { "token": "…", "expiresAt": "…", "deviceLabel": "…" } }
```

The session **id** is deliberately absent from the response — the phone has no use for it. Do not try to
obtain or store one.

**Scan request/response:**

```
POST /api/v1/scanner/events
x-scanner-session: <token>
{ "code": "<scanned or typed code>" }

200 → { "success": true, "data": { status, normalizedCode, matchedBy, product } }
```

**Send `{ code }` and nothing else.** The server does the lookup
([scanner.lan.routes.ts:79](backend/src/features/scanner/scanner.lan.routes.ts#L79)).

**`status` values:** `INVALID_CODE`, `NOT_FOUND`, and a match status. `product` is `null` for the first two.

**The product payload is exactly these eight fields** — `serializeScanResult` at
[products.service.ts:671-681](backend/src/features/service/products/products.service.ts#L671-L681):

```
id, name, model, sku, barcode, brand, isActive
```

**Display only those.** There is no price, cost, `stockQuantity`, `costPrice`, notes, specifications, or
internal field in this payload, and the backend is deliberately built so none can leak in. **Do not add a
field to the phone UI that the payload does not contain, and do not call any other endpoint to enrich it.**
If a product detail seems missing, that is the security design working correctly.

## Project rules

1. **All mobile code lives in `Mobile Scanner/`** at the repository root. Create it if absent.
2. **`Mobile Scanner/package.json` is its own package.** Every Expo and React Native dependency goes there.
   **Do not add a single mobile dependency to the root `package.json`.**
3. **Do not modify the root build, lint, or typecheck pipeline** beyond one narrow exception: if the root
   Vitest run starts trying to collect files under `Mobile Scanner/`, add an exclusion — and *only* that.
4. **Expo + TypeScript.** Strict mode on. No JavaScript-only files.
5. **Store the session token with `expo-secure-store`** if it is available and approved. If it is not, stop
   and ask — **do not fall back to `AsyncStorage` or plain files for a session token** without approval.
6. **The PC IP and port are user-entered and persisted**, defaulting the port to `3011`. Never hardcode an IP.
7. **No analytics, no crash reporting, no telemetry, no remote logging.** This app runs on a shop LAN.
8. **No new backend endpoints.** Reuse what exists. If something seems missing, report it — do not add it.
9. **Do not commit. Do not bump any version. Do not build an APK or IPA** unless explicitly approved.

## Checkpoints

**Each checkpoint is a gate. Complete it, report, and wait for approval before starting the next.**

### CP-RN1 — Contract verification *(this checkpoint only, right now)*

**No code. No files created. No `Mobile Scanner/` folder yet.**

Read and verify:

- [backend/src/features/scanner/scanner.lan.routes.ts](backend/src/features/scanner/scanner.lan.routes.ts)
- [backend/src/features/scanner/scanner-session.middleware.ts](backend/src/features/scanner/scanner-session.middleware.ts)
- [backend/src/features/scanner/lan-listener.ts](backend/src/features/scanner/lan-listener.ts)
- [backend/src/features/scanner/scanner.service.ts](backend/src/features/scanner/scanner.service.ts)
- [backend/src/features/scanner/scanner.validator.ts](backend/src/features/scanner/scanner.validator.ts)
- `serializeScanResult` in [backend/src/features/service/products/products.service.ts](backend/src/features/service/products/products.service.ts)
- [backend/src/features/scanner/scanner-rate-limit.ts](backend/src/features/scanner/scanner-rate-limit.ts)
- [docs/setup/MOBILE_SCANNER_SETUP.md](docs/setup/MOBILE_SCANNER_SETUP.md)

Report, with `file:line` citations:

1. **Confirm or correct** every row of the contract table above — paths, methods, header name, port.
2. The **exact request schema** each endpoint validates (from `scanner.validator.ts`), including field names,
   types, and length limits.
3. The **exact response shape** of pair, events, and session — including the error shape on failure.
4. **Every `status` value** `scanLookup` can return, and what `matchedBy` contains for each.
5. **How a pairing code is produced and how long it lives** — where the PC displays it, its format, its TTL.
6. **Session lifetime**, how `expiresAt` is set, what `touchSession` does to it, and how an admin revokes.
7. **Rate limits and their exact responses** — status code and body when a limit is hit, so the app can
   handle them rather than showing a generic failure.
8. **Whether the LAN listener must be explicitly enabled**, and what the phone sees if it is not.
9. **Anything in this prompt that is wrong.** Say so plainly.

Then propose the `Mobile Scanner/` folder structure and dependency list for CP-RN2 — **as a proposal, not as
files.**

**Stop after CP-RN1 and wait for approval.**

---

### The remaining checkpoints — for context only, do not start them

| CP | Scope |
|---|---|
| **CP-RN2** | Expo + TypeScript skeleton in `Mobile Scanner/`, isolated `package.json` and scripts. Root Vitest exclusion only if genuinely needed |
| **CP-RN3** | Connection setup screen: PC IP + port entry, persistence, and a connection test |
| **CP-RN4** | Pairing screen using `POST /api/v1/scanner/pair`, token stored via `expo-secure-store` |
| **CP-RN5** | Scanner screen: native camera barcode scanning with manual text-entry fallback |
| **CP-RN6** | Send `{ code }` to `POST /api/v1/scanner/events`, render the seven safe fields only |
| **CP-RN7** | Error states: session expired, session revoked, network offline, invalid code, product not found, duplicate-scan suppression |
| **CP-RN8** | Docs, and PC Scanner Hub text pointing users at the app — **text only, no financial or backend logic** |
| **CP-RN9** | Typecheck, lint, and focused tests where practical |
| **CP-RN10** | Manual real-phone verification checklist. **No release build unless approved** |

## Verification

From CP-RN2 onward, inside `Mobile Scanner/`:

```
npm run typecheck
npm run lint
npm test          # where tests exist
```

The **root** repository checks must remain green and unchanged throughout:

```
npm run lint
npm run typecheck
npm test
npm run build
```

If a root check breaks, you have violated a boundary. Stop and revert rather than adjusting the root config.

## Manual verification (CP-RN10)

The real test is a phone in a hand on the shop floor, not a simulator:

- [ ] Phone and PC on the same LAN; PC LAN listener enabled by an admin
- [ ] Setup screen accepts the PC IP, defaults the port to `3011`, connection test succeeds
- [ ] Wrong IP produces a clear, non-technical message
- [ ] Pairing with a valid code succeeds; token persists across an app restart
- [ ] Pairing with a wrong code fails clearly and does not consume the real code
- [ ] Camera scans a real product barcode and returns the correct product
- [ ] Manual entry of a SKU returns the same product
- [ ] Unknown barcode shows *not found*, not an error screen
- [ ] Malformed code shows *invalid code*
- [ ] **The result shows only:** name, model, SKU, barcode, brand, active state. **No price, no cost, no
      stock** — verify this by eye on the phone, on a product that has all of them set
- [ ] Wi-Fi turned off mid-session produces an offline state, and recovers when restored
- [ ] Admin revokes the session on the PC → phone reports session invalid and returns to pairing
- [ ] Rapid repeat scans of the same code do not spam the PC
- [ ] Rate limit hit produces a readable message, not a crash

## Stop and report

- Any task appears to need a backend, schema, or migration change
- Any task appears to touch a financial module, a customer balance, or a dashboard figure
- `expo-secure-store` is unavailable and a token would have to be stored less securely
- The backend contract differs from this prompt in any way
- A root-level check breaks

Report at the end of CP-RN1: what you verified, what this prompt got wrong, and the proposed structure for
CP-RN2. Then stop.
