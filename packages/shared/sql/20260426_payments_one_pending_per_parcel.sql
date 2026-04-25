-- Prevent duplicate pending payments per parcel — guards against the React-StrictMode
-- + dev-server "double useEffect" race that lets two concurrent POST /api/payment/charges
-- both pass the "no existing pending" check and insert two pending rows for the same parcel.
--
-- Partial unique index: at most one row per parcel where status = 'pending'.
-- Drops first to clean up any pre-existing duplicates that would block index creation.

-- Resolve any existing duplicates: keep the most recent pending per parcel, expire the rest.
WITH duplicates AS (
  SELECT id,
         row_number() OVER (PARTITION BY parcel_id ORDER BY created_at DESC, id DESC) AS rn
    FROM payments
   WHERE status = 'pending'
)
UPDATE payments p
   SET status = 'expired', updated_at = now()
  FROM duplicates d
 WHERE p.id = d.id
   AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS payments_one_pending_per_parcel_idx
  ON payments (parcel_id)
  WHERE status = 'pending';
