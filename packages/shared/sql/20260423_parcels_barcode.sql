-- Postal barcode from Smartpost (e.g. WB…TH); `tracking_id` holds Smartpost tracking code when available.
ALTER TABLE parcels
ADD COLUMN IF NOT EXISTS barcode text;

CREATE INDEX IF NOT EXISTS parcels_barcode_idx ON parcels (barcode);
