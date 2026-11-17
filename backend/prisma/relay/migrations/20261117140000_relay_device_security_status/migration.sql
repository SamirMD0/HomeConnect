ALTER TABLE relay_devices ADD COLUMN pin_set boolean NOT NULL DEFAULT false;
ALTER TABLE relay_devices ADD COLUMN last_unlock_at timestamptz NULL;
