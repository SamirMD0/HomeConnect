ALTER TABLE relay_records ADD COLUMN min_role text NULL CHECK (min_role IS NULL OR min_role = 'ADMIN');
ALTER TABLE relay_snapshot_records ADD COLUMN min_role text NULL CHECK (min_role IS NULL OR min_role = 'ADMIN');
UPDATE relay_records SET min_role='ADMIN' WHERE entity IN ('report','user');
