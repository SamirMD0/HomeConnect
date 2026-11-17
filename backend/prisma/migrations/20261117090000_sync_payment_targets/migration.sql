-- Backfill existing phone copies with the complete bounded payment-target projection.
UPDATE sync_worker_state SET snapshot_done = false, snapshot_progress = NULL WHERE id = 1;
