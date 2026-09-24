-- Seeds the pure black-on-white shelf template for XP-80T style 203 dpi
-- thermal printers. Structurally identical to the shipped Appliance Shelf
-- (same dimensions, same spec order, same feature set) — only the palette
-- changes, so an operator with a thermal printer picks this template and
-- gets a card that survives the printer's palette instead of tuning every
-- color themselves. ON CONFLICT keeps re-runs safe; the row is never
-- overwritten if an operator has already customised it.

INSERT INTO "pricing_card_templates" ("id","name","description","paperMode","paperSize","cardWidthMm","cardHeightMm","configVersion","config","featureMax","specKeyOrder","defaultValidityDays") VALUES
('20000000-0000-4000-8000-000000000005','Appliance Shelf Thermal','Shelf card for appliances, pure black-on-white for XP-80T thermal printers','SINGLE_STICKER',NULL,120,80,1,$${"configVersion":1,"header":{"companyLogo":{"show":false,"sizeMm":8,"position":"left"},"brand":{"display":"logo","position":"right","sizeMm":13}},"body":{"title":{"show":true,"maxLines":2,"fontScale":1.1},"model":{"show":true,"prefix":"Model: "},"dimensions":{"show":true},"specs":{"show":true,"maxRows":1},"image":{"show":false,"columnWidthPct":0}},"features":{"show":true,"layout":"row","showLabels":true,"showValues":false},"price":{"show":true,"fontScale":1,"weight":900,"emphasis":"plain","prominence":"hero","validUntil":{"show":true,"format":"dmy"}},"sku":{"show":true,"showSecretCode":true,"prefix":"SKU: "},"barcode":{"show":true,"showDigits":true,"targetWidthMm":60},"appearance":{"marginMm":4,"innerGapMm":2,"borderPx":1,"sectionDividers":false,"fontScale":1,"orientation":"landscape","layout":"centered","palette":"thermal"}}$$::jsonb,4,ARRAY['capacity_kg','capacity_l','spin_speed_rpm','energy_rating','dimensions'],30)
ON CONFLICT ("id") DO NOTHING;
