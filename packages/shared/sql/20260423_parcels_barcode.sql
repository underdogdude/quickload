-- Opaque carrier barcode on parcel. `tracking_id` holds SmartPost tracking/reference when available.
ALTER TABLE parcels
ADD COLUMN IF NOT EXISTS barcode text;

CREATE INDEX IF NOT EXISTS parcels_barcode_idx ON parcels (barcode);
