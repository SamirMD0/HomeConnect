-- A deposit handed over with an unpaid balance now becomes ONE invoice for the
-- full price, carrying the deposit's receipts as its payment history (like the
-- old system: SI for the full amount, RV receipts against it). Previously the
-- invoice was only the unpaid remainder and the receipts stayed on the deposit.
--
-- Balances do not change: the invoice gains the moved receipts' amount on both
-- sides (original amount and paid), so its remaining balance, status, the
-- customer statement and the dashboard totals stay the same.

ALTER TABLE "prepaid_purchases" ADD COLUMN "receiptsMovedAt" TIMESTAMP(3);

-- Converted deposits whose invoice is still live (not cancelled).
CREATE TEMP TABLE "_prepaid_to_move" ON COMMIT DROP AS
SELECT
  pp."id"              AS "prepaidId",
  pp."debtId"          AS "depositDebtId",
  pp."remainderDebtId" AS "invoiceId",
  dep."description"    AS "depositDescription",
  COALESCE((
    SELECT SUM(pa."amount")
    FROM "payment_allocations" pa
    JOIN "payments" p ON p."id" = pa."paymentId"
    WHERE pa."debtId" = pp."debtId" AND pa."voidedAt" IS NULL AND p."voidedAt" IS NULL
  ), 0) AS "movedAmount",
  (
    SELECT MAX(pa."createdAt") FROM "payment_allocations" pa WHERE pa."debtId" = pp."debtId"
  ) AS "lastReceiptAt"
FROM "prepaid_purchases" pp
JOIN "debts" dep ON dep."id" = pp."debtId"
JOIN "debts" inv ON inv."id" = pp."remainderDebtId"
WHERE pp."status" = 'DELIVERED'
  AND inv."status" <> 'CANCELLED'
  AND inv."cancelledAt" IS NULL;

-- Grow the invoice by what the deposit already collected.
UPDATE "debts" d
SET "originalAmount"     = d."originalAmount" + m."movedAmount",
    "baseOriginalAmount" = d."baseOriginalAmount" + m."movedAmount",
    "description"        = CASE WHEN d."description" = 'Balance for ' || m."depositDescription"
                                THEN m."depositDescription" ELSE d."description" END,
    "updatedAt"          = CURRENT_TIMESTAMP
FROM "_prepaid_to_move" m
WHERE d."id" = m."invoiceId";

-- Re-point the deposit's receipts (voided ones too, for history) at the invoice.
UPDATE "payment_allocations" pa
SET "debtId" = m."invoiceId"
FROM "_prepaid_to_move" m
WHERE pa."debtId" = m."depositDebtId";

UPDATE "prepaid_purchases" pp
SET "receiptsMovedAt" = COALESCE(m."lastReceiptAt", pp."updatedAt")
FROM "_prepaid_to_move" m
WHERE pp."id" = m."prepaidId";
