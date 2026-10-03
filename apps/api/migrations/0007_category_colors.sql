ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS color text;

DO $$ BEGIN
  ALTER TABLE categories
    ADD CONSTRAINT category_color_check
    CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
