-- How often the shop PC syncs with the cloud relay during opening hours.
-- Default 15 minutes keeps the Neon free plan well under its compute limit.
ALTER TABLE "sync_worker_state" ADD COLUMN "sync_minutes" INTEGER NOT NULL DEFAULT 15
  CHECK ("sync_minutes" IN (10, 15, 30));
