All 54 actual method/path pairs are behind requireAuth and branchScopeMiddleware. Reports and month-end retain ADMIN guards. Other dashboard routes retain their existing authenticated-user access.

| Method | Endpoint | Data scope | branchBreakdown for >1 branch | CSV Branch column |
| --- | --- | --- | --- | --- |
| GET | `/api/v1/reports/monthly-debts` | Scoped | Yes | — |
| GET | `/api/v1/reports/monthly-debts/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/monthly-financial-activity/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/monthly-financial-activity` | Scoped | Yes | — |
| GET | `/api/v1/reports/monthly-review/export.csv` | Scoped financial/service data + labelled global inventory | No JSON array in CSV | First: selected-scope label |
| GET | `/api/v1/reports/monthly-review` | Scoped financial/service data + labelled global inventory | Yes | — |
| GET | `/api/v1/reports/customers/new/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/customers/new` | Scoped | Yes | — |
| GET | `/api/v1/reports/customers/debts/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/customers/debts` | Scoped | Yes | — |
| GET | `/api/v1/reports/customers/payments/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/customers/payments` | Scoped | Yes | — |
| GET | `/api/v1/reports/customers/receivables-aging/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/customers/receivables-aging` | Scoped | Yes | — |
| GET | `/api/v1/reports/customers/not-paid/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/customers/not-paid` | Scoped | Yes | — |
| GET | `/api/v1/reports/customers/paid/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/customers/paid` | Scoped | Yes | — |
| GET | `/api/v1/reports/products/bought/export.csv` | Global, explicitly labelled (D3) | No JSON array in CSV | No |
| GET | `/api/v1/reports/products/bought` | Global, explicitly labelled (D3) | No | — |
| GET | `/api/v1/reports/products/cost-changes/export.csv` | Global, explicitly labelled (D3) | No JSON array in CSV | No |
| GET | `/api/v1/reports/products/cost-changes` | Global, explicitly labelled (D3) | No | — |
| GET | `/api/v1/reports/suppliers/debts/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/suppliers/debts` | Scoped | Yes | — |
| GET | `/api/v1/reports/suppliers/payables-aging/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/suppliers/payables-aging` | Scoped | Yes | — |
| GET | `/api/v1/reports/suppliers/receiving/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/suppliers/receiving` | Scoped | Yes | — |
| GET | `/api/v1/reports/sales/orders/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/sales/orders` | Scoped | Yes | — |
| GET | `/api/v1/reports/sales/unpaid/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/sales/unpaid` | Scoped | Yes | — |
| GET | `/api/v1/reports/inventory/movements/export.csv` | Global, explicitly labelled (D3) | No JSON array in CSV | No |
| GET | `/api/v1/reports/inventory/movements` | Global, explicitly labelled (D3) | No | — |
| GET | `/api/v1/reports/inventory/reconciliation/export.csv` | Global, explicitly labelled (D3) | No JSON array in CSV | No |
| GET | `/api/v1/reports/inventory/reconciliation` | Global, explicitly labelled (D3) | No | — |
| GET | `/api/v1/reports/customers/financial-integrity/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/customers/financial-integrity` | Scoped | Yes | — |
| GET | `/api/v1/reports/suppliers/financial-integrity/export.csv` | Scoped | No JSON array in CSV | First: actual record branch name |
| GET | `/api/v1/reports/suppliers/financial-integrity` | Scoped | Yes | — |
| GET | `/api/v1/reports/analysis/export.csv` | Scoped financial/service data + labelled global inventory | No JSON array in CSV | First: selected-scope label |
| GET | `/api/v1/reports/analysis` | Scoped financial/service data + labelled global inventory | Yes | — |
| GET | `/api/v1/dashboard/financial-summary` | Scoped | Yes | — |
| GET | `/api/v1/dashboard/overview` | Scoped financial/service data + labelled global inventory | Yes | — |
| GET | `/api/v1/dashboard/customer-financial` | Scoped | Yes | — |
| GET | `/api/v1/dashboard/supplier-financial` | Scoped | Yes | — |
| GET | `/api/v1/dashboard/service-summary` | Scoped | Yes | — |
| GET | `/api/v1/dashboard/product-summary` | Global, explicitly labelled (D3) | No | — |
| GET | `/api/v1/dashboard/sales-summary` | Scoped | Yes | — |
| GET | `/api/v1/dashboard/alerts` | Scoped financial/service data + labelled global inventory | Yes | — |
| GET | `/api/v1/dashboard/activity` | Scoped events; NULL/global events ADMIN-only | No | — |
| GET | `/api/v1/dashboard/recent-activity` | Scoped events; NULL/global events ADMIN-only | No | — |
| GET | `/api/v1/dashboard/month-end` | Scoped | Yes | — |
| GET | `/api/v1/dashboard/summary` | Scoped | Yes | — |

Zero or one accessible branch consistently omits branchBreakdown. Product/stock-only slices never have breakdowns. Mixed-view global components are repeated unchanged per branch and labelled inventoryScope: all-branches; they are not additive branch metrics. Ratios, extrema, representative records and top-N lists retain their existing meaning.
