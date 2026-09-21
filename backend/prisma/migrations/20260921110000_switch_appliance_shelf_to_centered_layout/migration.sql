-- Switch the shipped Appliance Shelf template to the retail-hero (centered)
-- layout so the two shipped shelf templates share the reference look. Same
-- guard pattern as the TV Large migration: pinned to the seeded id and only
-- fires when `appearance.layout` is still absent, so a template an operator
-- has since customised is never overwritten. New installs pick up the same
-- value from the seed JSON.

UPDATE "pricing_card_templates"
SET "config" = jsonb_set("config", '{appearance,layout}', '"centered"'::jsonb, true)
WHERE "id" = '20000000-0000-4000-8000-000000000002'
  AND "config" #>> '{appearance,layout}' IS NULL;
