# Daily Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Daily check" page that runs fixed, exact rules over customer balances and the last trial-balance import, lists every problem with its amount and customers, and optionally asks a local Ollama model to write a short plain-language summary of those findings.

**Architecture:** Rules are pure functions over data a service loads in one read-only transaction; the service returns a `DailyCheckReport`. The page shows the report. The AI layer is a separate endpoint that sends only the finished findings to a local Ollama server and returns text; the numbers on screen never come from the model.

**Tech Stack:** Express + Prisma (backend), React + TanStack Query (frontend), Vitest, Ollama HTTP API (`/api/tags`, `/api/pull`, `/api/generate`) via Node `fetch`.

**Spec:** No separate spec document. The decisions are the ones agreed on 2026-11-26 and recorded under Global Constraints below.

## Global Constraints

- Numbers are decided by code, never by the model. The model receives findings and returns text only; its text is shown beside, never instead of, the figures.
- Money comparisons use the existing money helpers (`parseMoney`, `sumMoney`, `toBaseAmount`) and are exact to the cent. USD is the report currency.
- "Balance" means owed minus imported deposits held, the same basis as the import's "Balance after import" (2.4.9).
- The main branch (`code = 'MAIN'`) is read only: rules may read it, nothing writes to it.
- Read only: running the check writes nothing except the Ollama model download, which writes nothing to the database.
- Admin only, like the customer import (`requireRole(['ADMIN'])`).
- Ollama is optional. Defaults: `OLLAMA_URL=http://127.0.0.1:11434`, `OLLAMA_MODEL=qwen2.5:3b`. When it is unreachable the page works fully and hides the AI part.
- The shop PC gets no commands: installing the model is a button in the page (calls `/api/pull`), never a terminal step.
- No customer data leaves the PC: the only AI endpoint used is the configured local Ollama URL; reject any `OLLAMA_URL` whose host is not `127.0.0.1`, `localhost`, `::1` or a private LAN address (10/8, 172.16/12, 192.168/16).
- UI text is English only (Settings rule since 2.4.7); customer names show as stored (`dir="auto"`).
- Large-amount threshold: 500 USD by default (`DAILY_CHECK_LARGE_USD`).

## Review Focus

1. **No committed import yet** (fresh install, or a branch never imported): the page must show "No import yet" for import rules and still run the others, not crash. → Task 2 test `no import gives a skipped import rule`.
2. **Ollama running but model not downloaded:** status says `model-missing` and the page offers "Download model", not a broken Explain button. → Task 4 test `missing model reports model-missing`.
3. **Ollama slow or hung:** Explain must time out (60 s) with "The AI did not answer in time", leaving the report usable. → Task 4 test `generate timeout returns 504`.
4. **LBP balances:** a customer owing LBP is converted with today's rate exactly as the import does; no USD-only shortcut. → Task 1 test `lbp converts with the given rate`.
5. **Customer with a deposit and no debt** (like a −200 credit): counted as −200 in balances, not 0 and not left out. → Task 1 test `deposit only counts negative`.

---

## File Structure

- `backend/src/features/daily-check/daily-check.types.ts` — report and finding types shared by rules, service, routes.
- `backend/src/features/daily-check/daily-check.rules.ts` — pure rule functions, no database access.
- `backend/src/features/daily-check/daily-check.rules.test.ts`
- `backend/src/features/daily-check/daily-check.service.ts` — loads data, runs rules, builds the report.
- `backend/src/features/daily-check/daily-check-db.integration.test.ts`
- `backend/src/features/daily-check/daily-check-ai.ts` — Ollama client: status, pull, explain.
- `backend/src/features/daily-check/daily-check-ai.test.ts`
- `backend/src/features/daily-check/daily-check.routes.ts` — HTTP routes; mounted in `backend/src/app.ts`.
- `backend/src/features/customers/customer-import.service.ts` — Modify: store the branch reconciliation in the committed import's `result`.
- `frontend/src/features/daily-check/api/daily-check.api.ts`
- `frontend/src/pages/daily-check/DailyCheckPage.tsx`
- `frontend/src/pages/daily-check/DailyCheckPage.test.tsx`
- `frontend/src/App.tsx`, `frontend/src/layouts/navigation.ts` — Modify: route and sidebar entry.

---

### Task 1: Report types and pure rules

**Files:**
- Create: `backend/src/features/daily-check/daily-check.types.ts`
- Create: `backend/src/features/daily-check/daily-check.rules.ts`
- Test: `backend/src/features/daily-check/daily-check.rules.test.ts`

**Interfaces:**
- Produces (types file):

```ts
export type RuleId =
  | 'LAST_IMPORT_MATCH'      // last import left HomeConnect equal to the file
  | 'NOT_IN_OLD_SYSTEM'      // HomeConnect money activity since the last import
  | 'LARGE_CHANGE'           // one customer's balance moved >= threshold since the last import
  | 'DUPLICATE_CUSTOMER'     // same name in one branch, or one account linked twice
  | 'MAIN_GAP';              // Main total vs the file's Main account
export type Severity = 'ok' | 'warning' | 'error' | 'skipped';
export interface FindingCustomer { id: string; name: string; branchName: string; amountUsd?: string; note?: string }
export interface Finding { rule: RuleId; severity: Severity; title: string; detail: string; amountUsd?: string; customers: FindingCustomer[] }
export interface DailyCheckReport { generatedAt: string; businessDate: string; lastImport: { id: string; fileName: string; committedAt: string } | null; findings: Finding[] }
/** One customer as the rules see them; amounts already in USD. */
export interface CustomerBalanceRow { id: string; name: string; nameKey: string; branchId: string; branchName: string; isMain: boolean; accountCodes: string[]; balanceUsd: string; fileBalanceUsd: string | null }
export interface MoneyActivity { customerId: string; kind: 'PAYMENT' | 'DEBT'; amountUsd: string; at: string; reference: string | null }
```

- Produces (rules file), each returns exactly one `Finding`:
  - `lastImportMatch(reconciliation: ImportReconciliation | null): Finding` where `ImportReconciliation = { branches: Array<{ branchName: string; fileBalanceUsd: string; balanceAfterUsd: string }> }`
  - `notInOldSystem(activity: MoneyActivity[], customers: Map<string, CustomerBalanceRow>): Finding`
  - `largeChange(customers: CustomerBalanceRow[], thresholdUsd: string): Finding`
  - `duplicateCustomers(customers: CustomerBalanceRow[]): Finding`
  - `mainGap(mainTotalUsd: string, fileMainUsd: string | null): Finding`
  - `toUsd(amount: Decimal, currency: Currency, rate: Decimal): Decimal` — wraps `toBaseAmount(..., ROUND_HALF_UP)`.

- [ ] **Step 1: Write the failing tests** in `daily-check.rules.test.ts`:
  - `lastImportMatch` with branches `[{Barja,'100.00','100.00'}]` → `severity 'ok'`; with `[{Jadra,'300.00','330.00'}]` → `'error'`, `amountUsd '30.00'`, detail contains `Jadra`; with `null` → `'skipped'`, title `No import yet`.
  - `notInOldSystem([])` → `'ok'`; two activities for one customer (payment 50, debt 20) → `'warning'`, one customer entry with `amountUsd '70.00'`, note `1 payment, 1 debt`.
  - `largeChange` threshold `'500.00'`: balance 1200 vs file 600 → listed with `amountUsd '600.00'`; 1000 vs 600 → not listed; `fileBalanceUsd null` → not listed; Main customers never listed.
  - `duplicateCustomers`: two customers same `nameKey` same branch → `'warning'` listing both; same `nameKey` in different branches → not listed; one account code on a B customer and a MAIN customer → listed with note `Account 4110000001 also in Main`.
  - `mainGap('5506.00','4837.00')` → `'warning'`, `amountUsd '669.00'`; `mainGap('10.00', null)` → `'skipped'`.
  - Review Focus 4 — `lbp converts with the given rate`: `toUsd(895000, 'LBP', 89500)` equals `10.00`.
  - Review Focus 5 — `deposit only counts negative`: a row with `balanceUsd '-200.00'` and `fileBalanceUsd '-200.00'` is not in `largeChange` and sums as −200 in any branch total the tests compute.

- [ ] **Step 2: Run to verify they fail**
  Run: `npx vitest run backend/src/features/daily-check/daily-check.rules.test.ts`
  Expected: FAIL, cannot resolve `./daily-check.rules`.

- [ ] **Step 3: Implement the types and the five rules** as pure functions with the signatures above. Amounts as strings with 2 decimals (`toFixed(2)`); sort listed customers by `amountUsd` descending, then name.

- [ ] **Step 4: Run to verify they pass** — same command, Expected: PASS.

- [ ] **Step 5: Commit**
  `git add backend/src/features/daily-check && git commit -m "feat(daily-check): report types and exact rules"`

---

### Task 2: Store the import reconciliation, and the report service

**Files:**
- Modify: `backend/src/features/customers/customer-import.service.ts` (commit: the `result` object built near `summary.depositUsedTotalUsd = ...`)
- Create: `backend/src/features/daily-check/daily-check.service.ts`
- Test: `backend/src/features/daily-check/daily-check-db.integration.test.ts` (guarded like `customer-import-db.integration.test.ts`: `RUN_FINANCIAL_DB_TESTS === '1' && isIsolatedTestDatabase(...)`)

**Interfaces:**
- Consumes: Task 1 types and rules; `loadCustomerBalances` from `customers/customer-import-balance.ts`; `buildCustomerImportPreview` is NOT reused (too heavy).
- Produces:
  - Import commit `result.reconciliation: { branches: Array<{ branchId: string; branchName: string; fileBalanceUsd: string; balanceAfterUsd: string }>; mainAccountUsd: string | null }` — copied from the `planned.branchTotals` of the preview the commit already builds (`fileBalanceUsd`, `balanceAfterUsd`); the commit's fingerprint checks guarantee that preview is what gets written. `mainAccountUsd` = the sum of file balances (debit − credit) of rows the preview marks INVALID because their account belongs to an archived or Main customer (today the "old debts" account), else `null`.
  - `DailyCheckService.run(actor: BranchActor, now?: Date): Promise<DailyCheckReport>`

- [ ] **Step 1: Write the failing DB tests:**
  - `no import gives a skipped import rule` (Review Focus 1): empty database with one branch → report has 5 findings, `LAST_IMPORT_MATCH` is `'skipped'`, `lastImport` is `null`.
  - `a committed import stores its reconciliation`: import a trial balance with `['4110000001','A',500]` and `['4110000002','B',-200]`, commit → `result.reconciliation.branches[0]` equals `{ fileBalanceUsd: '300.00', balanceAfterUsd: '300.00' }`.
  - `a payment after the import is not in the old system`: after that import record a 50 CASH payment for A → `NOT_IN_OLD_SYSTEM` `'warning'` listing A with `'50.00'`; import-created payments (idempotency key prefix `customer-import:`) are never listed.
  - `large change since the import`: add a 700 debt to A → `LARGE_CHANGE` lists A with `'700.00'`.
  - `report writes nothing`: count rows in `debts`, `payments`, `activity_logs` before and after `run` → equal.

- [ ] **Step 2: Run to verify they fail**
  Run: `RUN_FINANCIAL_DB_TESTS=1 DATABASE_URL=<test db> npx vitest run backend/src/features/daily-check/daily-check-db.integration.test.ts --no-file-parallelism`
  Expected: FAIL (module missing; reconciliation undefined).

- [ ] **Step 3: Store the reconciliation** in the import commit result (shape above). Imports committed before this change have no `reconciliation`: the service treats them as `null` for `LAST_IMPORT_MATCH` (`'skipped'`, detail "Import again to check").

- [ ] **Step 4: Implement `DailyCheckService.run`** in one `runFinancialTransaction` (read only):
  1. Latest committed parent import (`status COMMITTED`, `result.parentImportId` absent), its `committedAt` = the cut-off.
  2. All non-deleted customers with branch, account codes, and `loadCustomerBalances`; balance = owed − held deposits, each converted with `toUsd` at today's rate (`ExchangeRatesService.snapshotFor`).
  3. `fileBalanceUsd` per customer: from the last import's stored rows via `mapCustomerRows` keyed by account code (debit − credit); `null` when the account is not in that file.
  4. Activity since the cut-off: payments with `voidedAt null` and idempotency key not starting `customer-import:`, debts with `sourceCustomerImportId null` and not cancelled, in non-Main branches.
  5. Run the five rules; `businessDate` = `todayInBusinessTimezone()`.

- [ ] **Step 5: Run to verify they pass** — same command, Expected: PASS. Also run `npx vitest run backend/src/features/customers --no-file-parallelism` with the DB env: all customer import tests still PASS.

- [ ] **Step 6: Commit**
  `git commit -m "feat(daily-check): report service and stored import reconciliation"`

---

### Task 3: Routes

**Files:**
- Create: `backend/src/features/daily-check/daily-check.routes.ts`
- Modify: `backend/src/app.ts` — mount `app.use('/api/v1/daily-check', requireAuth, dailyCheckRoutes)` next to `customerImportRoutes`.
- Test: add to `daily-check-db.integration.test.ts` (supertest, as the import tests do with `http(...)`).

**Interfaces:**
- Consumes: `DailyCheckService.run`; Task 4's `DailyCheckAi` (routes for AI are added in Task 4).
- Produces: `GET /api/v1/daily-check` → `200 { data: DailyCheckReport }`.

- [ ] **Step 1: Failing tests:** `GET` as ADMIN → 200 with 5 findings; as EMPLOYEE with branch access → 403; unauthenticated → 401.
- [ ] **Step 2: Run, expect FAIL** (404 route).
- [ ] **Step 3: Implement** the router with `requireRole(['ADMIN'])`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Add the route to the admin-route classification test** the same way `a32d4c1f` did for the phone delete route, run that test, expect PASS.
- [ ] **Step 6: Commit** `feat(daily-check): admin route`.

---

### Task 4: Local AI client (Ollama) and its routes

**Files:**
- Create: `backend/src/features/daily-check/daily-check-ai.ts`
- Test: `backend/src/features/daily-check/daily-check-ai.test.ts` (inject `fetch`; no real Ollama in tests)
- Modify: `backend/src/features/daily-check/daily-check.routes.ts`

**Interfaces:**
- Produces:
  - `type AiStatus = { state: 'off' | 'model-missing' | 'ready' | 'pulling'; model: string; url: string }`
  - `createDailyCheckAi(deps: { fetch: typeof fetch; env: NodeJS.ProcessEnv }): { status(): Promise<AiStatus>; pull(): Promise<void>; explain(report: DailyCheckReport): Promise<string> }`
  - Routes: `GET /api/v1/daily-check/ai` → `AiStatus`; `POST /api/v1/daily-check/ai/pull` → `202`; `POST /api/v1/daily-check/ai/explain` → `{ data: { text: string } }`.

- [ ] **Step 1: Failing tests:**
  - `unreachable ollama is off`: fetch rejects → `status().state === 'off'`.
  - `missing model reports model-missing` (Review Focus 2): `/api/tags` returns `{ models: [{ name: 'llama3.2:3b' }] }` with `OLLAMA_MODEL=qwen2.5:3b` → `'model-missing'`.
  - `a public ollama url is refused`: `OLLAMA_URL=https://api.example.com` → `status().state === 'off'` and fetch is never called.
  - `explain sends findings only`: the body posted to `/api/generate` has `stream: false`, the configured model, and a prompt containing each finding's title and amount; it contains no customer phone numbers.
  - `generate timeout returns 504` (Review Focus 3): fetch never resolves → route answers 504 with message `The AI did not answer in time` after the 60 s timeout (use fake timers).
  - `explain when off returns 503` with message `The AI is not installed on this PC`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Prompt (fixed copy): "You are checking a shop's customer balances. Using only the findings below, write at most 6 short lines in English: what is wrong, which customers, and what the owner should do. Do not calculate or change any number; repeat amounts exactly as given." followed by the findings as JSON (`rule, severity, title, detail, amountUsd, customers[].name, customers[].amountUsd`). `pull` posts `{ model, stream: false }` to `/api/pull` without awaiting completion (state `pulling` until `/api/tags` lists the model).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(daily-check): optional local Ollama explanation`.

---

### Task 5: Daily check page

**Files:**
- Create: `frontend/src/features/daily-check/api/daily-check.api.ts`
- Create: `frontend/src/pages/daily-check/DailyCheckPage.tsx`
- Test: `frontend/src/pages/daily-check/DailyCheckPage.test.tsx`
- Modify: `frontend/src/App.tsx` (route `daily-check`, lazy like `CustomersListPage`), `frontend/src/layouts/navigation.ts` (entry under Customers, admin only, label `Daily check`).

**Interfaces:**
- Consumes: the three AI routes and `GET /daily-check` (Tasks 3–4); `DailyCheckReport`, `AiStatus` types mirrored in the api file.
- Produces: `dailyCheckApi.get()`, `dailyCheckApi.aiStatus()`, `dailyCheckApi.pullModel()`, `dailyCheckApi.explain()`.

- [ ] **Step 1: Failing tests** (render with a mocked api, like `customer-import-dialog.components.test.tsx`):
  - a report with one `'error'` and four `'ok'` → header reads `1 problem`, the error card is first, shows its amount and each customer name.
  - all `'ok'` → header reads `All checks passed` in green.
  - `aiStatus` `'off'` → no Explain button; `'model-missing'` → button `Download AI model`; `'ready'` → button `Explain with AI`, clicking it shows the returned text under the heading `AI summary (check the figures above)`.
  - `'skipped'` findings render gray with their detail, never as passed.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Same visual language as the import's balance box (green `Matches` / amber amounts, Aurora tokens); a Refresh button re-runs `GET`. Severity order: error, warning, skipped, ok.
- [ ] **Step 4: Run, expect PASS;** `npm run typecheck:frontend` clean.
- [ ] **Step 5: Verify in the browser** against a scratch restore of a recent shop backup (never the live `homeconnect` DB): page loads, findings match a hand check of two rules, Explain hidden when Ollama is stopped.
- [ ] **Step 6: Commit** `feat(daily-check): Daily check page`.

---

### Task 6: Release notes (no release until asked)

**Files:**
- Create: `docs/releases/<next version>.md` — what the page checks, the Ollama option, operator checklist (click-only: install Ollama for Windows from ollama.com if wanted, then "Download AI model" in the page).

- [ ] **Step 1:** Write the note; no customer names, amounts or dates from shop data.
- [ ] **Step 2:** Run `npx vitest run backend/src/features/daily-check backend/src/features/customers frontend/src/pages/daily-check --no-file-parallelism` with the DB env, and both typechecks. Expected: all PASS, 0 `error TS`.
- [ ] **Step 3: Commit** `docs(release): daily check notes`. Do not bump the version, tag or push until the owner asks.
