-- Irreversible: production was verified to contain zero legacy transaction rows
-- before this migration was created. ActivityLog is intentionally preserved.
DROP TABLE "transactions";

-- TransactionStatus exists in the deployed production schema but is absent from
-- the committed migration history, so tolerate either pre-migration state.
DROP TYPE IF EXISTS "TransactionStatus";
DROP TYPE "TransactionType";
