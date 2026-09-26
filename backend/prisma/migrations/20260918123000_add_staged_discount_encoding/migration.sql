-- v2.0.1: randomized staff-only discount steps. This enum change is isolated
-- because PostgreSQL cannot use a newly-added enum value until commit.
ALTER TYPE "LabelSecretEncodingMode" ADD VALUE IF NOT EXISTS 'STAGED_DISCOUNT';
