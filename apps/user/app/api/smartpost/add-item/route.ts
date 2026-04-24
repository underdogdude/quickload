import { and, eq } from "drizzle-orm";
import { getDb, recipientAddresses, senderAddresses } from "@quickload/shared/db";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";

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

    const username = process.env.SMARTPOST_BASIC_AUTH_USERNAME ?? "aramex";
    const password = process.env.SMARTPOST_BASIC_AUTH_PASSWORD ?? "Tx26kpUp";
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const apiBaseUrl = process.env.SMARTPOST_API_BASE_URL ?? "http://localhost:8082/api/webservice/";
    const addItemPath = process.env.SMARTPOST_ADD_ITEM_PATH ?? "addItem";
    const endpoint = new URL(addItemPath, apiBaseUrl).toString();

    console.log("[smartpost.addItem] endpoint", endpoint);
    console.log("[smartpost.addItem] payload", payload);

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

    console.log("[smartpost.addItem] upstreamStatus", upstreamRes.status);
    console.log("[smartpost.addItem] upstreamBody", upstreamJson);

    const normalized = normalizeSmartpostResponse(upstreamJson);
    const smartpostStatus = String(normalized.statuscode ?? "");
    const smartpostMessage = normalized.message ?? "";
    const isSmartpostSuccess = smartpostStatus === "201";

    if (!upstreamRes.ok || !isSmartpostSuccess) {
      return NextResponse.json(
        {
          ok: false,
          error: "Smartpost addItem failed",
          upstreamHttpStatus: upstreamRes.status,
          smartpostStatus,
          smartpostMessage,
          endpoint,
          payloadPreview: payload,
          details: upstreamJson,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true, data: upstreamJson, payloadPreview: payload });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
