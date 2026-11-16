ALTER TABLE relay_worker ADD COLUMN snapshot_id uuid,
  ADD COLUMN snapshot_pc_seq text,
  ADD COLUMN completed_snapshot_id uuid;
CREATE TABLE relay_snapshot_records (
  snapshot_id uuid NOT NULL,
  entity text NOT NULL,
  entity_id uuid NOT NULL,
  branch_id uuid,
  op text NOT NULL CHECK (op IN ('upsert', 'delete')),
  data jsonb,
  PRIMARY KEY (snapshot_id, entity, entity_id)
);
