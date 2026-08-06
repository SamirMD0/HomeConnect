# Customer profile and search

## Customer list

`GET /api/v1/customers` supports `include=financial`, `filter=withBalance|overdue|noDebt|inactive`, and sorting by `outstanding`, `overdue`, or `lastPayment`. Search covers normalized name, phone, address, and notes. Searched rows include `matchedInNotesOnly` for explainability.

## Suggestions

`GET /api/v1/customers/search-suggestions?q=<term>&limit=3` returns name-only trigram suggestions only when the primary search has no matches. Phone-shaped queries never receive suggestions.

## Financial summary and activity

`GET /api/v1/customers/:customerId/financial-summary` adds `totalObligated`, `overdueAmount`, `lastPaymentDate`, `daysSinceLastPayment`, and accepts optional `month=YYYY-MM` for the month block.

`GET /api/v1/customers/:customerId/activity?limit=50` returns a newest-first merged read-only feed of debts, plans, payments, and correction audit records.
