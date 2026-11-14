BEGIN;
CREATE TABLE relay_devices (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  branch_ids UUID[] NOT NULL,
  name TEXT NOT NULL,
  token_sha256 TEXT NOT NULL UNIQUE CHECK (token_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE SEQUENCE relay_record_rev_seq AS BIGINT;
CREATE TABLE relay_records (
  entity TEXT NOT NULL,
  entity_id UUID NOT NULL,
  branch_id UUID,
  op TEXT NOT NULL CHECK (op IN ('upsert', 'delete')),
  data JSONB,
  rev BIGINT NOT NULL DEFAULT 0,
  pc_seq TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity, entity_id),
  CHECK (op <> 'delete' OR data IS NULL)
);
CREATE INDEX relay_records_rev_idx ON relay_records (rev);
CREATE INDEX relay_records_branch_id_rev_idx ON relay_records (branch_id, rev);
-- Allocate revisions after taking the producer lock. A committed higher revision
-- therefore cannot hide an earlier uncommitted record from a device cursor.
CREATE FUNCTION relay_assign_record_rev() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(74104, 1);
  NEW.rev := nextval('relay_record_rev_seq');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER relay_records_rev BEFORE INSERT OR UPDATE ON relay_records
FOR EACH ROW EXECUTE FUNCTION relay_assign_record_rev();

CREATE TABLE relay_outbox (
  id UUID PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES relay_devices(id),
  user_id UUID NOT NULL,
  branch_id UUID NOT NULL,
  type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','claimed','applied','refused','failed')),
  claimed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  result JSONB,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX relay_outbox_status_received_at_idx ON relay_outbox (status, received_at);
CREATE INDEX relay_outbox_device_id_received_at_idx ON relay_outbox (device_id, received_at);
CREATE TABLE relay_blobs (
  id UUID PRIMARY KEY,
  outbox_id UUID NOT NULL UNIQUE REFERENCES relay_outbox(id) ON DELETE CASCADE,
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  bytes BYTEA NOT NULL,
  size INTEGER NOT NULL CHECK (size BETWEEN 1 AND 2097152 AND size = octet_length(bytes)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX relay_blobs_created_at_idx ON relay_blobs (created_at);
CREATE TABLE relay_usage (
  day DATE PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  bytes_in BIGINT NOT NULL DEFAULT 0,
  bytes_out BIGINT NOT NULL DEFAULT 0,
  records_written INTEGER NOT NULL DEFAULT 0,
  actions_received INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE relay_worker (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_seen_at TIMESTAMPTZ,
  last_pc_seq TEXT NOT NULL DEFAULT '0',
  last_upkeep_at TIMESTAMPTZ
);
INSERT INTO relay_worker (id) VALUES (1);
COMMIT;
