ALTER TABLE "products"
ADD COLUMN "pricingCardTemplateId" UUID;

CREATE INDEX "products_pricingCardTemplateId_idx"
ON "products"("pricingCardTemplateId");

ALTER TABLE "products"
ADD CONSTRAINT "products_pricingCardTemplateId_fkey"
FOREIGN KEY ("pricingCardTemplateId") REFERENCES "pricing_card_templates"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
