-- Run on Supabase SQL editor (or psql) if drizzle push is not used.
CREATE TABLE IF NOT EXISTS sender_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  phone text NOT NULL,
  address_line text NOT NULL,
  tambon text NOT NULL,
  amphoe text NOT NULL,
  province text NOT NULL,
  zipcode text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

CREATE INDEX IF NOT EXISTS sender_addresses_user_id_idx ON sender_addresses(user_id);
