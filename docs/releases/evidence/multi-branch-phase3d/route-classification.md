# Complete API branch classification

Actual Express router walk, including nested mounts. 286 main routes: 154 scoped and 132 global. Three LAN scanner routes are separately global.

## Scoped prefixes

- `/api/v1/customers`
- `/api/v1/suppliers`
- `/api/v1/debts`
- `/api/v1/installment-plans`
- `/api/v1/payments`
- `/api/v1/financial-ledger`
- `/api/v1/receivables`
- `/api/v1/prepaid-purchases`
- `/api/v1/corrections`
- `/api/v1/sales-orders`
- `/api/v1/sales-returns`
- `/api/v1/service-jobs`
- `/api/v1/supplier-transactions`
- `/api/v1/supplier-purchases`
- `/api/v1/supplier-ledger`
- `/api/v1/inventory/receivings`
- `/api/v1/reports`
- `/api/v1/dashboard`
- `/api/v1/products/:productId/service-jobs`

`/products/:productId/service-jobs` is the branch-owned exception inside the global products group.

## Exact global allow-list

| Route | Reason |
|---|---|
| `GET /api/v1/health` | Process and database health, with no branch-owned records. |
| `POST /api/v1/auth/setup` | Identity and JWT session lifecycle are global. |
| `POST /api/v1/auth/login` | Identity and JWT session lifecycle are global. |
| `POST /api/v1/auth/logout` | Identity and JWT session lifecycle are global. |
| `POST /api/v1/auth/refresh` | Identity and JWT session lifecycle are global. |
| `GET /api/v1/auth/me` | Identity and JWT session lifecycle are global. |
| `PUT /api/v1/auth/password` | Identity and JWT session lifecycle are global. |
| `GET /api/v1/users` | User administration is global; branch grants are managed separately. |
| `POST /api/v1/users` | User administration is global; branch grants are managed separately. |
| `GET /api/v1/users/:id` | User administration is global; branch grants are managed separately. |
| `PUT /api/v1/users/:id` | User administration is global; branch grants are managed separately. |
| `DELETE /api/v1/users/:id` | User administration is global; branch grants are managed separately. |
| `GET /api/v1/branches/accessible` | Branch catalog and access administration define the accessible set. |
| `GET /api/v1/branches` | Branch catalog and access administration define the accessible set. |
| `POST /api/v1/branches` | Branch catalog and access administration define the accessible set. |
| `GET /api/v1/branches/access` | Branch catalog and access administration define the accessible set. |
| `GET /api/v1/branches/users/:userId/access` | Branch catalog and access administration define the accessible set. |
| `PUT /api/v1/branches/users/:userId/access` | Branch catalog and access administration define the accessible set. |
| `GET /api/v1/branches/:branchId` | Branch catalog and access administration define the accessible set. |
| `PATCH /api/v1/branches/:branchId` | Branch catalog and access administration define the accessible set. |
| `GET /api/v1/admin/exchange-rates` | Global FX configuration; stored transaction conversion amounts are unchanged. |
| `POST /api/v1/admin/exchange-rates` | Global FX configuration; stored transaction conversion amounts are unchanged. |
| `GET /api/v1/products` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products/imports` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/imports/:importId` | Shared product catalog, stock and pricing under D3. |
| `PATCH /api/v1/products/imports/:importId` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products/imports/:importId/commit` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/check-duplicate` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products/brands/normalize` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/brands` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/labels` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/pricing-cards/index` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/pricing-cards` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products/pricing-cards/print-snapshot` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products/labels/secret-preview` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/scan` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/:productId/label` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/:productId/pricing-card` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products/:productId/pricing-card/secret-preview` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/:productId/pricing-cards/prints` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products/:productId/label/secret-preview` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/:productId/image` | Shared product catalog, stock and pricing under D3. |
| `PUT /api/v1/products/:productId/image` | Shared product catalog, stock and pricing under D3. |
| `DELETE /api/v1/products/:productId/image` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/:productId/audit` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/:productId/inventory` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products/:productId/opening-count` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products/:productId/stock-movements` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/:productId/pricing-preview` | Shared product catalog, stock and pricing under D3. |
| `PATCH /api/v1/products/:productId/pricing` | Shared product catalog, stock and pricing under D3. |
| `PATCH /api/v1/products/:productId/sku` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products/:productId/regenerate-sku` | Shared product catalog, stock and pricing under D3. |
| `PATCH /api/v1/products/:productId/stock` | Shared product catalog, stock and pricing under D3. |
| `PATCH /api/v1/products/:productId/features` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products/:productId/archive` | Shared product catalog, stock and pricing under D3. |
| `POST /api/v1/products/:productId/restore` | Shared product catalog, stock and pricing under D3. |
| `PATCH /api/v1/products/:productId` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/products/:productId` | Shared product catalog, stock and pricing under D3. |
| `GET /api/v1/categories` | Shared product categories under D3. |
| `GET /api/v1/categories/:categoryId` | Shared product categories under D3. |
| `POST /api/v1/categories` | Shared product categories under D3. |
| `PATCH /api/v1/categories/:categoryId` | Shared product categories under D3. |
| `DELETE /api/v1/categories/:categoryId` | Shared product categories under D3. |
| `GET /api/v1/inventory/onboarding/pending` | Shared stock counts, onboarding and movements under D3; receivings are scoped. |
| `POST /api/v1/inventory/onboarding/batch` | Shared stock counts, onboarding and movements under D3; receivings are scoped. |
| `GET /api/v1/inventory/summary` | Shared stock counts, onboarding and movements under D3; receivings are scoped. |
| `GET /api/v1/inventory/low-stock` | Shared stock counts, onboarding and movements under D3; receivings are scoped. |
| `GET /api/v1/inventory/movements` | Shared stock counts, onboarding and movements under D3; receivings are scoped. |
| `GET /api/v1/pricing-presets` | Shared pricing configuration. |
| `POST /api/v1/pricing-presets` | Shared pricing configuration. |
| `GET /api/v1/pricing-presets/label-secret-settings` | Shared pricing configuration. |
| `PATCH /api/v1/pricing-presets/label-secret-settings` | Shared pricing configuration. |
| `POST /api/v1/pricing-presets/label-secret-encodings` | Shared pricing configuration. |
| `PATCH /api/v1/pricing-presets/label-secret-encodings/:encodingId` | Shared pricing configuration. |
| `GET /api/v1/pricing-presets/:presetId/audit` | Shared pricing configuration. |
| `POST /api/v1/pricing-presets/:presetId/archive` | Shared pricing configuration. |
| `POST /api/v1/pricing-presets/:presetId/restore` | Shared pricing configuration. |
| `POST /api/v1/pricing-presets/:presetId/set-default` | Shared pricing configuration. |
| `POST /api/v1/pricing-presets/:presetId/set-label-secret` | Shared pricing configuration. |
| `POST /api/v1/pricing-presets/:presetId/clear-label-secret` | Shared pricing configuration. |
| `PATCH /api/v1/pricing-presets/:presetId` | Shared pricing configuration. |
| `GET /api/v1/pricing-presets/:presetId` | Shared pricing configuration. |
| `POST /api/v1/pricing/calculate` | Global product pricing calculator. |
| `GET /api/v1/shop-profile` | Global shop presentation settings. |
| `PATCH /api/v1/shop-profile` | Global shop presentation settings. |
| `PUT /api/v1/shop-profile/logo` | Global shop presentation settings. |
| `GET /api/v1/brand-logos` | Shared catalog artwork. |
| `POST /api/v1/brand-logos` | Shared catalog artwork. |
| `PATCH /api/v1/brand-logos/:brandLogoId` | Shared catalog artwork. |
| `POST /api/v1/brand-logos/:brandLogoId/archive` | Shared catalog artwork. |
| `GET /api/v1/pricing-card-feature-icons` | Shared product artwork. |
| `POST /api/v1/pricing-card-feature-icons` | Shared product artwork. |
| `PATCH /api/v1/pricing-card-feature-icons/:featureIconId` | Shared product artwork. |
| `POST /api/v1/pricing-card-feature-icons/:featureIconId/archive` | Shared product artwork. |
| `GET /api/v1/pricing-card-templates/spec-catalog` | Shared product print templates. |
| `GET /api/v1/pricing-card-templates` | Shared product print templates. |
| `POST /api/v1/pricing-card-templates` | Shared product print templates. |
| `POST /api/v1/pricing-card-templates/:templateId/archive` | Shared product print templates. |
| `PATCH /api/v1/pricing-card-templates/:templateId` | Shared product print templates. |
| `GET /api/v1/pricing-card-templates/:templateId` | Shared product print templates. |
| `POST /api/v1/pricing-card-prints` | Global product print snapshots. |
| `GET /api/v1/pricing-card-prints/product/:productId` | Global product print snapshots. |
| `GET /api/v1/admin/backups/status` | Whole-database administration and restore. |
| `GET /api/v1/admin/backups/settings` | Whole-database administration and restore. |
| `PUT /api/v1/admin/backups/settings` | Whole-database administration and restore. |
| `GET /api/v1/admin/backups` | Whole-database administration and restore. |
| `POST /api/v1/admin/backups` | Whole-database administration and restore. |
| `POST /api/v1/admin/backups/import` | Whole-database administration and restore. |
| `POST /api/v1/admin/backups/:backupId/validate-restore` | Whole-database administration and restore. |
| `POST /api/v1/admin/backups/:backupId/restore` | Whole-database administration and restore. |
| `POST /api/v1/admin/diagnostics/report-error` | Global operational diagnostics. |
| `GET /api/v1/admin/diagnostics/health` | Global operational diagnostics. |
| `GET /api/v1/admin/diagnostics/errors` | Global operational diagnostics. |
| `GET /api/v1/admin/diagnostics/export` | Global operational diagnostics. |
| `POST /api/v1/admin/diagnostics/clear-errors` | Global operational diagnostics. |
| `GET /api/v1/admin/preflight` | Whole-installation readiness checks. |
| `GET /api/v1/admin/maintenance` | Whole-database migration maintenance. |
| `POST /api/v1/admin/maintenance/apply` | Whole-database migration maintenance. |
| `POST /api/v1/admin/maintenance/migrations/resolve` | Whole-database migration maintenance. |
| `GET /api/v1/admin/maintenance/thermal-reconcile-notes` | Whole-database migration maintenance. |
| `GET /api/v1/system/local-status` | Desktop process status. |
| `GET /api/v1/business-settings` | Singleton shop/document settings. |
| `PUT /api/v1/business-settings` | Singleton shop/document settings. |
| `POST /api/v1/scanner/pairing-code` | Global product-scanner sessions only; JWT supplier gateway requests use their destination scope. |
| `POST /api/v1/scanner/lan/enable` | Global product-scanner sessions only; JWT supplier gateway requests use their destination scope. |
| `POST /api/v1/scanner/lan/disable` | Global product-scanner sessions only; JWT supplier gateway requests use their destination scope. |
| `GET /api/v1/scanner/lan-status` | Global product-scanner sessions only; JWT supplier gateway requests use their destination scope. |
| `GET /api/v1/scanner/sessions` | Global product-scanner sessions only; JWT supplier gateway requests use their destination scope. |
| `POST /api/v1/scanner/sessions/:sessionId/revoke` | Global product-scanner sessions only; JWT supplier gateway requests use their destination scope. |
| `GET /api/v1/scanner/events/recent` | Global product-scanner sessions only; JWT supplier gateway requests use their destination scope. |
| `POST /api/v1/scanner/events` | Global product-scanner sessions only; JWT supplier gateway requests use their destination scope. |
| `POST /api/v1/scanner/pair` | Global product-scanner sessions only; JWT supplier gateway requests use their destination scope. |
| `GET /api/v1/scanner/session` | Global product-scanner sessions only; JWT supplier gateway requests use their destination scope. |
