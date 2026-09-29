ALTER TABLE "shop_profiles"
ADD COLUMN "categoryDefaultTemplates" JSONB NOT NULL DEFAULT '{}'::jsonb;
