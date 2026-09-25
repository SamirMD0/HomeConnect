-- Seeds the pure black-on-white shelf template for XP-80T style 203 dpi
-- thermal printers. Physical dimensions are 76 x 50 mm — the largest a
-- standard 80 mm-wide thermal roll can hold once you leave a 2 mm margin
-- per side. Anything wider prints scaled-down (the browser shrinks the
-- whole page to fit) and the barcode collapses below the scan-safe
-- module. ON CONFLICT keeps re-runs safe; the row is never overwritten
-- if an operator has already customised it.

INSERT INTO "pricing_card_templates" ("id","name","description","paperMode","paperSize","cardWidthMm","cardHeightMm","configVersion","config","featureMax","specKeyOrder","defaultValidityDays") VALUES
('20000000-0000-4000-8000-000000000005','Appliance Shelf Thermal','Black-on-white shelf card sized for XP-80T thermal printers (76 x 50 mm on 80 mm roll)','SINGLE_STICKER',NULL,76,50,1,$${"configVersion":1,"header":{"companyLogo":{"show":false,"sizeMm":6,"position":"left"},"brand":{"display":"logo","position":"right","sizeMm":8}},"body":{"title":{"show":true,"maxLines":2,"fontScale":0.9},"model":{"show":true,"prefix":"Model: "},"dimensions":{"show":false},"specs":{"show":false,"maxRows":0},"image":{"show":false,"columnWidthPct":0}},"features":{"show":true,"layout":"row","showLabels":true,"showValues":false},"price":{"show":true,"fontScale":0.85,"weight":900,"emphasis":"plain","prominence":"hero","validUntil":{"show":true,"format":"dmy"}},"sku":{"show":true,"showSecretCode":true,"prefix":"SKU: "},"barcode":{"show":true,"showDigits":true,"targetWidthMm":50},"appearance":{"marginMm":2,"innerGapMm":1.2,"borderPx":0,"sectionDividers":false,"fontScale":0.9,"orientation":"landscape","layout":"centered","palette":"thermal"}}$$::jsonb,4,ARRAY['capacity_kg','capacity_l','spin_speed_rpm','energy_rating','dimensions'],30)
ON CONFLICT ("id") DO NOTHING;
