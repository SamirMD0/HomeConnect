-- Closes a T14 deployment gap rather than changing the VAT design.
--
-- `prisma/seed.ts` creates the LB_STANDARD and LB_ZERO tax rates and profiles,
-- but an upgraded installation never runs the seed: it runs `migrate deploy`
-- and nothing else. Every sales-order item and every supplier-purchase line
-- resolves its rate through TaxRepository.requireEffectiveProfile, which throws
-- when no active default profile exists. Without this migration, an existing
-- database gets the VAT schema and then fails the first sale and the first
-- purchase after upgrading, at the counter, with no way to recover from the UI.
--
-- Additive and idempotent. It writes no money, touches no existing row, and
-- inserts nothing that already exists by code, so re-running is a no-op.
--
-- `createdById` must reference a real user. On a brand-new database migrations
-- run before the seed and no user exists yet, so these statements insert
-- nothing and prisma/seed.ts creates the same rows moments later. On an
-- existing installation the admin account is already there and this fills the
-- gap the seed would otherwise have to.

INSERT INTO "tax_rates" ("id", "code", "name", "nameAr", "ratePercent", "effectiveFrom", "isActive", "createdById", "createdAt")
SELECT
  gen_random_uuid(),
  'LB_STANDARD',
  'Lebanon standard VAT',
  'ضريبة القيمة المضافة اللبنانية القياسية',
  11.000,
  DATE '2026-01-01',
  true,
  seed_author.id,
  CURRENT_TIMESTAMP
FROM (
  SELECT "id" FROM "users"
  WHERE "role" = 'ADMIN' AND "deletedAt" IS NULL
  ORDER BY "createdAt" ASC
  LIMIT 1
) AS seed_author
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "tax_rates" ("id", "code", "name", "nameAr", "ratePercent", "effectiveFrom", "isActive", "createdById", "createdAt")
SELECT
  gen_random_uuid(),
  'LB_ZERO',
  'Lebanon zero-rated VAT',
  'ضريبة القيمة المضافة اللبنانية بنسبة صفر',
  0.000,
  DATE '2026-01-01',
  true,
  seed_author.id,
  CURRENT_TIMESTAMP
FROM (
  SELECT "id" FROM "users"
  WHERE "role" = 'ADMIN' AND "deletedAt" IS NULL
  ORDER BY "createdAt" ASC
  LIMIT 1
) AS seed_author
ON CONFLICT ("code") DO NOTHING;

-- isDefault is computed rather than hardcoded true. A partial unique index
-- allows only one active default profile, so an installation that already
-- nominated a different default keeps it and this insert does not collide.
INSERT INTO "tax_profiles" ("id", "code", "name", "nameAr", "taxRateId", "isDefault", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  'LB_STANDARD',
  'Standard-rated',
  'خاضع للنسبة القياسية',
  rate."id",
  NOT EXISTS (SELECT 1 FROM "tax_profiles" WHERE "isDefault" = true AND "isActive" = true),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tax_rates" AS rate
WHERE rate."code" = 'LB_STANDARD'
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "tax_profiles" ("id", "code", "name", "nameAr", "taxRateId", "isDefault", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  'LB_ZERO',
  'Zero-rated',
  'خاضع لنسبة صفر',
  rate."id",
  false,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tax_rates" AS rate
WHERE rate."code" = 'LB_ZERO'
ON CONFLICT ("code") DO NOTHING;
