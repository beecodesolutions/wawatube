ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS thumbnail_media_id uuid
  REFERENCES media_items(id) ON DELETE SET NULL;
