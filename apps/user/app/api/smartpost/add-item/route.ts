import { and, eq } from "drizzle-orm";
import { getDb, recipientAddresses, senderAddresses } from "@quickload/shared/db";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";
import { getSendAccessBlockForUser, sendAccessBlockedResponse } from "@/lib/send-access-block";
import { MIN_PARCEL_WEIGHT_GRAM, MAX_PARCEL_WEIGHT_GRAM } from "@/lib/parcel-dimensions";

type AddItemBody = {
  senderId?: string;
  recipientId?: string;
  parcelType?: string;
  weightGram?: string;
  insuredValue?: string;
  extraInsurance?: boolean;
};

type SmartpostLikeResponse = {
  statuscode?: string | number;
  message?: string;
  data?: unknown;
};

function toPositiveNumber(value?: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function normalizeSmartpostResponse(raw: unknown): SmartpostLikeResponse {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === "object") return first as SmartpostLikeResponse;
  }
  if (raw && typeof raw === "object") return raw as SmartpostLikeResponse;
  return {};
}

export async function POST(request: Request) {
  try {
    const session = await requireLineSession();

    const sendBlock = await getSendAccessBlockForUser(session.userId);
    if (sendBlock.blocked) return sendAccessBlockedResponse();

    const body = (await request.json()) as AddItemBody;

    const senderId = body.senderId?.trim();
    const recipientId = body.recipientId?.trim();
    const parcelType = body.parcelType?.trim() || "พัสดุทั่วไป";
    const weightGram = toPositiveNumber(body.weightGram);
    const insuredValue = Math.max(0, Number(body.insuredValue || 0));
    const insuranceRatePrice = body.extraInsurance ? insuredValue : 0;

    if (!senderId || !recipientId || !weightGram) {
      return NextResponse.json({ ok: false, error: "senderId, recipientId and weightGram are required" }, { status: 400 });
    }
    if (weightGram < MIN_PARCEL_WEIGHT_GRAM) {
      return NextResponse.json(
        { ok: false, error: `น้ำหนักพัสดุต้องไม่ต่ำกว่า ${MIN_PARCEL_WEIGHT_GRAM} กรัม` },
        { status: 400 },
      );
    }
    if (weightGram > MAX_PARCEL_WEIGHT_GRAM) {
      return NextResponse.json(
        { ok: false, error: "น้ำหนักพัสดุต้องไม่เกิน 30 กิโลกรัม หรือ 30,000 กรัม" },
        { status: 400 },
      );
    }

    const db = getDb();
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

    const payload = {
      shipperName: sender.contactName ?? "",
      shipperAddress: sender.addressLine ?? "",
      shipperSubdistrict: sender.tambon ?? "",
      shipperDistrict: sender.amphoe ?? "",
      shipperProvince: sender.province ?? "",
      shipperZipcode: sender.zipcode ?? "",
      shipperEmail: "",
      shipperMobile: sender.phone ?? "",
      cusName: recipient.contactName ?? "",
      cusAdd: recipient.addressLine ?? "",
      cusSub: recipient.tambon ?? "",
      cusAmp: recipient.amphoe ?? "",
      cusProv: recipient.province ?? "",
      cusZipcode: recipient.zipcode ?? "",
      cusTel: recipient.phone ?? "",
      cusEmail: "",
      productPrice: "0",
      productInbox: parcelType ?? "",
      productWeight: String(weightGram ?? ""),
      insuranceRatePrice: String(insuranceRatePrice ?? 0),
      items: "-",
    };

    const username = process.env.SMARTPOST_BASIC_AUTH_USERNAME?.trim() || "ssslineoa";
    const password = process.env.SMARTPOST_BASIC_AUTH_PASSWORD?.trim() || "SSS12345";
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    // addItem webservice — separate from getcost (SMARTPOST_GETCOST_BASE_URL).
    const apiBaseUrl =
      process.env.SMARTPOST_API_BASE_URL?.trim() || "https://api.getsmartpost.com/webservice/";
    const addItemPath = process.env.SMARTPOST_ADD_ITEM_PATH?.trim() || "addItem";
    const endpoint = new URL(addItemPath, apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`).toString();

    const upstreamRes = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const rawText = await upstreamRes.text();
    let upstreamJson: unknown = rawText;
    try {
      upstreamJson = JSON.parse(rawText);
    } catch {
      // keep raw text
    }

    const normalized = normalizeSmartpostResponse(upstreamJson);
    const smartpostStatus = String(normalized.statuscode ?? "");
    const smartpostMessage = normalized.message ?? "";
    // Treat HTTP 201 OR body statuscode "201" as success (handles both response shapes).
    const isSmartpostSuccess = upstreamRes.status === 201 || smartpostStatus === "201";

    if (!isSmartpostSuccess) {
      const userFacingError = smartpostMessage || `Smartpost error ${upstreamRes.status}`;
      return NextResponse.json(
        {
          ok: false,
          error: userFacingError,
          upstreamHttpStatus: upstreamRes.status,
          smartpostStatus,
          smartpostMessage,
          endpoint,
          details: upstreamJson,
        },
        { status: 502 },
      );
    }

    // Normalize: always include statuscode "201" so downstream (draft route, parser) can verify
    // without re-reading HTTP status. PHP success body may only have {"message":"Create successful"}.
    // statuscode is placed at the END of the spread so it always overrides the upstream body value.
    const normalizedData =
      typeof upstreamJson === "object" && upstreamJson !== null && !Array.isArray(upstreamJson)
        ? { ...(upstreamJson as Record<string, unknown>), statuscode: "201" }
        : { statuscode: "201", message: "Create successful" };

    return NextResponse.json({ ok: true, data: normalizedData });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
