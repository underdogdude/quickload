-- Late-payment penalty + outstanding-balance support.
-- penalty_clock_started_at: set once by the future Smartpost shipped-webhook; NULL => no penalty.
-- amount_paid: maintained by trigger payments_refresh_parcel_amount (see 20260425_amount_paid_trigger.sql).

ALTER TABLE parcels
  ADD COLUMN IF NOT EXISTS penalty_clock_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS amount_paid numeric(14, 2) NOT NULL DEFAULT 0;

-- Partial index to make the abandonment sweep query fast even at scale.
CREATE INDEX IF NOT EXISTS parcels_penalty_sweep_idx
  ON parcels (penalty_clock_started_at)
  WHERE amount_paid = 0 AND status NOT IN ('paid', 'canceled');
