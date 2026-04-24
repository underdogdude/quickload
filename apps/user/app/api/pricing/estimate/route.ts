import { NextResponse } from "next/server";

type SmartPostResponse = {
  message?: string;
  record?: {
    cost?: number;
    codCost?: number;
    extraZone?: number;
    insuranceFee?: number;
  };
};

function toNumber(value: string | null, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const productWeight = Math.max(0, toNumber(url.searchParams.get("productWeight")));
    const cusZipcode = (url.searchParams.get("cusZipcode") ?? "").trim();
    const productPrice = Math.max(0, toNumber(url.searchParams.get("productPrice")));
    const insurancePrice = Math.max(0, toNumber(url.searchParams.get("insurancePrice")));

    if (!productWeight || !cusZipcode) {
      return NextResponse.json({ ok: false, error: "productWeight and cusZipcode are required" }, { status: 400 });
    }

    const username = process.env.SMARTPOST_BASIC_AUTH_USERNAME ?? "aramex";
    const password = process.env.SMARTPOST_BASIC_AUTH_PASSWORD ?? "Tx26kpUp";
    const auth = Buffer.from(`${username}:${password}`).toString("base64");

    const apiBaseUrl = process.env.SMARTPOST_API_BASE_URL ?? "http://localhost:8082/api/webservice/";
    const getPricePath = process.env.SMARTPOST_GET_PRICE_PATH ?? "getPrice.php";
    const upstreamUrl = new URL(getPricePath, apiBaseUrl);
    upstreamUrl.searchParams.set("productWeight", String(productWeight));
    upstreamUrl.searchParams.set("cusZipcode", cusZipcode);
    upstreamUrl.searchParams.set("productPrice", String(productPrice));
    upstreamUrl.searchParams.set("insurancePrice", String(insurancePrice));

    const upstreamRes = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });

    const data = (await upstreamRes.json()) as SmartPostResponse;
    if (!upstreamRes.ok || data.message !== "OK" || !data.record) {
      return NextResponse.json({ ok: false, error: "Pricing provider error", details: data }, { status: 502 });
    }

    const record = {
      cost: Number(data.record.cost ?? 0),
      codCost: Number(data.record.codCost ?? 0),
      extraZone: Number(data.record.extraZone ?? 0),
      insuranceFee: Number(data.record.insuranceFee ?? 0),
    };
    const estimatedTotal = record.cost + record.extraZone + record.insuranceFee;

    return NextResponse.json({
      ok: true,
      data: {
        ...record,
        estimatedTotal,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
