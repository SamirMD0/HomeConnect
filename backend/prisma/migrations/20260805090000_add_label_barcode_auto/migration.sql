-- PostgreSQL cannot use a newly-added enum value in the transaction that adds
-- it, so AUTO is introduced in its own Prisma migration.
ALTER TYPE "LabelBarcodeSource" ADD VALUE IF NOT EXISTS 'AUTO';
