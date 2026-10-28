# Multi-branch Phase 3 — release notes draft

Backend branch isolation is implemented across customers, suppliers, financial actions, sales, service jobs, reports, dashboards and exports. Access is checked against current database grants on every request. Out-of-scope records return 404; mutations require exactly one accessible branch. Requests without a header preserve the single-branch workflow.

Keep `MULTI_BRANCH_SCOPING_ENABLED` **OFF in production until Phase 4's desktop branch selector ships**. This checkpoint is not authorization to enable production multi-branch operation.

## Reporting corrections

The supplier dashboard, month-end and suppliers-debts report now use each record's stored USD amount (`baseAmount`). Totals that previously included raw LBP amounts will change. Existing aggregation formulas and stored conversions are preserved; current exchange rates are not used to revalue history.

The legacy `/api/v1/dashboard/summary` endpoint works again on the current schema. It preserves its response fields and number types while using the current-ledger calculations instead of querying the removed legacy transactions table.

## Mobile and printed documents

Mobile JWT login loads accessible branches: one selects automatically, several show a picker, and none blocks supplier actions with an assignment message. The selected branch is stored securely, shown on home and sent with requests. Logout clears it; server rejection returns to selection. No mobile version bump or APK is included.

Invoices, payment receipts, sales returns and customer statements include their record branch's contact details in their document data. Printouts show the branch line only when more than one branch is active; single-branch output stays unchanged.

Desktop and LAN scanner pairing sessions stay global because they contain product scans and device state only. Mobile supplier requests use the separate JWT gateway and normal backend branch enforcement. The product service-job history endpoint is scoped despite its product URL, because service jobs belong to branches. Shared products, stock, pricing and administration remain global under the approved plan.

## Phase 4 follow-up

Ship the desktop selector, scope all React Query keys and API headers, show branch badges/columns, and disable writes in All branches. From All, record actions must select the record branch explicitly. The application-level per-branch customer-phone checks remain; the unique database index was deferred by the approved no-migration decision. This checkpoint changes no migration or balance algorithm.
