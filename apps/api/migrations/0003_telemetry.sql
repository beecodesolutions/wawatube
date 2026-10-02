CREATE TABLE IF NOT EXISTS telemetry_daily (day date PRIMARY KEY, seconds integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS telemetry_video_views (media_item_id uuid PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE, views integer NOT NULL DEFAULT 0);
