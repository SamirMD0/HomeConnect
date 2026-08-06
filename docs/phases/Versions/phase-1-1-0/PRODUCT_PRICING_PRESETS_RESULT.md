# Product Pricing Presets v1.1.0 Result

## Delivered

- Additive Prisma pricing preset model, product pricing configuration, audit enum extensions, and single-default partial index.
- Decimal-safe COMPOUND/SIMPLE calculator, four rounding modes, exact down-payment subtraction, and final-installment residual handling.
- Authenticated preset list/detail and calculator APIs.
- Administrator-protected create/update/archive/restore/set-default and product-pricing mutations with reason, account-password verification, and audit records.
- Product preset/custom/default resolution, archived-preset warning, normal unavailable states, and admin-only stored cost exposure.
- Responsive bilingual Pricing Presets page and product pricing previews.
- Separate calculated cash and manual price presentation, with explicit protected copy action.
- Manual preset setup guidance, business-PC SQL, release notes, and Windows installer.

## Arithmetic Correction

The planning example claimed `300 × 1.10 × 1.07 × 1.07 = 377.55`. Exact Decimal arithmetic gives `377.817`, rounded once to `377.82`. The implementation follows the documented formula and records this correction in tests and documentation.

## Verification

- `npm run lint`: passed with 0 errors; existing repository warnings remain.
- `npm run typecheck`: passed.
- `npm run test`: 538 passed, 4 skipped.
- `npm run build`: passed; Vite reports the existing large-bundle warning.
- `npm run prisma:validate`: passed.
- `npm run build:electron-main`: passed.
- `npm run dist:win`: passed.

## Release Artifacts

```text
release/1.1.0/HomeConnect-Setup-1.1.0.exe
release/1.1.0/HomeConnect-Setup-1.1.0.exe.blockmap
release/1.1.0/win-unpacked/HomeConnect.exe
release/1.1.0/upgrade-v1.1.0-pricing-presets-business-pc-safe.sql
```

The packaged GUI was not manually exercised in this checkpoint. Apply the database migration or guarded business-PC SQL before opening Product or Pricing Preset screens on an upgraded database.
