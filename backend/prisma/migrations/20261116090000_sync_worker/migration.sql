CREATE TABLE sync_worker_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT false,
  relay_url text,
  worker_secret_encrypted text,
  opening_start time NOT NULL DEFAULT '07:00',
  opening_end time NOT NULL DEFAULT '22:00',
  last_pushed_seq text NOT NULL DEFAULT '0',
  snapshot_done boolean NOT NULL DEFAULT false,
  -- Resume a large snapshot across bounded cycles, retaining its original cursor.
  snapshot_progress jsonb,
  last_cycle_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_date_refresh date
);
INSERT INTO sync_worker_state (id) VALUES (1);
CREATE TABLE sync_applied_actions (
  action_id uuid PRIMARY KEY,
  type text NOT NULL,
  status text NOT NULL CHECK (status IN ('applied', 'refused')),
  result jsonb NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
