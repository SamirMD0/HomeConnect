-- Forward migration: reconcile historical thermal template variants.
-- Historical applied migration files and records remain unchanged.
--
-- Purpose
-- =======
-- 20260924100000 originally seeded the Appliance Shelf Thermal template at
-- 120x80 mm (variant A). Commit e9bbeda then edited that migration file to
-- reseed at 76x50 mm (variant B) after it had already been applied to the
-- production database. 20260924110000 refined 76x50 to the current 76x80
-- layout (variant C) but its guard only recognises variant B rows. Any
-- installation still on variant A is therefore stuck at the pre-refinement
-- geometry with hero-prominence pricing.
--
-- This migration converges variant A OR variant B to variant C using strict
-- equality on every field the historical seed owned. Operator customisations
-- are preserved. A structured audit note is written to the new
-- `_thermal_template_reconcile_notes` table for every installation so the
-- outcome is inspectable after the fact — even the "no-op" path leaves a
-- trail. Applied migration files and `_prisma_migrations` rows are NOT
-- touched.

CREATE TABLE IF NOT EXISTS "_thermal_template_reconcile_notes" (
  "id" BIGSERIAL PRIMARY KEY,
  "runAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "outcome" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "diffFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]
);

DO $reconcile$
DECLARE
  target_id UUID := '20000000-0000-4000-8000-000000000005';
  variant_a_config JSONB := '{"configVersion":1,"header":{"companyLogo":{"show":false,"sizeMm":8,"position":"left"},"brand":{"display":"logo","position":"right","sizeMm":13}},"body":{"title":{"show":true,"maxLines":2,"fontScale":1.1},"model":{"show":true,"prefix":"Model: "},"dimensions":{"show":true},"specs":{"show":true,"maxRows":1},"image":{"show":false,"columnWidthPct":0}},"features":{"show":true,"layout":"row","showLabels":true,"showValues":false},"price":{"show":true,"fontScale":1,"weight":900,"emphasis":"plain","prominence":"hero","validUntil":{"show":true,"format":"dmy"}},"sku":{"show":true,"showSecretCode":true,"prefix":"SKU: "},"barcode":{"show":true,"showDigits":true,"targetWidthMm":60},"appearance":{"marginMm":4,"innerGapMm":2,"borderPx":1,"sectionDividers":false,"fontScale":1,"orientation":"landscape","layout":"centered","palette":"thermal"}}'::JSONB;
  variant_b_config JSONB := '{"configVersion":1,"header":{"companyLogo":{"show":false,"sizeMm":6,"position":"left"},"brand":{"display":"logo","position":"right","sizeMm":8}},"body":{"title":{"show":true,"maxLines":2,"fontScale":0.9},"model":{"show":true,"prefix":"Model: "},"dimensions":{"show":false},"specs":{"show":false,"maxRows":0},"image":{"show":false,"columnWidthPct":0}},"features":{"show":true,"layout":"row","showLabels":true,"showValues":false},"price":{"show":true,"fontScale":0.85,"weight":900,"emphasis":"plain","prominence":"hero","validUntil":{"show":true,"format":"dmy"}},"sku":{"show":true,"showSecretCode":true,"prefix":"SKU: "},"barcode":{"show":true,"showDigits":true,"targetWidthMm":50},"appearance":{"marginMm":2,"innerGapMm":1.2,"borderPx":0,"sectionDividers":false,"fontScale":0.9,"orientation":"landscape","layout":"centered","palette":"thermal"}}'::JSONB;
  variant_c_config JSONB := '{"configVersion":1,"header":{"companyLogo":{"show":true,"sizeMm":10,"position":"left"},"brand":{"display":"logo","position":"right","sizeMm":8}},"body":{"title":{"show":true,"maxLines":2,"fontScale":0.8},"detailsFontScale":0.9,"detailsBoldBlack":true,"model":{"show":true,"prefix":"Model: "},"dimensions":{"show":true},"specs":{"show":true,"maxRows":1},"image":{"show":false,"columnWidthPct":0}},"features":{"show":true,"layout":"row","showLabels":true,"showValues":false},"price":{"show":true,"fontScale":0.8,"weight":900,"emphasis":"plain","prominence":"large","validUntil":{"show":true,"format":"dmy"}},"sku":{"show":true,"showSecretCode":true,"prefix":"SKU: "},"barcode":{"show":true,"showDigits":true,"targetWidthMm":50},"appearance":{"marginMm":2,"innerGapMm":1,"borderPx":1,"sectionDividers":true,"fontScale":0.9,"orientation":"portrait","layout":"stack","palette":"thermal"}}'::JSONB;
  expected_spec_keys TEXT[] := ARRAY['capacity_kg','capacity_l','spin_speed_rpm','energy_rating','dimensions'];
  row_snapshot pricing_card_templates%ROWTYPE;
  diff TEXT[];
  matches_a BOOLEAN;
  matches_b BOOLEAN;
  matches_c BOOLEAN;
  expected_description TEXT;
  expected_width NUMERIC;
  expected_height NUMERIC;
  expected_feature_max INTEGER;
  expected_config JSONB;
BEGIN
  SELECT * INTO row_snapshot FROM pricing_card_templates WHERE id = target_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO "_thermal_template_reconcile_notes" ("outcome","reason")
      VALUES ('NO_ROW','Appliance Shelf Thermal row absent — nothing to reconcile.');
    RETURN;
  END IF;

  -- Strict equality against every field the historical seed owned. name,
  -- paperMode, paperSize, configVersion, specKeyOrder and defaultValidityDays
  -- are identical between variants A and B so they anchor both matches.
  matches_a := row_snapshot.name = 'Appliance Shelf Thermal'
    AND row_snapshot."paperMode" = 'SINGLE_STICKER'
    AND row_snapshot."paperSize" IS NULL
    AND row_snapshot."cardWidthMm" = 120.00
    AND row_snapshot."cardHeightMm" = 80.00
    AND row_snapshot."configVersion" = 1
    AND row_snapshot."featureMax" = 4
    AND row_snapshot."specKeyOrder" = expected_spec_keys
    AND row_snapshot."defaultValidityDays" = 30
    AND row_snapshot.description = 'Shelf card for appliances, pure black-on-white for XP-80T thermal printers'
    AND row_snapshot.config = variant_a_config;

  matches_b := row_snapshot.name = 'Appliance Shelf Thermal'
    AND row_snapshot."paperMode" = 'SINGLE_STICKER'
    AND row_snapshot."paperSize" IS NULL
    AND row_snapshot."cardWidthMm" = 76.00
    AND row_snapshot."cardHeightMm" = 50.00
    AND row_snapshot."configVersion" = 1
    AND row_snapshot."featureMax" = 4
    AND row_snapshot."specKeyOrder" = expected_spec_keys
    AND row_snapshot."defaultValidityDays" = 30
    AND row_snapshot.description = 'Black-on-white shelf card sized for XP-80T thermal printers (76 x 50 mm on 80 mm roll)'
    AND row_snapshot.config = variant_b_config;

  matches_c := row_snapshot.name = 'Appliance Shelf Thermal'
    AND row_snapshot."paperMode" = 'SINGLE_STICKER'
    AND row_snapshot."paperSize" IS NULL
    AND row_snapshot."configVersion" = 1
    AND row_snapshot."specKeyOrder" = expected_spec_keys
    AND row_snapshot."defaultValidityDays" = 30
    AND row_snapshot."cardWidthMm" = 76.00
    AND row_snapshot."cardHeightMm" = 80.00
    AND row_snapshot."featureMax" = 2
    AND row_snapshot.config = variant_c_config
    AND row_snapshot.description = 'Black-on-white shelf card sized for 80 mm thermal printers (76 x 80 mm)';

  IF matches_c THEN
    INSERT INTO "_thermal_template_reconcile_notes" ("outcome","reason")
      VALUES ('ALREADY_CURRENT','Row already at variant C (76x80 refined); no action.');
    RETURN;
  END IF;

  IF matches_a OR matches_b THEN
    UPDATE pricing_card_templates SET
      description = 'Black-on-white shelf card sized for 80 mm thermal printers (76 x 80 mm)',
      "cardWidthMm" = 76,
      "cardHeightMm" = 80,
      config = variant_c_config,
      "featureMax" = 2,
      "updatedAt" = NOW()
      WHERE id = target_id;
    INSERT INTO "_thermal_template_reconcile_notes" ("outcome","reason")
      VALUES (
        CASE WHEN matches_a THEN 'CONVERGED_FROM_VARIANT_A' ELSE 'CONVERGED_FROM_VARIANT_B' END,
        CASE WHEN matches_a THEN 'Converged untouched 120x80 seed to 76x80 refinement.'
             ELSE 'Converged untouched 76x50 intermediate seed to 76x80 refinement.' END
      );
    RETURN;
  END IF;

  -- Pick the closest shipped variant by dimensions, then by config if the
  -- dimensions themselves were customised. A hybrid of otherwise known values
  -- must still report the field that prevents an exact seed match.
  IF (row_snapshot."cardWidthMm", row_snapshot."cardHeightMm") = (120.00,80.00)
    OR (row_snapshot.config = variant_a_config
      AND (row_snapshot."cardWidthMm", row_snapshot."cardHeightMm") NOT IN ((76.00,50.00),(76.00,80.00))) THEN
    expected_description := 'Shelf card for appliances, pure black-on-white for XP-80T thermal printers';
    expected_width := 120.00; expected_height := 80.00;
    expected_feature_max := 4; expected_config := variant_a_config;
  ELSIF (row_snapshot."cardWidthMm", row_snapshot."cardHeightMm") = (76.00,50.00)
    OR (row_snapshot.config = variant_b_config
      AND (row_snapshot."cardWidthMm", row_snapshot."cardHeightMm") <> (76.00,80.00)) THEN
    expected_description := 'Black-on-white shelf card sized for XP-80T thermal printers (76 x 50 mm on 80 mm roll)';
    expected_width := 76.00; expected_height := 50.00;
    expected_feature_max := 4; expected_config := variant_b_config;
  ELSE
    expected_description := 'Black-on-white shelf card sized for 80 mm thermal printers (76 x 80 mm)';
    expected_width := 76.00; expected_height := 80.00;
    expected_feature_max := 2; expected_config := variant_c_config;
  END IF;

  -- Only seed-owned fields are compared; product assignments and audit fields
  -- are deliberately excluded so legitimate external references survive.
  diff := ARRAY[]::TEXT[];
  IF row_snapshot.name IS DISTINCT FROM 'Appliance Shelf Thermal' THEN diff := array_append(diff, 'name'); END IF;
  IF row_snapshot."paperMode" IS DISTINCT FROM 'SINGLE_STICKER' THEN diff := array_append(diff, 'paperMode'); END IF;
  IF row_snapshot."paperSize" IS NOT NULL THEN diff := array_append(diff, 'paperSize'); END IF;
  IF row_snapshot."configVersion" IS DISTINCT FROM 1 THEN diff := array_append(diff, 'configVersion'); END IF;
  IF row_snapshot."specKeyOrder" IS DISTINCT FROM expected_spec_keys THEN diff := array_append(diff, 'specKeyOrder'); END IF;
  IF row_snapshot."defaultValidityDays" IS DISTINCT FROM 30 THEN diff := array_append(diff, 'defaultValidityDays'); END IF;
  IF row_snapshot.description IS DISTINCT FROM expected_description THEN diff := array_append(diff, 'description'); END IF;
  IF row_snapshot."cardWidthMm" IS DISTINCT FROM expected_width OR row_snapshot."cardHeightMm" IS DISTINCT FROM expected_height
    THEN diff := array_append(diff, 'dimensions'); END IF;
  IF row_snapshot.config IS DISTINCT FROM expected_config THEN diff := array_append(diff, 'config'); END IF;
  IF row_snapshot."featureMax" IS DISTINCT FROM expected_feature_max THEN diff := array_append(diff, 'featureMax'); END IF;

  INSERT INTO "_thermal_template_reconcile_notes" ("outcome","reason","diffFields")
    VALUES (
      'SKIPPED_CUSTOMISED',
      'Row diverges from every known shipped seed; operator customisation preserved. Inspect the listed fields and decide whether to hand-migrate.',
      diff
    );
END;
$reconcile$;
