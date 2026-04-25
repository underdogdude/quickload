-- Enforces the invariant: parcels.amount_paid = SUM(payments.amount WHERE status='succeeded' AND parcel_id=parcels.id).
-- This is enforced in the database — not application code — so any writer to `payments`
-- (admin tools, manual SQL, future code paths) cannot drift the column.

CREATE OR REPLACE FUNCTION refresh_parcel_amount_paid()
RETURNS TRIGGER AS $$
DECLARE
  affected_parcel uuid;
BEGIN
  affected_parcel := COALESCE(NEW.parcel_id, OLD.parcel_id);
  UPDATE parcels p
     SET amount_paid = COALESCE((
       SELECT SUM(amount)
         FROM payments
        WHERE parcel_id = affected_parcel
          AND status = 'succeeded'
     ), 0)
   WHERE p.id = affected_parcel;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payments_refresh_parcel_amount ON payments;
CREATE TRIGGER payments_refresh_parcel_amount
AFTER INSERT OR UPDATE OF status, amount OR DELETE ON payments
FOR EACH ROW EXECUTE FUNCTION refresh_parcel_amount_paid();
