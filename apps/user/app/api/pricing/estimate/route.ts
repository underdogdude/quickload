import { NextResponse } from "next/server";
import {
  DEFAULT_SMARTPOST_GETCOST_BASE_URL,
  DEFAULT_SMARTPOST_GETCOST_PATH,
  DEFAULT_SMARTPOST_USER_CODE,
  getSmartpostPriceAdjustment,
} from "@/lib/pricing/config";

type SmartPostGetCostResponse = {
  status?: string;
  weight?: string | number;
  cost?: string | number;
  cost_shop?: string | number;
};

function toNumber(value: string | null, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildUpstreamHeaders(): HeadersInit {
  const username = process.env.SMARTPOST_BASIC_AUTH_USERNAME?.trim();
  const password = process.env.SMARTPOST_BASIC_AUTH_PASSWORD?.trim();
  if (!username || !password) return {};
  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  return { Authorization: `Basic ${auth}` };
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

    const apiBaseUrl = (process.env.SMARTPOST_GETCOST_BASE_URL ?? DEFAULT_SMARTPOST_GETCOST_BASE_URL).trim();
    const getPricePath = (process.env.SMARTPOST_GET_PRICE_PATH ?? DEFAULT_SMARTPOST_GETCOST_PATH).trim();
    const smartpostUserCode = (process.env.SMARTPOST_USER_CODE ?? DEFAULT_SMARTPOST_USER_CODE).trim();
    const priceAdjustment = getSmartpostPriceAdjustment(smartpostUserCode);

    const upstreamUrl = new URL(getPricePath, apiBaseUrl.endsWith("/") ? apiBaseUrl : `${apiBaseUrl}/`);
    upstreamUrl.searchParams.set("weight", String(productWeight));
    upstreamUrl.searchParams.set("zipcode", cusZipcode);
    upstreamUrl.searchParams.set("user_code", smartpostUserCode);

    const upstreamRes = await fetch(upstreamUrl.toString(), {
      method: "GET",
      headers: buildUpstreamHeaders(),
      cache: "no-store",
    });

    const upstreamRaw = await upstreamRes.text();
    let parsed: SmartPostGetCostResponse | null = null;
    try {
      parsed = JSON.parse(upstreamRaw) as SmartPostGetCostResponse;
    } catch {
      parsed = null;
    }

    if (!upstreamRes.ok) {
      return NextResponse.json(
        { ok: false, error: "Pricing provider error", upstreamUrl: upstreamUrl.toString(), details: parsed ?? upstreamRaw },
        { status: 502 },
      );
    }

    const status = parsed?.status?.toLowerCase();
    const baseCost = Number(parsed?.cost ?? NaN);
    if (status !== "success" || !Number.isFinite(baseCost)) {
      return NextResponse.json(
        { ok: false, error: "Pricing provider error", upstreamUrl: upstreamUrl.toString(), details: parsed ?? upstreamRaw },
        { status: 502 },
      );
    }

    const estimatedTotal = baseCost + priceAdjustment;

    return NextResponse.json({
      ok: true,
      data: {
        cost: baseCost,
        codCost: 0,
        extraZone: 0,
        insuranceFee: 0,
        estimatedTotal,
        priceAdjustment,
        provider: "smartpost-getcost",
        productPrice,
        insurancePrice,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
