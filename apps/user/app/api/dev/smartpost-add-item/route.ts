import { and, eq } from "drizzle-orm";
import { getDb, recipientAddresses, senderAddresses } from "@quickload/shared/db";
import { NextResponse } from "next/server";
import { loadDevMockPayload } from "@/lib/dev-mock/load-payload";
import { applyDevMockTemplate } from "@/lib/dev-mock-template";
import { requireLineSession } from "@/lib/require-user";

const ENVELOPE_KEY = "smartpost_additem_envelope";

function smartpostMockEnabled() {
  return process.env.NEXT_PUBLIC_SMARTPOST_MOCK === "1";
}

type Body = {
  senderId?: string;
  recipientId?: string;
  parcelType?: string;
  weightGram?: string;
  insuredValue?: string;
  extraInsurance?: boolean;
  baseEstimatedPrice?: number;
};

export async function POST(request: Request) {
  if (!smartpostMockEnabled()) {
    return NextResponse.json({ ok: false, error: "Smartpost DB mock is disabled" }, { status: 403 });
  }
  try {
    const session = await requireLineSession();
    const body = (await request.json()) as Body;
    const senderId = body.senderId?.trim();
    const recipientId = body.recipientId?.trim();
    const parcelType = body.parcelType?.trim() ?? "";
    const weightGram = body.weightGram?.trim() ?? "";
    if (!senderId || !recipientId || !parcelType || !weightGram) {
      return NextResponse.json(
        { ok: false, error: "senderId, recipientId, parcelType, and weightGram are required" },
        { status: 400 },
      );
    }

    const db = getDb();
    const template = loadDevMockPayload(ENVELOPE_KEY);
    if (template == null || typeof template !== "object") {
      return NextResponse.json(
        {
          ok: false,
          error: `Missing mock payload "${ENVELOPE_KEY}.json" under apps/user/lib/dev-mock/payloads/`,
        },
        { status: 503 },
      );
    }

    const [sender] = await db
      .select()
      .from(senderAddresses)
      .where(and(eq(senderAddresses.id, senderId), eq(senderAddresses.userId, session.userId)))
      .limit(1);
    const [recipient] = await db
      .select()
      .from(recipientAddresses)
      .where(and(eq(recipientAddresses.id, recipientId), eq(recipientAddresses.userId, session.userId)))
      .limit(1);
    if (!sender || !recipient) {
      return NextResponse.json({ ok: false, error: "Sender or recipient not found" }, { status: 404 });
    }

    const ts = Date.now();
    const barcodeNine = String(ts % 1_000_000_000).padStart(9, "0");
    const trackingNine = String((Number(barcodeNine) + 123_456_789) % 1_000_000_000).padStart(9, "0");
    const barcode = `WB${barcodeNine}TH`;
    const tracking = `SP${trackingNine}TH`;
    const insured = body.insuredValue?.trim() || "0";
    const extra = Boolean(body.extraInsurance);
    const base = Number(body.baseEstimatedPrice);
    const cost = (Number.isFinite(base) && base > 0 ? base : 0).toFixed(2);
    const phone8 = (p: string) => p.replace(/\D/g, "").slice(-8);
    const shipperEmail =
      sender.phone.trim() !== "" ? `noreply+${phone8(sender.phone)}@mock.smartpost.local` : "";
    const cusEmail =
      recipient.phone.trim() !== "" ? `notify+${phone8(recipient.phone)}@mock.smartpost.local` : "";

    const vars: Record<string, string> = {
      tracking,
      barcode,
      parcel_type: parcelType,
      weight_gram: weightGram,
      product_price: insured,
      shipper_name: sender.contactName,
      shipper_address: sender.addressLine,
      shipper_tambon: sender.tambon,
      shipper_amphoe: sender.amphoe,
      shipper_province: sender.province,
      shipper_zipcode: sender.zipcode,
      shipper_email: shipperEmail,
      shipper_phone: sender.phone,
      cus_name: recipient.contactName,
      cus_address: recipient.addressLine,
      cus_tambon: recipient.tambon,
      cus_amphoe: recipient.amphoe,
      cus_province: recipient.province,
      cus_zipcode: recipient.zipcode,
      cus_phone: recipient.phone,
      cus_email: cusEmail,
      customer_code: `SP-DEV-${String(ts).slice(-10)}`,
      cost,
      finalcost: cost,
      insurance_rate_price: extra && insured ? insured : "0",
      reference_id: `REF-MOCK-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(ts).slice(-8)}`,
    };

    const envelope = applyDevMockTemplate(template, vars) as {
      statuscode?: string;
      message?: string;
      data?: Record<string, string>;
    };

    return NextResponse.json({ ok: true, data: envelope });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
