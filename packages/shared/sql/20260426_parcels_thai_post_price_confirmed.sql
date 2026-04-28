-- Real billable price is confirmed only after Thailand Post webhook sends final cost.
alter table parcels
  add column if not exists thai_post_price_confirmed_at timestamptz;

comment on column parcels.thai_post_price_confirmed_at is
  'Set when Thailand Post webhook applies final postage price; until then parcel has no billable price for payment UI.';
