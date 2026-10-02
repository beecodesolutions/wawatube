ALTER TABLE playlist_imports ADD COLUMN IF NOT EXISTS monitor boolean NOT NULL DEFAULT false;
ALTER TABLE playlist_imports ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;
