-- HomeConnect business-PC repair (1 of 2): add the AUTO label barcode source.
--
-- PostgreSQL refuses to *use* a new enum value in the transaction that added it
-- (SQLSTATE 55P04 "unsafe use of new value"), and RepairRunner applies every
-- statement of one repair inside a single transaction so a failure rolls back
-- cleanly. Adding the value and using it therefore have to be two repairs:
-- this one adds it, and "product-label-auto-apply" uses it once this has
-- committed. The manifest lists them in that order.
--
-- Safe to run more than once. Touches no rows.

ALTER TYPE "LabelBarcodeSource" ADD VALUE IF NOT EXISTS 'AUTO';

-- Reads the catalogue rather than the enum itself, so it is safe in the same
-- transaction that added the value.
SELECT count(*) AS "autoLabelSourceValue"
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'LabelBarcodeSource' AND e.enumlabel = 'AUTO';
