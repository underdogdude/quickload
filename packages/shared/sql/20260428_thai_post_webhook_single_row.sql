-- Thailand Post webhook: one row per parcel + status_history (jsonb). Idempotent.
-- - No table yet: CREATE final schema (greenfield; requires parcels).
-- - Legacy multi-row table: merge into one row per parcel + history, then replace table.
-- - Already has status_history: no-op (drops leftover staging table only).

DROP TABLE IF EXISTS thai_post_webhook_events_new CASCADE;

DO $body$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'thai_post_webhook_events'
      AND c.column_name = 'status_history'
  ) THEN
    RAISE NOTICE 'thai_post_webhook_events already in single-row shape; skipped.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables t
    WHERE t.table_schema = 'public' AND t.table_name = 'thai_post_webhook_events'
  ) THEN
    CREATE TABLE thai_post_webhook_events_new (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      parcel_id uuid NOT NULL REFERENCES parcels(id) ON DELETE CASCADE UNIQUE,
      barcode text NOT NULL,
      status_code text NOT NULL,
      status_description text,
      status_date_raw text,
      station text,
      status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
      raw_payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    INSERT INTO thai_post_webhook_events_new (
      parcel_id,
      barcode,
      status_code,
      status_description,
      status_date_raw,
      station,
      status_history,
      raw_payload,
      created_at,
      updated_at
    )
    SELECT
      l.parcel_id,
      l.barcode,
      l.status_code,
      l.status_description,
      l.status_date_raw,
      l.station,
      COALESCE(a.status_history, '[]'::jsonb),
      l.raw_payload,
      f.first_created,
      l.created_at
    FROM (
      SELECT DISTINCT ON (parcel_id)
        parcel_id,
        barcode,
        status_code,
        status_description,
        status_date_raw,
        station,
        raw_payload,
        created_at
      FROM thai_post_webhook_events
      ORDER BY parcel_id, created_at DESC
    ) l
    JOIN (
      SELECT parcel_id, MIN(created_at) AS first_created
      FROM thai_post_webhook_events
      GROUP BY parcel_id
    ) f ON f.parcel_id = l.parcel_id
    LEFT JOIN (
      SELECT
        parcel_id,
        jsonb_agg(
          jsonb_build_object(
            'id', id::text,
            'barcode', barcode,
            'status', status_code,
            'statusDescription', status_description,
            'statusDate', status_date_raw,
            'station', station,
            'createdAt', created_at::text
          ) ORDER BY created_at ASC
        ) AS status_history
      FROM thai_post_webhook_events
      GROUP BY parcel_id
    ) a ON a.parcel_id = l.parcel_id;

    DROP TABLE thai_post_webhook_events;
    ALTER TABLE thai_post_webhook_events_new RENAME TO thai_post_webhook_events;
  ELSE
    CREATE TABLE thai_post_webhook_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      parcel_id uuid NOT NULL REFERENCES parcels(id) ON DELETE CASCADE UNIQUE,
      barcode text NOT NULL,
      status_code text NOT NULL,
      status_description text,
      status_date_raw text,
      station text,
      status_history jsonb NOT NULL DEFAULT '[]'::jsonb,
      raw_payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END
$body$;

CREATE INDEX IF NOT EXISTS idx_thai_post_webhook_events_barcode ON thai_post_webhook_events(barcode);
