-- The enum value was committed by the preceding migration. The digits remain
-- actionable percentage steps; generated letters are camouflage only.
INSERT INTO "label_secret_encoding_presets" (
  "id", "name", "mode", "prefix", "suffix", "offset", "decimalPlaces", "isActive"
) VALUES (
  '6d66215e-8224-4c1c-9cd6-70c8c2ffde03',
  'Automatic staged discount',
  'STAGED_DISCOUNT',
  '',
  '',
  0,
  0,
  true
) ON CONFLICT ("id") DO NOTHING;
