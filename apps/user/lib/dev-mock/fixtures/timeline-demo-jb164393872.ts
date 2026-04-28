import {
  thaiPostEventsForApiFromHistory,
  thaiPostStatusDateToMs,
  type ThaiPostCarrierHistoryStored,
} from "@quickload/shared/thai-post-webhook-history";

import raw from "./jb164393872-th-tracking.timeline.json";

/** One tracking (barcode) — many rows, same shape as `json_encode` from PHP / Thailand Post style. */
export type ThaiPostCarrierTimelineRow = {
  barcode: string;
  station: string;
  status: string;
  statusDate: string;
  statusDescription: string;
};

export const THAIPOST_TIMELINE_DEMO_JB164393872: ThaiPostCarrierTimelineRow[] =
  raw as ThaiPostCarrierTimelineRow[];

/**
 * Same data as DB `status_history[]` after webhook (carrier keys + `id` + `createdAt`).
 * `createdAt` is derived from `statusDate` so sorting matches carrier time in dev UI.
 */
export function jb164393872DemoAsStoredHistory(): ThaiPostCarrierHistoryStored[] {
  return THAIPOST_TIMELINE_DEMO_JB164393872.map((row, i) => {
    const ms = thaiPostStatusDateToMs(row.statusDate);
    const createdAt =
      ms != null ? new Date(ms).toISOString() : new Date(Date.now() + i * 1000).toISOString();
    return {
      id: `demo-jb164393872-${i}`,
      barcode: row.barcode,
      status: row.status,
      statusDescription: row.statusDescription,
      statusDate: row.statusDate,
      station: row.station,
      createdAt,
    };
  });
}

/** Normalized list like `/api/parcels/[id]` → `thaiPostEvents` (for list/detail UI components). */
export function jb164393872DemoAsApiEvents() {
  return thaiPostEventsForApiFromHistory(jb164393872DemoAsStoredHistory());
}
