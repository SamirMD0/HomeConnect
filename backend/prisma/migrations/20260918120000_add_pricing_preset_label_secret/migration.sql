-- v2.0.1: the pricing preset whose cash price becomes the hidden staff code on
-- printed labels. Additive and idempotent; at most one active preset is flagged.
ALTER TABLE "pricing_presets" ADD COLUMN IF NOT EXISTS "isLabelSecret" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "pricing_presets_single_label_secret"
  ON "pricing_presets" ("isLabelSecret")
  WHERE "isLabelSecret" = true AND "archivedAt" IS NULL;
