# Mobile ERP lookup — Phase 2

Uncommitted work on `feat/mobile-erp-lookup`, branched directly from
`feat/mobile-erp-foundation` at `18640eb`. Mobile version **1.3.0**, Android
`versionCode` **5**. Claude reviews and commits.

## Delivered

- Home: role-filtered desktop dashboard KPIs, preset/custom periods, pull to
  refresh, and a persistent hide-numbers control. The desktop preference from
  `4450016` is per device (`homeconnect.dashboard.hideNumbers`), not a server
  account setting. Mobile uses that same key in SecureStore. Money, counts and
  accessible labels are masked; values start hidden while storage loads.
- Stock: name/SKU/barcode search, category and brand filters, product prices,
  VAT, installment pricing, barcode and paged stock movements. The global scan
  result links to product detail.
- Sell: paged customer search, contact/call/WhatsApp, branch, financial summary,
  debts, installment plans and statement of account. Sales orders have search,
  status/payment/date/customer filters and a detail with server totals/items.
- Suppliers: paged search, balances (including credit in our favour), statement,
  purchases, bill filters and authenticated bill images. The old standalone
  statement entry now uses the same server statement inside supplier detail.
- More: all **30** desktop report definitions, with summaries and paged record
  cards, preset/custom periods, and the two legacy monthly report pages.
  Reports retain the desktop's ADMIN restriction. No charts or new write actions.

Stock is **“Shared stock · all branches”**, as requested. The desktop stores one
quantity per product and does not allocate product stock or movements to branches.
Branch switching still invalidates/refetches stock queries, but the global stock
figures can legitimately remain the same.

Existing Phase 0/1 supplier tools remain available from More. Other future-feature
placeholders remain. Lookup screens issue GET requests; authentication uses the
existing foundation flow.

## Desktop route reuse

Every domain was graphify-queried against its desktop page/hook before building.
The phone uses the shop PC's **port 3011 gateway → API port 3001**, with the same
`/api/v1` routes and branch/auth headers as the desktop contracts:

| Area      | Existing routes / desktop source                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard | `/dashboard/overview`; `features/dashboard/api/dashboard.api.ts`                                                                                                |
| Products  | `/products`, `/products/brands`, `/categories`, `/products/:id`, `/products/:id/inventory`, `/inventory/movements`; desktop products/inventory APIs             |
| Customers | `/customers?include=financial`, `/customers/:id`, `/customers/:id/financial-summary`, `/customers/:id/statement`; desktop customer-financial and documents APIs |
| Suppliers | `/suppliers`, `/suppliers/:id`, `/suppliers/:id/statement`, `/suppliers/:id/purchases`; desktop suppliers, purchases and documents APIs                         |
| Bills     | `/suppliers/:id/bills`, `/supplier-bills/:id/image`; existing Phase 0 routes                                                                                    |
| Orders    | `/sales-orders`, `/sales-orders/:id`; desktop sales-orders API                                                                                                  |
| Reports   | All 26 `report-rows.api.ts` paths, `/reports/monthly-review`, `/reports/analysis`, `/reports/monthly-debts`, `/reports/monthly-financial-activity`              |

No production backend routes or schema changes were needed. Phase 0 bill code,
the Phase 1 gateway, session, storage and refresh implementation are unchanged.

All query keys use the existing PC/user/branch scope and include resource filters.
Existing branch switching cancels/clears the query cache and leaves the protected
tab stack before selecting another branch. No previous-branch placeholder data
is used. Lists request included balances rather than making one request per row.

Ordinary lists/movement history/purchases use server pages of 25. The existing
statement, bill and non-legacy report endpoints return complete collections; these
are presented in bounded pages of 25 without adding mobile-only endpoints. Those
responses still have their existing desktop-sized network payloads. The foundation
HTTP client unwraps `data`, so array paging conservatively tries another page when
the previous page contains exactly 25 rows; an empty final request ends the list.

Balances, running balances, prices, tax, paid/remaining amounts and report totals
are displayed from the server. They are never summed or recalculated on the phone.
Money uses `shared/money-format.ts`; the desktop financial date helpers were moved
there unchanged and re-exported from their original desktop module. Report fields
keep base USD distinct from original-currency amounts. Percentages are not money.
Bill bytes are fetched with Authorization and the bill's branch header, then
displayed as a temporary data URI; no token goes in an image URL. Image query cache
is discarded after the viewer closes.

## Side-by-side verification

**Synthetic local fixtures**, branch **Fixture branch A**, statement period
**1–12 November 2026**, USD. No real customer names, database rows, credentials or
bill photos appear in the artifacts.

| Synthetic party    | Desktop displayed balance | Mobile displayed balance | Desktop / mobile statement closing |
| ------------------ | ------------------------: | -----------------------: | ---------------------------------: |
| Fixture Customer A |                   $125.50 |                  $125.50 |                  $125.50 / $125.50 |
| Fixture Customer B |                     $0.00 |                    $0.00 |                      $0.00 / $0.00 |
| Fixture Customer C |                 $9,050.25 |                $9,050.25 |              $9,050.25 / $9,050.25 |
| Fixture Supplier A |                   $940.25 |                  $940.25 |                  $940.25 / $940.25 |
| Fixture Supplier B |                     $0.00 |                    $0.00 |                      $0.00 / $0.00 |
| Fixture Supplier C |             $45.50 credit |            $45.50 credit |                  -$45.50 / -$45.50 |

The desktop reference renders the actual `FinancialSummaryCards` and
`SupplierSummaryCards`, populated through the actual desktop API modules. It uses
a small QA stylesheet, not the full desktop page. Desktop statement API responses
are compared with mobile opening/closing values for the same branch and dates.
The fixture API runs on :3001; the mobile browser requests pass through the actual
production gateway implementation on :3011. This verifies route compatibility,
rendered values and sign/currency handling, **not the ledger calculation against a
live shop database**.

Evidence: [desktop reference](desktop-reference.png),
[customer detail](customer-detail.png), [customer statement](customer-statement.png),
[supplier detail](supplier-detail.png), [supplier statement](supplier-statement.png),
[authenticated bill viewer](bill-image.png), [report](report.png),
[branch B](branch-b.png), [small phone](small-phone.png),
[landscape](landscape.png), and [machine-readable checks](browser-checks.json).

The browser run verified dashboard privacy (including accessible text), all six
comparisons, empty search, customer pagination beyond 25 rows, a forced network
failure/retry, product filters and movement pagination, global manual scan →
detail, supplier purchases/bill image, order filters/totals, and opening all 30
reports. Switching to branch B refetched dashboard/customers/suppliers and removed
branch A records. Unit tests independently check resource keys across branch,
user and PC changes. The all-report run uses synthetic summary/row payloads; live
data parity for every report, branch, currency and date range remains unverified.

## Validation and reproduction

Passed:

- `Mobile Scanner/`: `npm run typecheck`, `npm run lint`, `npm test`
  (**25 files / 195 tests**). Lint has one existing array-style warning in the
  unchanged `supplier-purchases-api.ts`; no errors.
- Root `npm run typecheck` (frontend/node/backend).
- Targeted desktop financial tests: `customer-financial.components.test.tsx`,
  `money-input.test.ts`, `installment-preview.test.ts` (**3 files / 29 tests**).
- Android JavaScript/Hermes export via `npx expo export --platform android
--max-workers 2 --output-dir ../node_modules/.cache/mobile-lookup-android`.
- `node scripts/qa/mobile-lookup-browser.cjs`: browser checks described above,
  with no page errors or business-write requests.
- `graphify update .` after final changes.

To reproduce the synthetic comparison, use three terminals from the repository
root, with :3001, :3011 and :8087 free:

```powershell
node scripts/qa/mobile-lookup-server.cjs
node scripts/qa/mobile-lookup-preview.cjs
node scripts/qa/mobile-lookup-browser.cjs
```

The preview script copies the app into ignored `logs/mobile-lookup-preview` and
substitutes only native storage/filesystem/camera for browser QA. The browser
driver adds a test-only CORS adapter while forwarding API requests to the real
gateway. Production native storage, camera and gateway configuration are not
weakened. Chrome is required (`CHROME_PATH` can override the local executable).
Stop the two servers after the checks. Fixtures, request logs and Android export
scratch output live in ignored directories; review evidence lives beside this file.

**Not run:** physical Android/shop Wi-Fi testing, a signed APK install, real-camera
scanning, live shop database reconciliation, or an EAS/cloud build. The native
bundle export is not an APK build. The previously requested cloud build remains
pending. No full CI suite was run and nothing was committed.
