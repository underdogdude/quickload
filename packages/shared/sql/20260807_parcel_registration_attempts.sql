-- Durable SmartPost registration boundary and format-agnostic carrier identifiers.
-- Run before deploying the /api/parcels/register application change.

BEGIN;

-- Carrier identifiers are opaque. Canonicalize only whitespace/case; never
-- whitelist WA/WB/JB or assume a fixed prefix.
UPDATE parcels
SET barcode = upper(btrim(barcode))
WHERE barcode IS NOT NULL AND barcode <> upper(btrim(barcode));

UPDATE orders
SET barcode = upper(btrim(barcode))
WHERE barcode IS NOT NULL AND barcode <> upper(btrim(barcode));

UPDATE orders
SET reference_id = NULL
WHERE reference_id IS NOT NULL AND btrim(reference_id) = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM parcels
    WHERE barcode IS NOT NULL AND btrim(barcode) <> ''
    GROUP BY barcode HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce parcels barcode uniqueness: duplicates exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM orders
    WHERE barcode IS NOT NULL AND btrim(barcode) <> ''
    GROUP BY barcode HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce orders barcode uniqueness: duplicates exist';
  END IF;

  IF EXISTS (SELECT 1 FROM orders GROUP BY parcel_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Cannot enforce one order per parcel: duplicates exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM orders
    WHERE user_id IS NOT NULL AND reference_id IS NOT NULL
    GROUP BY user_id, reference_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce order reference idempotency: duplicates exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS parcels_barcode_unique_idx
  ON parcels (barcode)
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS orders_barcode_unique_idx
  ON orders (barcode)
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS orders_parcel_id_unique_idx
  ON orders (parcel_id);

CREATE UNIQUE INDEX IF NOT EXISTS orders_user_reference_unique_idx
  ON orders (user_id, reference_id)
  WHERE user_id IS NOT NULL AND reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS parcel_registration_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reference_id text NOT NULL,
  request_hash text NOT NULL,
  request_payload jsonb NOT NULL,
  provider_request_payload jsonb,
  provider_response_payload jsonb,
  provider_http_status integer,
  smartpost_trackingcode text,
  barcode text,
  parcel_id uuid REFERENCES parcels(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'submitting',
  retryable boolean NOT NULL DEFAULT false,
  attempt_count integer NOT NULL DEFAULT 1,
  last_error text,
  provider_accepted_at timestamptz,
  persisted_at timestamptz,
  next_reconcile_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT parcel_registration_attempts_status_chk CHECK (
    status IN ('submitting', 'provider_succeeded', 'persisted', 'unknown', 'failed')
  ),
  CONSTRAINT parcel_registration_attempts_attempt_count_chk CHECK (attempt_count > 0),
  CONSTRAINT parcel_registration_attempts_reference_chk CHECK (btrim(reference_id) <> ''),
  CONSTRAINT parcel_registration_attempts_barcode_chk CHECK (
    barcode IS NULL OR btrim(barcode) <> ''
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS parcel_registration_attempts_user_reference_idx
  ON parcel_registration_attempts (user_id, reference_id);

CREATE INDEX IF NOT EXISTS parcel_registration_attempts_status_reconcile_idx
  ON parcel_registration_attempts (status, next_reconcile_at);

CREATE INDEX IF NOT EXISTS parcel_registration_attempts_barcode_idx
  ON parcel_registration_attempts (barcode);

COMMIT;
