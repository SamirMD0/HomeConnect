# HomeConnect v1.0.7 Maintenance Service API

All endpoints are under `/api/v1` and require bearer authentication.

## Products

| Method | Endpoint | Access |
|---|---|---|
| GET | `/products` | Authenticated |
| POST | `/products` | Authenticated |
| GET | `/products/:productId` | Authenticated |
| PATCH | `/products/:productId` | Sensitive fields require admin password and reason |
| POST | `/products/:productId/archive` | Admin password and reason |
| POST | `/products/:productId/restore` | Admin password and reason |
| GET | `/products/:productId/label` | Authenticated |
| GET | `/products/:productId/audit` | Admin |

Product search covers name, model, brand, and barcode. Money values are decimal strings. There is no delete endpoint.

## Service Jobs

| Method | Endpoint | Access |
|---|---|---|
| GET | `/service-jobs` | Authenticated |
| POST | `/service-jobs` | Authenticated |
| GET | `/service-jobs/summary` | Authenticated |
| GET | `/service-jobs/:serviceJobId` | Authenticated |
| PATCH | `/service-jobs/:serviceJobId` | Field-dependent; sensitive changes require admin password and reason |
| POST | `/service-jobs/:serviceJobId/status` | Forward active changes are routine; backward/terminal changes are sensitive |
| POST | `/service-jobs/:serviceJobId/cancel` | Admin password and reason |
| POST | `/service-jobs/:serviceJobId/reopen` | Admin password and reason |
| GET | `/service-jobs/:serviceJobId/audit` | Admin |
| GET | `/customers/:customerId/service-jobs` | Authenticated |

List filters: `search`, comma-separated `status`, `requestType`, `routingDecision`, `warrantyStatus`, `customerId`, `productId`, `dateFrom`, `dateTo`, `sort`, `page`, and `pageSize`. Without an explicit status filter, only open jobs are returned.

Dates use `YYYY-MM-DD`; timestamps use ISO 8601. Prices are fixed-two decimal strings. No endpoint creates a Debt, and no service-job delete endpoint exists.
