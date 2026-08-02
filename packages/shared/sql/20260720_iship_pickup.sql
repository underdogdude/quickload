create table if not exists iship_pickup_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  idempotency_key text not null,
  input_source text not null check (input_source in ('manual', 'system')),
  sender_address_id uuid references sender_addresses(id) on delete set null,
  contact_name text not null,
  contact_phone text not null,
  pickup_address_line text not null,
  pickup_tambon text not null,
  pickup_amphoe text not null,
  pickup_province text not null,
  pickup_zipcode text not null,
  pickup_address_full text not null,
  parcel_count integer not null check (parcel_count > 0),
  heaviest_weight_kg numeric(10,3) not null check (heaviest_weight_kg > 0),
  courier_code text not null,
  remark text not null default '',
  status text not null default 'submitting' check (
    status in ('submitting', 'requested', 'assigned', 'picked_up', 'cancelled', 'failed', 'unknown')
  ),
  iship_ticket_pickup_id text,
  iship_record_id text,
  iship_status_code text,
  iship_status_text text,
  provider_message text,
  staff_info_name text,
  staff_info_phone text,
  timeout_at_text text,
  ticket_message text,
  failure_code text,
  failure_message text,
  iship_request_json jsonb,
  iship_response_json jsonb,
  iship_cancel_response_json jsonb,
  accepted_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists iship_pickup_requests_user_idempotency_idx
  on iship_pickup_requests(user_id, idempotency_key);
create unique index if not exists iship_pickup_requests_ticket_idx
  on iship_pickup_requests(iship_ticket_pickup_id)
  where iship_ticket_pickup_id is not null;
create index if not exists iship_pickup_requests_user_created_idx
  on iship_pickup_requests(user_id, created_at desc);
create index if not exists iship_pickup_requests_status_idx
  on iship_pickup_requests(status);

create table if not exists iship_pickup_request_parcels (
  pickup_request_id uuid not null references iship_pickup_requests(id) on delete cascade,
  parcel_id uuid not null references parcels(id) on delete cascade,
  tracking_code text not null,
  barcode text,
  created_at timestamptz not null default now(),
  primary key (pickup_request_id, parcel_id)
);

create index if not exists iship_pickup_request_parcels_parcel_idx
  on iship_pickup_request_parcels(parcel_id);

create table if not exists iship_pickup_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  ticket_pickup_id text,
  pickup_request_id uuid references iship_pickup_requests(id) on delete set null,
  authenticated boolean not null default false,
  processed boolean not null default false,
  outcome text,
  raw_payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists iship_pickup_webhook_logs_ticket_idx
  on iship_pickup_webhook_logs(ticket_pickup_id);
create index if not exists iship_pickup_webhook_logs_request_idx
  on iship_pickup_webhook_logs(pickup_request_id);
