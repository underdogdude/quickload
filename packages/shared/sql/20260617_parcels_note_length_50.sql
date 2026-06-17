-- Tighten parcels.note max length to 50 (safe if prior migration used 100).
ALTER TABLE parcels DROP CONSTRAINT IF EXISTS parcels_note_length_chk;

ALTER TABLE parcels
  ADD CONSTRAINT parcels_note_length_chk
  CHECK (note IS NULL OR char_length(note) <= 50);
