import { NextResponse } from "next/server";

export async function POST(request: Request) {
  void request;
  return NextResponse.json(
    { ok: false, error: "Pickup request is not available in this phase" },
    { status: 410 },
  );
}
