-- Minutes of each UTC day (0-1439) that had a database request. Used to
-- estimate Neon compute-hours against the free plan. Additive only.
ALTER TABLE "relay_usage" ADD COLUMN "active_minutes" INTEGER[] NOT NULL DEFAULT '{}';
