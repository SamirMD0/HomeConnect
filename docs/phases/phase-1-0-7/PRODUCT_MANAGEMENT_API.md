# HomeConnect v1.0.7 Product Management API

All routes are under `/api/v1/products` and require authentication. There is no DELETE endpoint.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Paginated product list |
| POST | `/` | Create product |
| GET | `/check-duplicate` | Advisory name/model/brand duplicate check |
| GET | `/:productId` | Product details with creator/updater summaries |
| PATCH | `/:productId` | Update notes or correct protected fields |
| POST | `/:productId/archive` | Archive product |
| POST | `/:productId/restore` | Restore product |
| GET | `/:productId/label` | Printable product fields |
| GET | `/:productId/audit` | ADMIN product audit history |
| GET | `/:productId/service-jobs` | Paginated related service jobs |

## List Query

- `search`: name/model/brand contains match; barcode prefix match.
- `isActive=true|false`
- `brand`: case-insensitive exact match.
- `hasBarcode=true|false`
- `sortBy=name|model|brand|price|createdAt|updatedAt`
- `sortOrder=asc|desc`
- `page`, `pageSize` (maximum 100)

Sorting always appends product ID as a stable pagination tiebreaker.

## Duplicate Check

`GET /check-duplicate?name=...&model=...&brand=...` returns up to five active or archived matches. It is advisory and never blocks creation. Barcode uniqueness remains a hard conflict with HTTP 409 and `field: barcode` details.

## Sensitive Mutations

Protected updates and archive/restore accept `reason` and `accountPassword`. Invalid credentials leave product data unchanged and create an admin-verification failure record. Successful changes create Product `ServiceAudit` entries with changed values represented as API-safe strings.
