-- Add explicit parcel type column on parcels, then backfill from latest order.
ALTER TABLE parcels
ADD COLUMN IF NOT EXISTS parcel_type text;

-- Backfill from orders.product_inbox (latest order per parcel).
WITH latest_order AS (
  SELECT DISTINCT ON (o.parcel_id)
    o.parcel_id,
    NULLIF(TRIM(o.product_inbox), '') AS product_inbox
  FROM orders o
  WHERE o.product_inbox IS NOT NULL
  ORDER BY o.parcel_id, o.created_at DESC
)
UPDATE parcels p
SET parcel_type = lo.product_inbox
FROM latest_order lo
WHERE p.id = lo.parcel_id
  AND (p.parcel_type IS NULL OR TRIM(p.parcel_type) = '');

CREATE INDEX IF NOT EXISTS parcels_parcel_type_idx ON parcels(parcel_type);
