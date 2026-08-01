CREATE TYPE "DebtKind" AS ENUM ('STANDARD', 'PREPAID_PURCHASE');

ALTER TABLE "debts"
ADD COLUMN "kind" "DebtKind" NOT NULL DEFAULT 'STANDARD';

CREATE INDEX "debts_kind_idx" ON "debts"("kind");
