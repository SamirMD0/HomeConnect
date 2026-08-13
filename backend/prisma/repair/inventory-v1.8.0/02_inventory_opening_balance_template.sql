-- =====================================================================
-- HomeConnect v1.8.0 — Verified opening balance TEMPLATE
-- =====================================================================
--
-- *** THIS IS A TEMPLATE. DO NOT RUN IT AS-IS. ***
--
-- It ships with an EMPTY product list on purpose. Run it unedited and it
-- does nothing at all.
--
-- ---------------------------------------------------------------------
-- WHY THERE IS NO AUTOMATIC BACKFILL
-- ---------------------------------------------------------------------
--   The existing products."stockQuantity" values are NOT verified business
--   data. They were entered through an absolute-overwrite screen with no
--   history, and nobody has counted the shelves against them.
--
--   Copying those numbers into an OPENING_BALANCE movement would dress up
--   unverified data as an audited ledger entry — signed, timestamped, and
--   far more convincing than the loose number it came from. That is worse
--   than leaving the number alone, because the next person would believe it.
--
--   THE PHYSICAL COUNT IS THE TRUTH. The old stockQuantity is a hint about
--   which products to go and count.
--
-- ---------------------------------------------------------------------
-- WHAT "VERIFIED" MEANS — all five, per product, before it goes in the list
-- ---------------------------------------------------------------------
--   1. Product name confirmed as the real product.
--   2. SKU / barcode confirmed, or confirmed as intentionally blank.
--   3. Active / archived status confirmed.
--   4. trackStock decision confirmed (should this product be tracked at all?).
--   5. PHYSICAL COUNT confirmed by someone who counted the units.
--
-- ---------------------------------------------------------------------
-- WHAT THIS SCRIPT DOES, PER LISTED PRODUCT
-- ---------------------------------------------------------------------
--   a. Verifies the product exists. Unknown ids abort the whole run.
--   b. Refuses to act twice: a product that already has an OPENING_BALANCE
--      is skipped and reported, never duplicated.
--   c. Inserts ONE OPENING_BALANCE movement:
--         quantityBefore = 0          (the ledger starts here)
--         quantityChange = verified count
--         quantityAfter  = verified count
--      and records the superseded old value in the note, so nothing is lost.
--   d. Sets products."stockQuantity" to the verified count, and
--      products."trackStock" to the confirmed decision.
--
--   After this runs, the product's stockQuantity and its ledger agree, and
--   03_inventory_reconciliation_check.sql will report it as OK.
--
-- ---------------------------------------------------------------------
-- WHAT IT WILL NEVER DO
-- ---------------------------------------------------------------------
--   * touch a product that is not in the list below
--   * set any stockQuantity to 0 unless you explicitly verified it as 0
--   * change trackStock other than to the value you explicitly supply
--   * delete or archive any product
--   * DROP, TRUNCATE, or DELETE anything
--   * read or write customers, debts, payments, suppliers, sales orders,
--     service jobs, or any financial table
--
-- ---------------------------------------------------------------------
-- HOW TO RUN IT SAFELY
-- ---------------------------------------------------------------------
--   1. Take a verified database backup. Restore it somewhere to prove it works.
--   2. Run 01_inventory_preflight_report.sql and read it.
--   3. Go and count the products you intend to onboard.
--   4. Fill in the VALUES list below. Start with a handful, not everything.
--   5. Run this script. It ends in ROLLBACK, so the first run changes NOTHING
--      and only shows you what it would do.
--   6. Read the verification output at the bottom.
--   7. Only if it is correct: change the final ROLLBACK to COMMIT and re-run.
--   8. Run 03_inventory_reconciliation_check.sql and confirm zero mismatches.
--
--   Onboard in small batches. A batch you can check by eye is a batch you
--   can undo by hand.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- STEP 1 — The verified product list. THIS IS THE ONLY PART YOU EDIT.
-- ---------------------------------------------------------------------
--   One row per product you have physically counted:
--
--     ('<product uuid>', <verified physical count>, <true|false trackStock>, '<who counted / when>')
--
--   Get the uuid from section 5 or 6 of the preflight report.
--
--   verified_count MAY BE 0. That is a legitimate verified result meaning
--   "we counted, there are none", and it is the ONLY case in the whole
--   system where a movement may have quantityChange = 0. Every other
--   movement type requires a non-zero change.
--
--   Recording the zero matters: without it, a product genuinely holding no
--   stock could never be onboarded, and an un-onboarded product refuses all
--   later stock actions. The zero row is what lets someone add the first
--   unit tomorrow.
--
--   EXAMPLE (commented out — delete the comment markers and edit):
--
--     ('11111111-2222-3333-4444-555555555555', 12, true,  'counted by Ali, 2026-08-14'),
--     ('66666666-7777-8888-9999-000000000000',  0, true,  'counted by Ali, 2026-08-14'),
--     ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',  3, false, 'counted, not worth tracking')
--
CREATE TEMPORARY TABLE _verified_opening_balance (
  product_id      uuid    NOT NULL,
  verified_count  integer NOT NULL,
  track_stock     boolean NOT NULL,
  counted_by_note text    NOT NULL,
  opening_balance_created boolean NOT NULL DEFAULT false
) ON COMMIT DROP;

INSERT INTO _verified_opening_balance (product_id, verified_count, track_stock, counted_by_note)
SELECT * FROM (VALUES
  -- >>> ADD YOUR VERIFIED ROWS HERE <<<
  -- ('11111111-2222-3333-4444-555555555555', 12, true, 'counted by Ali, 2026-08-14'),
  (NULL::uuid, NULL::integer, NULL::boolean, NULL::text)   -- sentinel; filtered out below
) AS v(product_id, verified_count, track_stock, counted_by_note)
WHERE v.product_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- STEP 2 — Who is recording this. OPTIONAL.
-- ---------------------------------------------------------------------
--   NULL means "system / migration", which is correct for a data-onboarding
--   run: nobody used the app to do it, so no employee should be named as
--   having done it. Put a real users.id here only if a specific person is
--   accountable for the whole batch.
CREATE TEMPORARY TABLE _opening_balance_actor (created_by_id uuid) ON COMMIT DROP;
INSERT INTO _opening_balance_actor (created_by_id) VALUES (NULL);


-- ---------------------------------------------------------------------
-- STEP 3 — Guard: every listed id must exist. Abort the whole run if not.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  missing_count integer;
  negative_count integer;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM _verified_opening_balance v
  LEFT JOIN "products" p ON p."id" = v.product_id
  WHERE p."id" IS NULL;

  IF missing_count > 0 THEN
    RAISE EXCEPTION
      'ABORTED: % listed product id(s) do not exist. Fix the list; nothing was changed.',
      missing_count;
  END IF;

  SELECT COUNT(*) INTO negative_count
  FROM _verified_opening_balance WHERE verified_count < 0;

  IF negative_count > 0 THEN
    RAISE EXCEPTION
      'ABORTED: % row(s) have a negative verified_count. Stock cannot be negative.',
      negative_count;
  END IF;
END $$;


-- ---------------------------------------------------------------------
-- STEP 4 — Show what will be skipped as already onboarded.
--   Re-running this script is safe: an existing OPENING_BALANCE wins.
-- ---------------------------------------------------------------------
SELECT
  'SKIPPED - already onboarded' AS outcome,
  p."id", p."sku", p."name", p."stockQuantity" AS current_quantity,
  v.verified_count
FROM _verified_opening_balance v
JOIN "products" p ON p."id" = v.product_id
WHERE EXISTS (
  SELECT 1 FROM "stock_movements" m
  WHERE m."productId" = v.product_id
    AND m."movementType" = 'OPENING_BALANCE'
);


-- ---------------------------------------------------------------------
-- STEP 5 — Insert the opening balance movements and remember exactly which
--   input rows were inserted by THIS run. The flag is transaction-local and
--   is the only authority STEP 6 may use when updating products.
-- ---------------------------------------------------------------------
WITH inserted AS (
  INSERT INTO "stock_movements" (
    "id", "productId", "movementType",
    "quantityChange", "quantityBefore", "quantityAfter",
    "reason", "note", "referenceType", "referenceId",
    "createdById", "createdAt"
  )
  SELECT
    gen_random_uuid(),
    v.product_id,
    'OPENING_BALANCE',
    v.verified_count,          -- quantityChange
    0,                         -- quantityBefore: the ledger starts here
    v.verified_count,          -- quantityAfter
    'Verified opening balance from physical count',
    concat(
      v.counted_by_note,
      ' | superseded prior recorded quantity: ', p."stockQuantity"::text,
      ' | prior trackStock: ', p."trackStock"::text
    ),
    'MANUAL',
    NULL,
    (SELECT created_by_id FROM _opening_balance_actor),
    now()
  FROM _verified_opening_balance v
  JOIN "products" p ON p."id" = v.product_id
  WHERE NOT EXISTS (
    SELECT 1 FROM "stock_movements" m
    WHERE m."productId" = v.product_id
      AND m."movementType" = 'OPENING_BALANCE'
  )
  RETURNING "productId"
)
UPDATE _verified_opening_balance v
SET opening_balance_created = true
FROM inserted i
WHERE v.product_id = i."productId";


-- ---------------------------------------------------------------------
-- STEP 6 — Align the product row with the verified count.
--   Only products marked by STEP 5 as having received a NEW opening balance
--   in this transaction are touched. Already-onboarded products are skipped
--   completely even if their submitted count or track_stock value changed.
-- ---------------------------------------------------------------------
UPDATE "products" p
SET "stockQuantity" = v.verified_count,
    "trackStock"    = v.track_stock,
    "updatedAt"     = now()
FROM _verified_opening_balance v
WHERE p."id" = v.product_id
  AND v.opening_balance_created;


-- ---------------------------------------------------------------------
-- STEP 7 — Verification. READ THIS BEFORE COMMITTING.
--   Every row must show status = 'OK'.
-- ---------------------------------------------------------------------
SELECT
  CASE
    WHEN NOT v.opening_balance_created
      THEN 'SKIPPED - already onboarded; product unchanged'
    WHEN p."stockQuantity" = v.verified_count
     AND p."trackStock"    = v.track_stock
     AND COALESCE(SUM(m."quantityChange"), 0) = p."stockQuantity"
      THEN 'OK - new opening balance created'
    ELSE 'PROBLEM - DO NOT COMMIT'
  END                                    AS status,
  p."id", p."sku", p."name",
  v.verified_count                       AS submitted_verified_count,
  v.opening_balance_created,
  p."stockQuantity"                      AS product_quantity_now,
  COALESCE(SUM(m."quantityChange"), 0)   AS ledger_sum,
  p."trackStock"                         AS track_stock_now
FROM _verified_opening_balance v
JOIN "products" p ON p."id" = v.product_id
LEFT JOIN "stock_movements" m ON m."productId" = p."id"
GROUP BY p."id", p."sku", p."name", p."stockQuantity", p."trackStock", v.verified_count, v.track_stock, v.opening_balance_created
ORDER BY status DESC, p."name";


-- =====================================================================
-- STEP 8 — COMMIT OR ROLLBACK
-- =====================================================================
--   The script ends in ROLLBACK deliberately. Nothing above has been saved.
--   Read STEP 7. If every row says OK and the numbers are the ones you
--   counted, change the line below to COMMIT; and run the script again.
-- =====================================================================

ROLLBACK;
-- COMMIT;
