-- HomeConnect service status repair. Safe to run more than once.
-- Run while connected to the HomeConnect business database.

ALTER TYPE "ServiceJobStatus" ADD VALUE IF NOT EXISTS 'COMPANY_HOME_MAINTENANCE';
ALTER TYPE "ServiceJobStatus" ADD VALUE IF NOT EXISTS 'PRODUCT_EXCHANGE';

SELECT enumlabel AS "serviceStatus"
FROM pg_enum
WHERE enumtypid = '"ServiceJobStatus"'::regtype
ORDER BY enumsortorder;
