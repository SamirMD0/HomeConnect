-- Refresh previously synced records with PC-owned financial and inventory detail.
-- The worker's staged snapshot keeps the current relay cache readable meanwhile.
UPDATE sync_worker_state SET snapshot_done = false, snapshot_progress = NULL WHERE id = 1;
