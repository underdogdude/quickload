import { eq } from "drizzle-orm";
import { getDb, parcels, thaiPostWebhookEvents } from "@quickload/shared/db";
import { NextResponse } from "next/server";
import { loadDevMockPayload } from "@/lib/dev-mock/load-payload";
import { requireLineSession } from "@/lib/require-user";

const RELAY_DEFAULTS_KEY = "thai_post_webhook_relay_defaults";

type RelayDefaults = {
  defaultStation?: string;
  fallbackStatusDescription?: string;
  statusDescriptions?: Record<string, string>;
};

type MockBody = {
  parcelId?: string;
  /** Thailand Post item id: exactly 13 characters (e.g. WB222126989TH). */
  barcode?: string;
  status?: string;
  statusDescription?: string;
  statusDate?: string;
  station?: string;
  finalcost?: string;
};

/** Thailand Post style: DD/MM/YYYY HH:mm:ss */
function formatThaiPostStatusDate(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

export async function POST(request: Request) {
  try {
    const session = await requireLineSession();
    const body = (await request.json().catch(() => ({}))) as MockBody;
    const db = getDb();

    const rawBarcode = body.barcode?.trim();
    if (rawBarcode && rawBarcode.length !== 13) {
      return NextResponse.json(
        { error: "barcode must be 13 characters (Thailand Post item id, e.g. WB222126989TH)" },
        { status: 400 },
      );
    }

    let barcode = rawBarcode || "";
    if (!barcode && body.parcelId?.trim()) {
      const [parcel] = await db
        .select({ barcode: parcels.barcode, userId: parcels.userId })
        .from(parcels)
        .where(eq(parcels.id, body.parcelId.trim()))
        .limit(1);
      if (!parcel || parcel.userId !== session.userId) {
        return NextResponse.json({ ok: false, error: "Parcel not found" }, { status: 404 });
      }
      barcode = parcel.barcode?.trim() || "";
    }
    if (!barcode) {
      return NextResponse.json(
        { ok: false, error: "barcode or parcelId with barcode is required" },
        { status: 400 },
      );
    }

    const latest = await db
      .select({ statusCode: thaiPostWebhookEvents.statusCode })
      .from(thaiPostWebhookEvents)
      .where(eq(thaiPostWebhookEvents.barcode, barcode))
      .limit(1);
    const current = latest[0]?.statusCode ?? "0";
    const fallbackNext =
      current === "0" ? "1" : current === "1" ? "3" : current === "3" ? "6" : current === "6" ? "7" : "7";

    const relayRaw = loadDevMockPayload(RELAY_DEFAULTS_KEY);
    const relay = relayRaw as RelayDefaults | null;
    if (!relay || typeof relay !== "object") {
      return NextResponse.json(
        {
          ok: false,
          error: `Missing mock payload "${RELAY_DEFAULTS_KEY}.json" under apps/user/lib/dev-mock/payloads/`,
        },
        { status: 503 },
      );
    }

    const fc = body.finalcost?.trim();
    const statusStr = body.status?.trim() || fallbackNext;
    const byCode = relay.statusDescriptions && typeof relay.statusDescriptions === "object" ? relay.statusDescriptions : {};
    const statusDescription =
      body.statusDescription?.trim() ||
      (typeof byCode[statusStr] === "string" ? byCode[statusStr] : "") ||
      (typeof relay.fallbackStatusDescription === "string" ? relay.fallbackStatusDescription : "");
    if (!statusDescription) {
      return NextResponse.json(
        { ok: false, error: "Relay defaults missing status description for this status" },
        { status: 500 },
      );
    }
    const station =
      body.station?.trim() ||
      (typeof relay.defaultStation === "string" ? relay.defaultStation : "");
    if (!station) {
      return NextResponse.json({ ok: false, error: "Relay defaults missing defaultStation" }, { status: 500 });
    }

    const payload = [
      {
        barcode,
        status: statusStr,
        statusDescription,
        statusDate: body.statusDate?.trim() || formatThaiPostStatusDate(new Date()),
        station,
        ...(fc
          ? {
              finalcost: fc,
              finalCost: fc,
              cost: fc,
            }
          : {}),
      },
    ];

    const origin = new URL(request.url).origin;
    const webhookRes = await fetch(`${origin}/api/parcels/thai-post-webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.THAI_POST_WEBHOOK_TOKEN
          ? { "x-webhook-token": process.env.THAI_POST_WEBHOOK_TOKEN }
          : {}),
      },
      body: JSON.stringify(payload),
    });
    const webhookJson = (await webhookRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!webhookRes.ok) {
      return NextResponse.json(
        { ok: false, error: "Mock relay failed", detail: webhookJson },
        { status: webhookRes.status },
      );
    }
    return NextResponse.json({ ok: true, payload, webhook: webhookJson });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
