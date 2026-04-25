-- Enforces the invariant: parcels.amount_paid = SUM(payments.amount WHERE status='succeeded' AND parcel_id=parcels.id).
-- This is enforced in the database — not application code — so any writer to `payments`
-- (admin tools, manual SQL, future code paths) cannot drift the column.

CREATE OR REPLACE FUNCTION refresh_parcel_amount_paid()
RETURNS TRIGGER AS $$
DECLARE
  parcel_ids uuid[];
  pid uuid;
BEGIN
  -- Recompute for both OLD and NEW parcel ids when an UPDATE moves a row
  -- between parcels; INSERT has only NEW, DELETE has only OLD.
  parcel_ids := ARRAY[]::uuid[];
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.parcel_id IS NOT NULL THEN
    parcel_ids := array_append(parcel_ids, NEW.parcel_id);
  END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.parcel_id IS NOT NULL
     AND (TG_OP = 'DELETE' OR NEW.parcel_id IS DISTINCT FROM OLD.parcel_id) THEN
    parcel_ids := array_append(parcel_ids, OLD.parcel_id);
  END IF;

  FOREACH pid IN ARRAY parcel_ids LOOP
    UPDATE parcels p
       SET amount_paid = COALESCE((
         SELECT SUM(amount)
           FROM payments
          WHERE parcel_id = pid
            AND status = 'succeeded'
       ), 0)
     WHERE p.id = pid;
  END LOOP;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_refresh_parcel_amount ON payments;
CREATE TRIGGER payments_refresh_parcel_amount
AFTER INSERT OR UPDATE OF status, amount, parcel_id OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION refresh_parcel_amount_paid();
