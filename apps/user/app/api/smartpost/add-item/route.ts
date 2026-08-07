import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

/**
 * Retired compatibility endpoint.
 *
 * SmartPost used to be called from this first browser-controlled step and the
 * response was then posted to /api/parcels/draft. That split created carrier
 * orders without durable Quickload rows when the second request failed.
 * New registrations must use the single server-owned /api/parcels/register
 * endpoint. Returning 410 prevents stale clients from creating new orphaned
 * carrier orders during rollout.
 */
export async function POST() {
  try {
    await requireLineSession();
    return NextResponse.json(
      {
        ok: false,
        code: "LEGACY_REGISTRATION_FLOW_RETIRED",
        error: "This registration screen is out of date. Please reload before creating a parcel.",
        retryable: false,
      },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
}
