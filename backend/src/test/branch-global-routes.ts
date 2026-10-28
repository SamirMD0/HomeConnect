// Exact routes: a new global endpoint needs an explicit classification here.
export const globalRouteGroups = [
  { group: "health", reason: "Process and database health, with no branch-owned records.", routes: [
  "GET /api/v1/health"
] },
  { group: "auth", reason: "Identity and JWT session lifecycle are global.", routes: [
  "POST /api/v1/auth/setup",
  "POST /api/v1/auth/login",
  "POST /api/v1/auth/logout",
  "POST /api/v1/auth/refresh",
  "GET /api/v1/auth/me",
  "PUT /api/v1/auth/password"
] },
  { group: "users", reason: "User administration is global; branch grants are managed separately.", routes: [
  "GET /api/v1/users",
  "POST /api/v1/users",
  "GET /api/v1/users/:id",
  "PUT /api/v1/users/:id",
  "DELETE /api/v1/users/:id"
] },
  { group: "branches", reason: "Branch catalog and access administration define the accessible set.", routes: [
  "GET /api/v1/branches/accessible",
  "GET /api/v1/branches",
  "POST /api/v1/branches",
  "GET /api/v1/branches/access",
  "GET /api/v1/branches/users/:userId/access",
  "PUT /api/v1/branches/users/:userId/access",
  "GET /api/v1/branches/:branchId",
  "PATCH /api/v1/branches/:branchId"
] },
  { group: "admin/exchange-rates", reason: "Global FX configuration; stored transaction conversion amounts are unchanged.", routes: [
  "GET /api/v1/admin/exchange-rates",
  "POST /api/v1/admin/exchange-rates"
] },
  { group: "products", reason: "Shared product catalog, stock and pricing under D3.", routes: [
  "GET /api/v1/products",
  "POST /api/v1/products",
  "POST /api/v1/products/imports",
  "GET /api/v1/products/imports/:importId",
  "PATCH /api/v1/products/imports/:importId",
  "POST /api/v1/products/imports/:importId/commit",
  "GET /api/v1/products/check-duplicate",
  "POST /api/v1/products/brands/normalize",
  "GET /api/v1/products/brands",
  "GET /api/v1/products/labels",
  "GET /api/v1/products/pricing-cards/index",
  "GET /api/v1/products/pricing-cards",
  "POST /api/v1/products/pricing-cards/print-snapshot",
  "POST /api/v1/products/labels/secret-preview",
  "GET /api/v1/products/scan",
  "GET /api/v1/products/:productId/label",
  "GET /api/v1/products/:productId/pricing-card",
  "POST /api/v1/products/:productId/pricing-card/secret-preview",
  "GET /api/v1/products/:productId/pricing-cards/prints",
  "POST /api/v1/products/:productId/label/secret-preview",
  "GET /api/v1/products/:productId/image",
  "PUT /api/v1/products/:productId/image",
  "DELETE /api/v1/products/:productId/image",
  "GET /api/v1/products/:productId/audit",
  "GET /api/v1/products/:productId/inventory",
  "POST /api/v1/products/:productId/opening-count",
  "POST /api/v1/products/:productId/stock-movements",
  "GET /api/v1/products/:productId/pricing-preview",
  "PATCH /api/v1/products/:productId/pricing",
  "PATCH /api/v1/products/:productId/sku",
  "POST /api/v1/products/:productId/regenerate-sku",
  "PATCH /api/v1/products/:productId/stock",
  "PATCH /api/v1/products/:productId/features",
  "POST /api/v1/products/:productId/archive",
  "POST /api/v1/products/:productId/restore",
  "PATCH /api/v1/products/:productId",
  "GET /api/v1/products/:productId"
] },
  { group: "categories", reason: "Shared product categories under D3.", routes: [
  "GET /api/v1/categories",
  "GET /api/v1/categories/:categoryId",
  "POST /api/v1/categories",
  "PATCH /api/v1/categories/:categoryId",
  "DELETE /api/v1/categories/:categoryId"
] },
  { group: "inventory", reason: "Shared stock counts, onboarding and movements under D3; receivings are scoped.", routes: [
  "GET /api/v1/inventory/onboarding/pending",
  "POST /api/v1/inventory/onboarding/batch",
  "GET /api/v1/inventory/summary",
  "GET /api/v1/inventory/low-stock",
  "GET /api/v1/inventory/movements"
] },
  { group: "pricing-presets", reason: "Shared pricing configuration.", routes: [
  "GET /api/v1/pricing-presets",
  "POST /api/v1/pricing-presets",
  "GET /api/v1/pricing-presets/label-secret-settings",
  "PATCH /api/v1/pricing-presets/label-secret-settings",
  "POST /api/v1/pricing-presets/label-secret-encodings",
  "PATCH /api/v1/pricing-presets/label-secret-encodings/:encodingId",
  "GET /api/v1/pricing-presets/:presetId/audit",
  "POST /api/v1/pricing-presets/:presetId/archive",
  "POST /api/v1/pricing-presets/:presetId/restore",
  "POST /api/v1/pricing-presets/:presetId/set-default",
  "POST /api/v1/pricing-presets/:presetId/set-label-secret",
  "POST /api/v1/pricing-presets/:presetId/clear-label-secret",
  "PATCH /api/v1/pricing-presets/:presetId",
  "GET /api/v1/pricing-presets/:presetId"
] },
  { group: "pricing", reason: "Global product pricing calculator.", routes: [
  "POST /api/v1/pricing/calculate"
] },
  { group: "shop-profile", reason: "Global shop presentation settings.", routes: [
  "GET /api/v1/shop-profile",
  "PATCH /api/v1/shop-profile",
  "PUT /api/v1/shop-profile/logo"
] },
  { group: "brand-logos", reason: "Shared catalog artwork.", routes: [
  "GET /api/v1/brand-logos",
  "POST /api/v1/brand-logos",
  "PATCH /api/v1/brand-logos/:brandLogoId",
  "POST /api/v1/brand-logos/:brandLogoId/archive"
] },
  { group: "pricing-card-feature-icons", reason: "Shared product artwork.", routes: [
  "GET /api/v1/pricing-card-feature-icons",
  "POST /api/v1/pricing-card-feature-icons",
  "PATCH /api/v1/pricing-card-feature-icons/:featureIconId",
  "POST /api/v1/pricing-card-feature-icons/:featureIconId/archive"
] },
  { group: "pricing-card-templates", reason: "Shared product print templates.", routes: [
  "GET /api/v1/pricing-card-templates/spec-catalog",
  "GET /api/v1/pricing-card-templates",
  "POST /api/v1/pricing-card-templates",
  "POST /api/v1/pricing-card-templates/:templateId/archive",
  "PATCH /api/v1/pricing-card-templates/:templateId",
  "GET /api/v1/pricing-card-templates/:templateId"
] },
  { group: "pricing-card-prints", reason: "Global product print snapshots.", routes: [
  "POST /api/v1/pricing-card-prints",
  "GET /api/v1/pricing-card-prints/product/:productId"
] },
  { group: "admin/backups", reason: "Whole-database administration and restore.", routes: [
  "GET /api/v1/admin/backups/status",
  "GET /api/v1/admin/backups/settings",
  "PUT /api/v1/admin/backups/settings",
  "GET /api/v1/admin/backups",
  "POST /api/v1/admin/backups",
  "POST /api/v1/admin/backups/import",
  "POST /api/v1/admin/backups/:backupId/validate-restore",
  "POST /api/v1/admin/backups/:backupId/restore"
] },
  { group: "admin/diagnostics", reason: "Global operational diagnostics.", routes: [
  "POST /api/v1/admin/diagnostics/report-error",
  "GET /api/v1/admin/diagnostics/health",
  "GET /api/v1/admin/diagnostics/errors",
  "GET /api/v1/admin/diagnostics/export",
  "POST /api/v1/admin/diagnostics/clear-errors"
] },
  { group: "admin/preflight", reason: "Whole-installation readiness checks.", routes: [
  "GET /api/v1/admin/preflight"
] },
  { group: "admin/maintenance", reason: "Whole-database migration maintenance.", routes: [
  "GET /api/v1/admin/maintenance",
  "POST /api/v1/admin/maintenance/apply",
  "POST /api/v1/admin/maintenance/migrations/resolve",
  "GET /api/v1/admin/maintenance/thermal-reconcile-notes"
] },
  { group: "system", reason: "Desktop process status.", routes: [
  "GET /api/v1/system/local-status"
] },
  { group: "business-settings", reason: "Singleton shop/document settings.", routes: [
  "GET /api/v1/business-settings",
  "PUT /api/v1/business-settings"
] },
  { group: 'scanner', reason: 'Global product-scanner sessions only; JWT supplier gateway requests use their destination scope.', routes: [
  "POST /api/v1/scanner/pairing-code",
  "POST /api/v1/scanner/lan/enable",
  "POST /api/v1/scanner/lan/disable",
  "GET /api/v1/scanner/lan-status",
  "GET /api/v1/scanner/sessions",
  "POST /api/v1/scanner/sessions/:sessionId/revoke",
  "GET /api/v1/scanner/events/recent",
  "POST /api/v1/scanner/events",
  "POST /api/v1/scanner/pair",
  "GET /api/v1/scanner/session"
] },
] as const;

export const globalRoutes = new Map<string, string>(globalRouteGroups.flatMap((group) => group.routes.map((route) => [route, group.reason] as [string, string])));
export const scannerGlobalReasons: Record<string, string> = {
  "POST /api/v1/scanner/pairing-code": "Creates a product-scanner pairing code; no branch-owned data.",
  "POST /api/v1/scanner/lan/enable": "Enables the global product-scanner listener.",
  "POST /api/v1/scanner/lan/disable": "Disables the global scanner listener and sessions.",
  "GET /api/v1/scanner/lan-status": "Reports global listener availability.",
  "GET /api/v1/scanner/sessions": "Lists product-scanner device sessions only.",
  "POST /api/v1/scanner/sessions/:sessionId/revoke": "Revokes a global product-scanner device session.",
  "GET /api/v1/scanner/events/recent": "Reads product code scan events only.",
  "POST /api/v1/scanner/events": "Records a global product code scan only (desktop or paired phone).",
  "POST /api/v1/scanner/pair": "Pairs a product scanner; session token cannot authorize supplier APIs.",
  "GET /api/v1/scanner/session": "Reports product-scanner session expiry/device label only."
};
