CREATE TABLE IF NOT EXISTS lego_settings (
  id integer PRIMARY KEY,
  inbox text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
