-- Payment attempts for parcels (Beam Checkout integration).
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id uuid NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  provider text NOT NULL DEFAULT 'beam',
  provider_charge_id text UNIQUE,
  amount numeric(14, 2) NOT NULL,
  currency text NOT NULL DEFAULT 'THB',
  payment_method text NOT NULL DEFAULT 'promptpay',
  status text NOT NULL DEFAULT 'pending',
  qr_payload text,
  expires_at timestamptz,
  paid_at timestamptz,
  raw_create_response jsonb,
  raw_webhook_payload jsonb,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS payments_parcel_id_status_idx ON payments (parcel_id, status);
CREATE INDEX IF NOT EXISTS payments_status_expires_at_idx ON payments (status, expires_at);
