-- =============================================================================
-- Normalize product brand spellings
-- =============================================================================
-- Authored:   2026-08-21
-- Derived from: homeconnect-2026-08-21-151618-manual.backup (404 products)
-- Affects:    public.products.brand only. One text column. Nothing else.
--
-- WHY THIS IS NOT IN backend/prisma/repair/
--   That folder is migration-repair SQL with strict provenance ("every file was
--   actually run on a business PC"). This is a one-off data cleanup, not a
--   migration repair, so it is kept separate and is NOT registered in
--   repair-registry.ts.
--
-- WHAT IT DOES
--   Collapses 20 brands that are stored under multiple spellings (kozano /
--   Kozano / KOZANO) onto one canonical spelling each. 205 distinct brand
--   strings become 179. Expect ~41 product rows to change.
--
-- WHAT IT DOES NOT DO
--   - Does not touch any product whose brand is already canonical.
--   - Does not touch price, cost, stock, SKU, barcode, or any relation.
--   - Does not bump "updatedAt". Prisma's @updatedAt is applied by the ORM, not
--     by the database, so a raw UPDATE leaves it alone. That is deliberate: a
--     spelling fix should not make 41 products look freshly edited in every
--     "recently updated" view. To change that, add
--       , "updatedAt" = now()
--     to the UPDATE below.
--
-- AUDIT GAP - READ THIS
--   Product edits made through the app write a row to "service_audits". This
--   script does not, because the audit writer lives in the application layer.
--   The change is therefore invisible to the product audit history in the
--   details drawer. That is an accepted trade for a cosmetic text fix on 41
--   rows; do not use this pattern for anything touching money or stock.
--
-- PRECONDITIONS
--   1. Take a fresh backup first. This script is transactional and idempotent,
--      but that is not a substitute for a backup.
--   2. Run with ON_ERROR_STOP so a failed guard aborts instead of continuing:
--
--      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 2026-08-21-normalize-product-brands.sql
--
--   3. Safe to re-run. After the first run it updates 0 rows.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE brand_merge (
  variant   text PRIMARY KEY,
  canonical text NOT NULL
) ON COMMIT DROP;

-- Canonical spelling = the majority spelling in the catalogue, except where
-- noted. Every decision is visible here; edit a canonical value if you disagree.
INSERT INTO brand_merge (variant, canonical) VALUES
  -- Clear majority
  ('Dsp',            'DSP'),            -- DSP 27 / Dsp 3
  ('KOZANO',         'Kozano'),         -- Kozano 18 / KOZANO 1 / kozano 1
  ('kozano',         'Kozano'),
  ('TCl',            'TCL'),            -- TCL 12 / TCl 1
  ('MAC',            'Mac'),            -- Mac 5 / MAC 4
  ('Platinum',       'PLATINUM'),       -- PLATINUM 5 / Platinum 3
  ('SAMSUNG',        'Samsung'),        -- Samsung 5 / SAMSUNG 1
  ('General',        'GENERAL'),        -- GENERAL 3 / General 2
  ('Elements',       'ELEMENTS'),       -- ELEMENTS 4 / Elements 1
  ('PHILIPS',        'Philips'),        -- Philips 3 / PHILIPS 1
  ('BrAun',          'Braun'),          -- Braun 2 / BrAun 1 / BRAUN 1
  ('BRAUN',          'Braun'),
  ('SOKANY',         'Sokany'),         -- Sokany 2 / SOKANY 1
  ('National star',  'National Star'),  -- National Star 2 / National star 1
  ('SONIFER',        'Sonifer'),        -- Sonifer 2 / SONIFER 1

  -- No majority spelling -> house style is Title Case
  ('KENWOOD',        'Kenwood'),        -- Kenwood 2 / KENWOOD 2 / KenWood 1
  ('KenWood',        'Kenwood'),
  ('starsat',        'StarSat'),        -- starsat 1 / STARSAT 1 / StarSat 1
  ('STARSAT',        'StarSat'),
  ('SILVER CREST',   'Silver Crest'),   -- 1 / 1
  ('MOULINEX',       'Moulinex'),       -- 1 / 1
  ('National pro',   'National Pro'),   -- 1 / 1
  ('GeBe',           'Gebe'),           -- 1 / 1

  -- JUDGEMENT CALLS - review these two before running
  --
  -- "General pro" is the majority spelling (4) but the lowercase "pro" reads as
  -- a typo, so Title Case is applied instead. This changes 6 rows rather than 3.
  -- To follow the majority instead, set both canonicals to 'General pro'.
  ('General pro',    'General Pro'),    -- General pro 4 / GENERAL PRO 2 / General Pro 1
  ('GENERAL PRO',    'General Pro'),
  --
  -- These two differ by spacing, not just case, so no case-fold would merge
  -- them. 'Super Chef' exists in neither row today - it is the Title Case form
  -- of the majority spelling. Delete these two lines to leave them untouched.
  ('SuperChef',      'Super Chef'),     -- SuperChef 1 / SUPER CHEF 2
  ('SUPER CHEF',     'Super Chef');

-- Deliberately NOT merged - these look similar but are distinct brands:
--   MAC        vs  MAC Styler
--   Hisense    vs  Hisense TV
--   GENERAL    vs  General Pro / General Gold / GENERAL OCEAN
-- Matching is by exact equality below, so none of them can be caught by accident.

-- -----------------------------------------------------------------------------
-- Preview: exactly which products change, and how
-- -----------------------------------------------------------------------------
SELECT
  p.sku,
  p.name,
  p.brand      AS brand_before,
  m.canonical  AS brand_after
FROM public.products p
JOIN brand_merge m ON p.brand = m.variant
WHERE p.brand <> m.canonical
ORDER BY m.canonical, p.brand, p.name;

-- -----------------------------------------------------------------------------
-- Guard: abort if the live database has drifted far from the backup this was
-- built against. 41 rows expected; anything past 60 means review before running.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  affected integer;
BEGIN
  SELECT count(*) INTO affected
  FROM public.products p
  JOIN brand_merge m ON p.brand = m.variant
  WHERE p.brand <> m.canonical;

  RAISE NOTICE 'Product rows to update: %', affected;

  IF affected > 60 THEN
    RAISE EXCEPTION
      'Aborted: % rows would change, expected at most 60. The catalogue has drifted from the 2026-08-21 backup - re-derive the merge map before running.',
      affected;
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Apply
-- -----------------------------------------------------------------------------
UPDATE public.products p
SET brand = m.canonical
FROM brand_merge m
WHERE p.brand = m.variant
  AND p.brand <> m.canonical;

-- -----------------------------------------------------------------------------
-- Verify: this must return ZERO rows. Any row here is a brand still stored
-- under more than one spelling once case and spacing are ignored.
-- -----------------------------------------------------------------------------
SELECT
  lower(regexp_replace(btrim(brand), '\s+', ' ', 'g')) AS normalized,
  count(DISTINCT brand)                                AS spellings,
  string_agg(DISTINCT brand, ' | ' ORDER BY brand)     AS variants,
  count(*)                                             AS products
FROM public.products
WHERE brand IS NOT NULL AND btrim(brand) <> ''
GROUP BY 1
HAVING count(DISTINCT brand) > 1
ORDER BY count(*) DESC;

-- Distinct brand strings remaining. Expected: 179 (was 205).
SELECT count(DISTINCT brand) AS distinct_brands
FROM public.products
WHERE brand IS NOT NULL AND btrim(brand) <> '';

COMMIT;

-- If the verify query above returned rows, or the count is not what you expect,
-- run ROLLBACK instead of COMMIT.
