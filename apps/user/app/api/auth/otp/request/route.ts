import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";
import type { LineAppSession } from "@/lib/session";
import { getSessionOptions } from "@/lib/session";
import { isValidThaiPhone, normalizeThaiPhone } from "@/lib/thai-phone";
import { requestThaibulkOtp, ThaibulkOtpError } from "@/lib/thaibulksms-otp";

const RESEND_COOLDOWN_MS = 60_000;

export async function POST(request: Request) {
  try {
    await requireLineSession();
    const body = (await request.json()) as { phone?: string };
    const phone = normalizeThaiPhone(body.phone ?? "");
    if (!isValidThaiPhone(phone)) {
      return NextResponse.json({ ok: false, error: "Invalid phone format" }, { status: 400 });
    }

    const session = await getIronSession<LineAppSession>(cookies(), getSessionOptions());
    const now = Date.now();
    if (
      session.phoneOtpPhone === phone &&
      session.phoneOtpRequestedAt &&
      now - session.phoneOtpRequestedAt < RESEND_COOLDOWN_MS
    ) {
      const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (now - session.phoneOtpRequestedAt)) / 1000);
      return NextResponse.json(
        { ok: false, error: `กรุณารอ ${waitSec} วินาทีก่อนส่งรหัสอีกครั้ง` },
        { status: 429 },
      );
    }

    const { token } = await requestThaibulkOtp(phone);
    session.phoneOtpToken = token;
    session.phoneOtpPhone = phone;
    session.phoneOtpRequestedAt = now;
    session.phoneOtpVerifiedFor = undefined;
    await session.save();

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof ThaibulkOtpError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 502 });
    }
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
