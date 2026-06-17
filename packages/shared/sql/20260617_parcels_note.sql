-- Optional user remark from /send (max 50 characters).
ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS note text;

DO $$
BEGIN
  ALTER TABLE parcels
    ADD CONSTRAINT parcels_note_length_chk
    CHECK (note IS NULL OR char_length(note) <= 50);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
