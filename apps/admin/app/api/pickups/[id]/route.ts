import { NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/require-admin";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminUser();
    void request;
    void context;
    return NextResponse.json(
      { ok: false, error: "Pickup request is not available in this phase" },
      { status: 410 },
    );
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
