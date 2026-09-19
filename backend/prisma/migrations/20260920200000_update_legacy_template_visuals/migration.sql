-- Legacy template visual parity pass. The seeded compact and large legacy
-- templates were introduced with borderPx=0 and sectionDividers=false, but the
-- ProductLabel they replace draws a 1px slate outer border and a 1px black
-- divider above the price. This migration brings the seeded templates in line
-- with the legacy look so operators cannot tell the two systems apart at 58x40
-- and 72x50 stock. Idempotent: rerunning has no visible effect because the
-- jsonb_set values are the target state.

UPDATE "pricing_card_templates"
SET "config" = jsonb_set(
      jsonb_set("config", '{appearance,borderPx}', '1'::jsonb, false),
      '{appearance,sectionDividers}', 'true'::jsonb, false
    )
WHERE "id" IN (
  '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000004'
);
