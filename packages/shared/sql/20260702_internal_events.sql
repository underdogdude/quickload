create table if not exists internal_events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  event_key text not null,
  payload jsonb,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz,
  constraint internal_events_status_chk check (status in ('pending', 'processing', 'sent', 'failed'))
);

create unique index if not exists internal_events_event_key_idx
  on internal_events (event_key);

create index if not exists internal_events_status_next_attempt_idx
  on internal_events (status, next_attempt_at);

create index if not exists internal_events_type_created_at_idx
  on internal_events (type, created_at);
