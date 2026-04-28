-- Thailand Post item id on parcel: 13 chars (typically WB + 9 digits + TH). `tracking_id` holds Smartpost tracking when available.
ALTER TABLE parcels
ADD COLUMN IF NOT EXISTS barcode text;

CREATE INDEX IF NOT EXISTS parcels_barcode_idx ON parcels (barcode);
