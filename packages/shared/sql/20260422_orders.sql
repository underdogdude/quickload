-- Smartpost addItem success snapshot (one row per parcel after carrier accepts the order).
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcel_id uuid NOT NULL REFERENCES parcels (id) ON DELETE CASCADE,
  user_id uuid REFERENCES users (id),
  statuscode text,
  message text,
  smartpost_trackingcode text,
  barcode text,
  service_type text,
  product_inbox text,
  product_weight text,
  product_price text,
  shipper_name text,
  shipper_address text,
  shipper_subdistrict text,
  shipper_district text,
  shipper_province text,
  shipper_zipcode text,
  shipper_email text,
  shipper_mobile text,
  cus_name text,
  cus_add text,
  cus_sub text,
  cus_amp text,
  cus_prov text,
  cus_zipcode text,
  cus_tel text,
  cus_email text,
  customer_code text,
  cost numeric(14, 2),
  finalcost numeric(14, 2),
  order_status text,
  items text,
  insurance_rate_price text,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS orders_parcel_id_idx ON orders (parcel_id);
CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders (user_id);
CREATE INDEX IF NOT EXISTS orders_barcode_idx ON orders (barcode);
