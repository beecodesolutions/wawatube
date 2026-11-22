CREATE TABLE IF NOT EXISTS lego_moc_progress (
  moc_id text PRIMARY KEY,
  page integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lego_moc_progress_page_check CHECK (page >= 1)
);
