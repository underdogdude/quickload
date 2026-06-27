import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";
import type { LineAppSession } from "@/lib/session";
import { getSessionOptions } from "@/lib/session";
import { isValidThaiPhone, normalizeThaiPhone } from "@/lib/thai-phone";
import { ThaibulkOtpError, verifyThaibulkOtp } from "@/lib/thaibulksms-otp";

const PIN_REGEX = /^\d{6}$/;

export async function POST(request: Request) {
  try {
    await requireLineSession();
    const body = (await request.json()) as { phone?: string; pin?: string };
    const phone = normalizeThaiPhone(body.phone ?? "");
    const pin = body.pin?.trim() ?? "";

    if (!isValidThaiPhone(phone)) {
      return NextResponse.json({ ok: false, error: "Invalid phone format" }, { status: 400 });
    }
    if (!PIN_REGEX.test(pin)) {
      return NextResponse.json({ ok: false, error: "กรุณากรอกรหัส OTP ให้ครบ 6 หลัก" }, { status: 400 });
    }

    const session = await getIronSession<LineAppSession>(cookies(), getSessionOptions());
    if (!session.phoneOtpToken) {
      if (session.phoneOtpVerifiedFor === phone) {
        return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json(
        { ok: false, error: "ไม่พบรหัส OTP ที่รอการยืนยัน กรุณาขอรหัสใหม่" },
        { status: 400 },
      );
    }
    if (session.phoneOtpPhone !== phone) {
      return NextResponse.json(
        { ok: false, error: "ไม่พบรหัส OTP ที่รอการยืนยัน กรุณาขอรหัสใหม่" },
        { status: 400 },
      );
    }

    await verifyThaibulkOtp(session.phoneOtpToken, pin);

    session.phoneOtpVerifiedFor = phone;
    session.phoneOtpToken = undefined;
    await session.save();

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof ThaibulkOtpError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
