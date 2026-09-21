-- Switch the shipped TV Large template to the retail-hero (centered) layout so
-- the default matches the reference: brand mark centered at the top with a
-- red divider, body centered, hero red price in the middle, features under
-- it, slim SKU/barcode footer. Pinned to the seeded id AND guarded on
-- absence of the `layout` key so an operator who has since customised the
-- template is never overwritten. New installs pick up the same value from
-- the seed JSON.

UPDATE "pricing_card_templates"
SET "config" = jsonb_set("config", '{appearance,layout}', '"centered"'::jsonb, true)
WHERE "id" = '20000000-0000-4000-8000-000000000001'
  AND "config" #>> '{appearance,layout}' IS NULL;
