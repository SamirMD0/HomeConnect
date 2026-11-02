-- Allow an administrator to merge two records of the same customer.
--
-- A sale with a counter payment keeps its customer: changing either side alone
-- breaks the rule that the payment's customer matches its sale's. A merge has
-- to repoint both in one transaction, so both triggers now stand aside when
-- that transaction set homeconnect.customer_merge = 'on' (SET LOCAL, so it
-- ends with the transaction). Only the merge service sets it. Nothing here
-- changes any row.

CREATE OR REPLACE FUNCTION validate_counter_payment_customer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_customer UUID;
BEGIN
  IF NEW."salesOrderId" IS NOT NULL
     AND coalesce(current_setting('homeconnect.customer_merge', true), '') <> 'on' THEN
    SELECT "customerId" INTO source_customer FROM "sales_orders" WHERE "id" = NEW."salesOrderId" FOR SHARE;
    IF NOT FOUND OR source_customer IS DISTINCT FROM NEW."customerId" THEN
      RAISE EXCEPTION 'Counter payment customer must match the source sale';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_counter_sale_customer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."customerId" IS DISTINCT FROM OLD."customerId"
     AND coalesce(current_setting('homeconnect.customer_merge', true), '') <> 'on'
     AND EXISTS (SELECT 1 FROM "payments" WHERE "salesOrderId" = OLD."id") THEN
    RAISE EXCEPTION 'Cannot change the customer identity of a receipted sale';
  END IF;
  RETURN NEW;
END;
$$;
