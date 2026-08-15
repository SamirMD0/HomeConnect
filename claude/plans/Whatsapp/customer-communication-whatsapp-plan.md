# Customer Communication (WhatsApp) — Planning Document

**Status:** Planning only. No code, no migrations, no tests, no build, no version bump.
**Date:** 2026-08-12
**Scope:** Add a *Customer Communication / تواصل الزبون* section inside the Customer Profile that generates WhatsApp-ready Arabic/English messages from existing customer + financial data, allows manual override and editing, then opens WhatsApp via deep link. The employee sends manually.

---

## 1. Executive summary

This is a **message-composition feature, not a messaging integration**. HomeConnect never sends anything. It:

1. reads values the backend already computes (outstanding, overdue days, next due, last payment),
2. renders them into fixed bilingual templates,
3. lets the employee override every value **for the message text only**,
4. hands the finished text to WhatsApp through a deep link and stops there.

No WhatsApp Business API, no Meta API, no WhatsApp Web automation, no scraping, no delivery receipts, no reply reading, no bulk or scheduled sending.

**Three findings from the repo scan drive the whole design:**

| # | Finding | Consequence |
|---|---|---|
| **F1** | [window.ts:46](desktop/src/window.ts#L46) sets `setWindowOpenHandler(() => ({ action: 'deny' }))`, and CSP is `default-src 'self'` ([content-security-policy.ts:47](desktop/src/content-security-policy.ts#L47)). There is **no `shell.openExternal` anywhere** in the desktop layer. | `window.open('https://wa.me/…')` and `<a target="_blank">` **will silently do nothing** in the packaged app. A plain `<a href>` is worse — it would navigate the app window away from HomeConnect (there is no `will-navigate` guard). Opening WhatsApp **requires a new, allowlisted IPC channel**. This is the single real engineering task in the feature. |
| **F2** | `CustomerFinancialSummary` ([customer-financial.types.ts:26](frontend/src/features/customer-financial/types/customer-financial.types.ts#L26)) already exposes `totalOutstanding`, `overdueAmount`, `nextDueDate`, `nextDueAmount`, `lastPaymentDate`, `daysSinceLastPayment`, plus `debts[]`, `installmentPlans[].scheduleSummary.nextInstallment`, `overdueItems[].daysOverdue`, and `recentPayments[]`. | **No new backend endpoint is needed for message defaults.** Reuse `useCustomerFinancialSummary`. Backend stays the single source of financial truth; the message layer only formats. |
| **F3** | `ActivityLog` ([schema.prisma:392](backend/prisma/schema.prisma#L392)) already has `userId`, `action`, `entityType`, `entityId`, `details Json`, `createdAt`. | A communication log can be stored **with zero migrations**. Given that the business PC's schema was built by hand-run repair scripts and `prisma migrate` dead-ends there (see project memory), avoiding a new table is worth a great deal. **Recommendation: log via `ActivityLog`, not a new `CustomerCommunicationLog` table.** |

---

## 2. Where it lives in the UI

[CustomerProfilePage.tsx](frontend/src/pages/customers/CustomerProfilePage.tsx) currently renders, top to bottom:

```
Header card (name, phone, Copy phone button)      ← line ~94
Financial Actions section (emerald card)           ← line ~151
Details tab  |  CustomerFinancialProfile           ← line ~182 / ~218
CustomerServiceJobsSection                         ← line 225
CustomerSalesOrdersSection                         ← line 226
```

**Placement:** insert `<CustomerCommunicationSection customerId={customer.id} />` **between the Financial Actions section and the tab content** (after line 180), as a *collapsed-by-default* card. Rationale: it is an action, so it belongs with Financial Actions; but it is longer than one row of buttons, so it must not push the financial tabs below the fold when unused.

The header card already has a Copy-phone button at [line 117](frontend/src/pages/customers/CustomerProfilePage.tsx#L117). Add a small WhatsApp icon button next to it as a **shortcut that opens the section pre-set to Debt reminder** — it must not open WhatsApp directly, because that would skip review.

### Section layout (collapsed → expanded)

```
┌─ تواصل الزبون / Customer Communication ────────────── [▾] ─┐
│  محمد سالم عمار   ·   70-123-456   ·   [copy] [WhatsApp]   │
├────────────────────────────────────────────────────────────┤
│  1. Message type   [ Debt reminder ▾ ]                     │
│     Language [ AR | EN | AR+EN ]   Tone [ polite ▾ ]       │
├────────────────────────────────────────────────────────────┤
│  2. Data source                                            │
│     ( ) Total outstanding        1,250,000 LBP             │
│     ( ) Specific debt            [ select ▾ ]              │
│     ( ) Specific installment     [ select ▾ ]              │
│     ( ) Manual amount            [________]                │
├────────────────────────────────────────────────────────────┤
│  3. Message values  ⓘ This changes the message only /      │
│                       هذا يغيّر الرسالة فقط                 │
│     Name in message  [ أبو سالم        ] (default: محمد…)  │
│     Phone            [ 70123456        ] → +961 70 123 456 │
│     Amount           [ 1,250,000       ]                   │
│     Date added       [ 2026-05-02      ]                   │
│     Due date         [ 2026-06-02      ]                   │
│     Days late        [ 71              ]                   │
│     Custom note      [                 ]                   │
│                                          [ Reset overrides ]│
├────────────────────────────────────────────────────────────┤
│  4. [ Generate message ]                                   │
│     ┌ Preview / معاينة الرسالة  (editable, dir="auto") ──┐ │
│     │ مرحباً أبو سالم، معك HomeConnect. ...              │ │
│     └───────────────────────────────────────────────────┘ │
│     Sending to: +961 70 123 456   ⚠ differs from saved     │
│     [ Copy message ]  [ Open WhatsApp ]  [ Save note ]     │
└────────────────────────────────────────────────────────────┘
```

**Non-negotiable UI rules**

- The generated text lands in an **editable `<textarea dir="auto">`**, never a read-only preview. Employee edits win over regeneration until they press Generate again (Generate must warn before discarding manual edits).
- **Every override field shows the database default next to it**, greyed. The employee must be able to see at a glance that they typed `أبو سالم` while the record says `محمد سالم عمار`.
- **The resolved phone number is displayed in full, normalized, immediately above the WhatsApp button.** Wrong-number sends are the top privacy risk in this feature.
- If the phone override differs from `customer.phone`, show an inline warning and require a second click / confirm checkbox before Open WhatsApp is enabled.
- Open WhatsApp is **disabled** when: no phone, phone fails normalization, or message body is empty.
- Copy message is **always enabled** when there is text — it is the guaranteed-working escape hatch when WhatsApp Desktop is missing.

---

## 3. Override model — the core of the feature

The user's requirement is explicit: the message value is *not* necessarily the database value. The business may ask for a partial amount, use a nickname, or reference a different date.

```
MessageDraft = {
  type, language, tone,
  source: { kind: 'TOTAL' | 'DEBT' | 'INSTALLMENT' | 'MANUAL', id?: string },
  defaults:  { …computed from CustomerFinancialSummary, read-only… },
  overrides: { name?, phone?, amount?, dateAdded?, dueDate?, daysLate?,
               paymentDate?, remainingAmount?, serviceStatus?, customNote? },
  body: string   // rendered, then freely edited by the employee
}
```

**Resolution rule:** `effective(field) = overrides[field] ?? defaults[field]`. A cleared override falls back to the default; it does not become empty.

**Hard invariants**

1. `defaults` is derived from the fetched summary and is **never mutated**. Resolution returns a new object. (There is a unit test for exactly this.)
2. Overrides are **message-text-only**. Nothing in this feature writes to `Debt`, `Payment`, `Installment`, `InstallmentPlan`, `Customer`, or any dashboard aggregate. If the employee wants to change real data, they use the existing financial edit flows (which require reason + `accountPassword` — see `UpdateDebtRequest`).
3. Because amounts arrive as **decimal strings** (`totalOutstanding: string`, `remainingBalance: string`), the message layer **formats but never computes**. No `parseFloat` arithmetic, no re-deriving `remainingAmount = amount - paid`. If a number isn't in the summary, it isn't in the template — or the employee types it as a manual override.
4. Switching the data source **resets amount/date overrides to the new source's defaults** and tells the user it did so. Silently carrying a debt's amount over to an installment selection is a data-accuracy bug waiting to happen.

---

## 4. Templates and placeholder system

Deterministic string substitution. No AI generation in the app. (AI-assisted rewrite is explicitly future work, not now.)

### Placeholders

`[customerName]` `[amount]` `[remainingAmount]` `[dateAdded]` `[dueDate]` `[daysLate]` `[paymentDate]` `[lastPaymentDate]` `[serviceStatus]` `[customNote]` `[businessName]`

**Rendering rules**

- Unknown placeholder → left **verbatim** in the output (never `undefined`, never blank), so a template typo is visible in preview rather than silently producing a broken sentence.
- Known placeholder with no value → the **whole line is dropped**, not left with a hole. `[customNote]` empty must not leave a dangling empty line; a missing `[dueDate]` must not produce "تاريخ الاستحقاق هو ." — this is a line-level, not token-level, renderer.
- `[businessName]` = `HomeConnect` (constant for v1; candidate for a settings value later).

### Formatting

- **Amounts:** existing app currency formatting, thousands separators, Western digits. Do **not** inject Unicode bidi isolate characters (U+2068/U+2069) around numbers — they survive into the WhatsApp text and can render as stray marks on some clients. Accept native bidi rendering and verify visually on a real device during manual testing.
- **Dates:** `en-GB` style `DD/MM/YYYY`, consistent with `toLocaleDateString('en-GB')` used at [CustomerProfilePage.tsx:204](frontend/src/pages/customers/CustomerProfilePage.tsx#L204).
- **Days late:** Arabic needs `يوم` vs `أيام` handling. Simplest correct-enough form for v1: `متأخر منذ 71 يوم` (invariant `يوم`), which is acceptable colloquially. Flag for the user; do not build a full pluralization engine.

### The six templates

Tone (`polite` / `firm` / `short` / `friendly`) selects a variant of the same template, not a different message type. Arabic should read as natural Lebanese business Arabic — warm, not classical-formal.

**1 — Debt reminder / تذكير بالدين**

```
EN: Dear [customerName], this is [businessName].
    You have an outstanding bill of [amount] from [dateAdded].
    The due date is [dueDate].
    Please arrange the payment when possible. Thank you.

AR: مرحباً [customerName]، معك [businessName].
    يوجد عليكم مبلغ [amount] من تاريخ [dateAdded].
    تاريخ الاستحقاق هو [dueDate].
    يرجى ترتيب الدفع عند الإمكان. شكراً لكم.
```

**2 — Late payment reminder / تذكير بتأخير الدفع**

```
EN: Dear [customerName], this is [businessName].
    Your payment of [amount] has been overdue for [daysLate] days.
    Please contact us to arrange payment. Thank you.

AR: مرحباً [customerName]، معك [businessName].
    يوجد عليكم مبلغ [amount] متأخر منذ [daysLate] يوم.
    يرجى التواصل معنا لترتيب الدفع. شكراً لكم.
```

**3 — Payment confirmation / تأكيد الدفع**

```
EN: Dear [customerName], [businessName] confirms receiving [amount] on [paymentDate].
    Remaining balance: [remainingAmount]. Thank you.

AR: مرحباً [customerName]، تؤكد [businessName] استلام مبلغ [amount] بتاريخ [paymentDate].
    المبلغ المتبقي: [remainingAmount]. شكراً لكم.
```

**4 — Installment reminder / تذكير بالقسط**

```
EN: Dear [customerName], this is [businessName].
    Your installment payment of [amount] is due on [dueDate].
    Please arrange payment when possible.

AR: مرحباً [customerName]، معك [businessName].
    قسطكم بقيمة [amount] مستحق بتاريخ [dueDate].
    يرجى ترتيب الدفع عند الإمكان.
```

**5 — Service update / تحديث الصيانة**

```
EN: Dear [customerName], this is [businessName].
    Your service request is currently: [serviceStatus].
    [customNote]

AR: مرحباً [customerName]، معك [businessName].
    حالة طلب الصيانة الخاص بكم: [serviceStatus].
    [customNote]
```

`[serviceStatus]` needs a customer-facing Arabic label per `ServiceJobStatus` ([schema.prisma:120](backend/prisma/schema.prisma#L120)) — 12 values including `IN_WORKSHOP_REPAIR`, `WAITING_FOR_PART`, `READY_FOR_PICKUP`, `NOT_REPAIRABLE`. **Two of these must never be auto-sent as-is**: `NOT_REPAIRABLE` and `CANCELLED` carry bad news that needs a human sentence, so for those the template should insert the status and force the employee into the custom note before Generate completes.

**6 — Custom message / رسالة مخصصة**

Free textarea, placeholder chips clickable to insert. Same rendering pipeline so `[amount]` etc. still resolve.

### Message quality guardrails

Allowed: polite, professional, short, clear, Arabic-first. Forbidden in v1 template text: "pay immediately", "or else", "legal action", "final warning", court/lawyer references. The `firm` tone is *firm*, not threatening — e.g. `نرجو تسديد المبلغ في أقرب وقت` rather than any escalation language. A legal/escalation template is out of scope unless the user later asks for it explicitly.

---

## 5. Opening WhatsApp — the one real engineering problem

### Phone normalization

`Customer.phone` is a free-text `String` ([schema.prisma:337](backend/prisma/schema.prisma#L337)) with no format constraint. The only existing helper, [format-customer-phone.ts](frontend/src/features/customers/utils/format-customer-phone.ts), is **display-only** and assumes 8 digits. A new, separate normalizer is needed — do not change the existing formatter.

`wa.me` requires **digits only, country code included, no `+`, no spaces, no dashes.**

Rules (Lebanon-first, conservative):

| Input shape | Result | Confidence |
|---|---|---|
| 8 digits starting `03/70/71/76/78/79/81/76…` | `961` + digits | high |
| 9 digits starting `0` (e.g. `070123456`) | strip leading `0` → `961` + 8 | high |
| starts `+961` / `00961` / `961` + 8 | strip prefix noise → `961…` | high |
| already 10–15 digits, non-961 country code | pass through unchanged | **low — show "assumed international"** |
| anything else | **do not guess** | reject, disable Open WhatsApp, offer Copy |

**Rule: never overcorrect.** When confidence is low, the UI shows the normalized number with an "assumed" note and still requires the employee's eyes on it. The normalized number is always displayed before opening. Multiple numbers in one field (`70123456 / 03987654`) must be detected and rejected rather than mangled — this is common in free-text phone fields.

### The deep link

```
https://wa.me/<normalizedDigits>?text=<encodeURIComponent(body)>
```

Newlines encode as `%0A`; `encodeURIComponent` handles Arabic correctly. Prefer `https://wa.me/…` over `whatsapp://send?phone=…&text=…`: on Windows, `wa.me` resolves to WhatsApp Desktop when installed and falls back to the browser when not, whereas a bare `whatsapp://` with no app registered produces an OS error dialog. Cap the encoded URL at a safe length (**~2000 chars of body text**); above that, disable Open WhatsApp and tell the employee to Copy instead — long `whatsapp://`-family URLs are unreliable on Windows.

### The Electron path (per F1 — this is the part that does not exist yet)

`shell` is already imported in [index.ts:1](desktop/src/index.ts#L1) and used for `shell.openPath`. Add, following the exact existing `ipcMain.handle` / `contextBridge` pattern:

- **main:** `ipcMain.handle('comm:openWhatsApp', (_e, url: string) => …)` — validate **in main, not in the renderer**: parse the URL, require `protocol === 'https:'` **and** `hostname === 'wa.me'`, reject everything else, then `shell.openExternal(url)`. An IPC channel that forwards arbitrary strings to `openExternal` is a real security hole; the allowlist is the whole point.
- **preload:** `openWhatsApp: (url: string) => ipcRenderer.invoke('comm:openWhatsApp', url)` on the existing `electronAPI` object ([preload.ts:3](desktop/src/preload.ts#L3)).
- **renderer:** call `window.electronAPI?.openWhatsApp(url)`; if `electronAPI` is absent (dev in a plain browser), fall back to `window.open(url, '_blank', 'noopener')`.

No shell command execution, no `exec`, no string interpolation into a command line. Ever.

**Failure modes to design for:** WhatsApp Desktop not installed → browser → WhatsApp Web → possibly a QR-login screen. The message text still arrives; the employee just logs in. `Copy message` remains the always-works path and should be visually equal in weight to `Open WhatsApp`, not secondary.

---

## 6. Communication log — recommendation

**Recommended for v1: yes, log it — but through `ActivityLog`, with no new table and no migration.**

Reasoning: the value of the log (did anyone already chase this customer this week?) is real, but a new table means a Prisma migration, and per project memory the business PC's schema was assembled by hand-run repair scripts, so `prisma migrate deploy` dead-ends there until that history is resolved. Paying that cost for a convenience log is a bad trade. `ActivityLog` already stores exactly this shape:

```
entityType: 'CUSTOMER'
entityId:   <customerId>
action:     'CUSTOMER_COMMUNICATION'
userId:     <employee>
details:    { channel: 'WHATSAPP', type, language, tone,
              phoneUsed, sourceKind, sourceId,
              messagePreview,        // first ~160 chars
              overrodeName, overrodeAmount, overrodePhone,  // booleans, not values
              status }
```

**Status vocabulary — `SENT` is not one of the options.** HomeConnect cannot observe whether the employee pressed Send inside WhatsApp, and a log that claims otherwise is worse than no log:

`GENERATED` → `COPIED` → `OPENED_WHATSAPP` → `MARKED_SENT_MANUALLY` (employee-asserted only, never automatic)

**Privacy default:** store `messagePreview` (truncated) rather than `fullMessage`. These messages contain balances and due dates; a full-text archive in an audit table is a larger disclosure surface than the feature needs. Full-text storage is an open decision (§9.3) — if the user wants it, it should be a deliberate yes.

The log write is **additive and non-financial**: one `activityLog.create`, no transaction against financial tables, no dashboard impact. `CustomerActivityTimeline` already exists in the profile and is the natural place to surface entries later.

*Alternative if the user prefers zero persistence:* ship v1 with no log at all — generate and open only. This is a legitimate choice and cheaper; the section works fully without it. The log can be added later with no schema change either way, which is precisely why the `ActivityLog` route is safe.

---

## 7. Backend plan

**Verdict: no new backend endpoints required for the message feature itself.**

| Piece | Needed? | Why |
|---|---|---|
| Template endpoint | **No** | Templates are frontend constants in v1. Admin-editable templates would need storage — deferred (§9.2). |
| Financial summary endpoint | **No — already exists** | `useCustomerFinancialSummary` / `CustomerFinancialSummary` supplies every default (§1, F2). Do **not** add new financial calculations; do not re-derive days-late or remaining balances client-side. |
| Communication log endpoint | **Only if the log is approved** | One `POST` writing a single `ActivityLog` row + optionally one `GET` list filtered by `entityType='CUSTOMER'`. Follow the existing feature-folder pattern under `backend/src/features/`. |

Backend remains authoritative for all financial values. The frontend consumes them as **defaults**, and overrides live entirely in the composer's local state.

---

## 8. Files likely to change

**New (frontend)**
```
frontend/src/features/customer-communication/
  components/CustomerCommunicationSection.tsx
  components/WhatsAppMessageComposer.tsx
  components/MessageTemplateSelector.tsx
  components/MessageSourceSelector.tsx
  components/CommunicationPreview.tsx
  components/CommunicationLogList.tsx        (only if log approved)
  hooks/useWhatsAppMessage.ts
  hooks/useCommunicationLog.ts               (only if log approved)
  utils/message-templates.ts
  utils/render-template.ts
  utils/normalize-whatsapp-phone.ts
  utils/build-whatsapp-url.ts
  utils/resolve-message-defaults.ts
  types/communication.types.ts
  api/communication.api.ts                   (only if log approved)
```

**Modified**
```
frontend/src/pages/customers/CustomerProfilePage.tsx     mount section (~after line 180) + header WhatsApp shortcut
frontend/src/shared/labels/business-labels.ts            add businessLabels.communication (bilingual 'EN / AR' string convention)
desktop/src/index.ts                                     ipcMain.handle('comm:openWhatsApp') with wa.me allowlist
desktop/src/preload.ts                                   expose openWhatsApp on electronAPI
frontend/src/vite-env.d.ts (or the electronAPI typing)   add openWhatsApp to the window typing
```

**Modified only if the log is approved**
```
backend/src/features/communication/…                     routes + repository (ActivityLog write/read)
backend/src/routes/…                                     register route
```

**Explicitly untouched:** `backend/prisma/schema.prisma`, `backend/prisma/migrations/**`, every debt/payment/installment/ledger/dashboard module.

---

## 9. Open decisions for the user

1. **Store communication logs?** → *Recommend yes, via `ActivityLog`, no migration.* Alternative: no log in v1.
2. **Templates frontend-only, or admin-editable later?** → *Recommend frontend constants for v1.* Admin-editable means storage + an editor screen — a separate feature.
3. **Store full message text or preview only?** → *Recommend preview only (~160 chars)*, because messages contain balances.
4. **Lebanon-only phone normalization?** → *Recommend Lebanon-first with conservative pass-through* for anything already international, and outright rejection of unparseable input.
5. **Include service update messages in v1?** → *Recommend yes*, but require a custom note for `NOT_REPAIRABLE` / `CANCELLED`.
6. **Arabic default?** → *Recommend Arabic default*, with a per-session sticky preference remembering the employee's last choice.
7. **Allow "mark as sent manually"?** → *Recommend yes*, as an explicit employee assertion clearly labelled as such — never automatic.

---

## 10. Testing plan

**Pure unit (highest value, colocated `*.test.ts` per repo convention)**
- placeholder substitution: all known tokens, all six templates × AR/EN
- unknown placeholder left verbatim
- empty-value placeholder drops the whole line (no dangling punctuation / blank lines)
- amount and date formatting; days-late text
- phone normalization: 8-digit local, `0`-prefixed 9-digit, `+961`, `00961`, already-international, letters, empty, two numbers in one field
- `wa.me` URL builder: digits-only phone, `encodeURIComponent`, newlines → `%0A`, Arabic text round-trip, over-length rejection
- override resolution: `override ?? default`; **defaults object is not mutated**; cleared override falls back
- source switch resets amount/date overrides
- template text contains none of the forbidden escalation phrases (a cheap regression guard on tone)

**Frontend component**
- section renders collapsed, expands on click
- composer renders; preview textarea is editable
- Open WhatsApp disabled with no phone / no message / unnormalizable phone
- phone-override-differs warning appears and gates the button
- "This changes the message only / هذا يغيّر الرسالة فقط" notice is visible
- financial values render as defaults with the DB value shown alongside

**Desktop**
- `comm:openWhatsApp` accepts `https://wa.me/…`
- rejects `http:`, `file:`, `javascript:`, other hosts, and malformed URLs — with no `openExternal` call

**Backend (only if log approved)**
- creates an `ActivityLog` row with the right `entityType`/`action`
- lists logs for a customer
- rejects a `SENT` status; accepts only the four allowed values
- creates **no** financial records; `userId` captured

**Manual (on the business PC)**
- open profile → Debt reminder → override name to `أبو سالم`, amount, due date → Generate Arabic → verify RTL rendering and that numbers read correctly → Copy → Open WhatsApp → confirm text is prefilled → **do not send**
- customer with multiple debts: switch source, confirm amounts follow the selection
- invalid/empty phone → button disabled, Copy still works
- WhatsApp Desktop absent → browser fallback behaves sanely
- **verify debts, payments, ledger and dashboard numbers are byte-for-byte unchanged before and after**

---

## 11. Checkpoints

| ID | Scope | Gate |
|---|---|---|
| **CP-COMM1** | Review-only: customer profile, financial summary shape, phone helpers, external-link feasibility. Confirm backend need; recommend log vs defer. | User approves the log decision before any code. |
| **CP-COMM2** | Pure utilities: templates, renderer, phone normalization, URL builder, override resolution. Unit tests. | All pure, no UI, no IPC. |
| **CP-COMM3** | `CustomerCommunicationSection` UI mounted in the profile, collapsed by default. | No WhatsApp opening yet — Copy only. |
| **CP-COMM4** | Data-source selection wired to `useCustomerFinancialSummary` (total / debt / installment / manual) + payment & service defaults. | No new financial computation. |
| **CP-COMM5** | `comm:openWhatsApp` IPC with `wa.me` allowlist; preload exposure; renderer fallback. | Allowlist tests pass. |
| **CP-COMM6** | *(Optional, if approved)* `ActivityLog`-based communication log, write + list. | No migration. |
| **CP-COMM7** | Full test pass + manual verification on the business PC. | Financial numbers provably unchanged. |

---

## 12. Out of scope (v1)

WhatsApp Business API · Meta API · automatic sending · reading replies · delivery/read status · bulk or mass messaging · scheduled reminders · background jobs · AI-generated or AI-rewritten messages · legal/escalation templates · any change to financial records · creating debts or payments from communication · customer consent management · marketing campaigns · SMS or email channels · WhatsApp Web automation libraries · scraping.

---

## 13. Codex implementation prompt — CP-COMM1 only

```text
You are working in the HomeConnect repository.

Start CP-COMM1 only. This is a REVIEW AND FEASIBILITY checkpoint.
Read and report. Do not build the feature.

CONTEXT
We are planning a "Customer Communication / تواصل الزبون" section inside the
Customer Profile. It will generate WhatsApp-ready Arabic/English messages from
existing customer and financial data, let the employee override values and edit
the text, then open WhatsApp through a deep link. The employee presses Send
manually inside WhatsApp. See claude/plans/customer-communication-whatsapp-plan.md.

DO NOT
- Do not implement any UI.
- Do not add WhatsApp Business API, Meta API, or any WhatsApp automation library.
- Do not create or modify Prisma migrations.
- Do not modify backend/prisma/schema.prisma.
- Do not touch financial records: debts, payments, installments, plans, ledger.
- Do not change debts/payments/dashboard numbers or any financial calculation.
- Do not run builds, do not bump version, do not generate an installer, do not commit.

REVIEW AND REPORT ON
1. Customer Profile
   - frontend/src/pages/customers/CustomerProfilePage.tsx: confirm the best mount
     point for a new collapsible section and whether it should sit before or after
     CustomerFinancialProfile.
2. Financial defaults
   - frontend/src/features/customer-financial/ (types, hooks, api).
     Confirm that CustomerFinancialSummary already supplies, WITHOUT any new
     endpoint or new calculation: outstanding total, per-debt amount/date
     added/due date, days overdue, next installment due amount and date, last
     payment amount and date, remaining balance.
     List any value in the plan's templates that is NOT currently available.
3. Phone handling
   - frontend/src/features/customers/utils/format-customer-phone.ts and any other
     phone helper. Report whether a separate normalization utility is needed for
     wa.me (digits-only, country code, no '+') and confirm the existing display
     formatter must stay unchanged.
4. External-link feasibility (most important)
   - desktop/src/window.ts, desktop/src/index.ts, desktop/src/preload.ts,
     desktop/src/content-security-policy.ts.
     Confirm whether setWindowOpenHandler denies window.open, whether any
     shell.openExternal path exists today, and what exactly must be added to open
     an https://wa.me/... URL safely. Describe the IPC channel and the host
     allowlist you would add, following the existing ipcMain.handle /
     contextBridge pattern. Do not implement it yet.
5. Service status labels
   - Report the ServiceJobStatus values and whether customer-facing Arabic labels
     for them already exist anywhere in the frontend.
6. Backend need
   - State clearly: is any new backend endpoint required for message generation?
     Answer yes or no with evidence.
7. Communication log
   - Inspect the existing ActivityLog model and its current write paths.
     Report whether a communication log can be stored using ActivityLog with NO
     migration, and recommend: add the log via ActivityLog now, or defer logging
     entirely to a later checkpoint. Note that this repo's production database has
     a hand-repaired migration history, so any recommendation requiring a new
     table must say so explicitly as a risk.
8. Exact files likely to change
   - List the precise files you would create and modify for CP-COMM2 through
     CP-COMM5, separating "new" from "modified".

OUTPUT
A written report only. No code changes, no new files other than the report if you
are asked to save one. End with a short list of anything that blocks CP-COMM2.
```
