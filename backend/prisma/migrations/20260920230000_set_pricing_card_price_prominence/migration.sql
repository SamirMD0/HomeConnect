-- Price prominence (VISUAL_DESIGN §4). The config gains `price.prominence`,
-- which picks the base price size: normal 6 mm, large 10 mm, hero 14 mm. The
-- schema defaults an absent value to 'normal', so every template that is not
-- touched here keeps the size it was drawn at and no backfill is needed.
--
-- The two shipped shelf templates move to 'hero'. Their price `fontScale`
-- multiplies the tier, and they were carrying 1.6 and 1.4 to fake prominence
-- against the old flat 6 mm base; left alone that would render 22 mm and 20 mm
-- of price on a 105 mm and an 80 mm card. Resetting the scale to 1 puts both at
-- the 14 mm the spec asks for and hands the multiplier back to the operator.
--
-- Pinned to the two seeded ids, and guarded on `prominence` still being absent:
-- rerunning is a no-op, and a template an operator has already tuned since this
-- release keeps its own values.

UPDATE "pricing_card_templates"
SET "config" = jsonb_set(
      jsonb_set("config", '{price,prominence}', '"hero"'::jsonb, true),
      '{price,fontScale}', '1'::jsonb, false
    )
WHERE "id" IN (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
)
AND "config" #>> '{price,prominence}' IS NULL;

-- Hero needs the room, and the header is where the spec says to find it: §6 caps
-- the shop logo at 6-8 mm ("not the visual anchor") and §5 puts the brand mark at
-- 10 mm, but the two shelf templates shipped at 18/16 mm and 14/12 mm. The header
-- row is as tall as its tallest mark, so both have to come down together. Pinned
-- to the same two seeded ids and guarded on the sizes still being the shipped
-- ones, so a template an operator has resized keeps its own values.

UPDATE "pricing_card_templates"
SET "config" = jsonb_set(
      jsonb_set("config", '{header,companyLogo,sizeMm}', '8'::jsonb, false),
      '{header,brand,sizeMm}', '10'::jsonb, false
    )
WHERE "id" IN (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002'
)
AND ("config" #>> '{header,companyLogo,sizeMm}') IN ('18', '14');
