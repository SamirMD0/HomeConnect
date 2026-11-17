ALTER TABLE sync_worker_state ADD COLUMN figure_snapshots jsonb NOT NULL DEFAULT '{}';
-- Label all existing projections and backfill figures through normal worker work.
UPDATE sync_worker_state SET snapshot_done=false,snapshot_progress=NULL;
