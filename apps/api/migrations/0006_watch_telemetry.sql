CREATE TABLE IF NOT EXISTS watch_sessions (
  id uuid PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE TABLE IF NOT EXISTS video_views (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES watch_sessions(id) ON DELETE CASCADE,
  media_item_id uuid NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  watched_seconds integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  CONSTRAINT video_views_watched_seconds_check CHECK (watched_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS video_views_session_id_idx
  ON video_views (session_id);
CREATE INDEX IF NOT EXISTS video_views_media_item_id_idx
  ON video_views (media_item_id);
