BEGIN;
ALTER TABLE relay_records ADD COLUMN previous_branch_ids UUID[] NOT NULL DEFAULT '{}';
CREATE INDEX relay_records_previous_branch_ids_idx ON relay_records USING GIN (previous_branch_ids);
ALTER TABLE relay_worker ADD COLUMN pruned_through_rev BIGINT NOT NULL DEFAULT 0;
ALTER TABLE relay_outbox ADD COLUMN photo_mime TEXT, ADD COLUMN photo_size INTEGER;

-- Widen the installed CHECK atomically to permit the photo readiness state.
ALTER TABLE relay_outbox
  DROP CONSTRAINT relay_outbox_status_check,
  ADD CONSTRAINT relay_outbox_status_check
    CHECK (status IN ('awaiting_photo','pending','claimed','applied','refused','failed')),
  ADD CONSTRAINT relay_outbox_photo_declaration_check CHECK (
    (photo_mime IS NULL AND photo_size IS NULL)
    OR (photo_mime IS NOT NULL AND photo_size IS NOT NULL
      AND photo_mime IN ('image/jpeg','image/png','image/webp') AND photo_size BETWEEN 1 AND 2097152)
  ),
  ADD CONSTRAINT relay_outbox_awaiting_photo_check CHECK (
    status <> 'awaiting_photo' OR (photo_mime IS NOT NULL AND photo_size IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION relay_assign_record_rev() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(74104, 1);
  IF TG_OP = 'UPDATE' THEN
    NEW.previous_branch_ids := OLD.previous_branch_ids;
    IF OLD.branch_id IS NOT NULL AND OLD.branch_id IS DISTINCT FROM NEW.branch_id
      AND NOT (OLD.branch_id = ANY(NEW.previous_branch_ids)) THEN
      NEW.previous_branch_ids := array_append(NEW.previous_branch_ids, OLD.branch_id);
    END IF;
  END IF;
  NEW.rev := nextval('relay_record_rev_seq');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
COMMIT;
