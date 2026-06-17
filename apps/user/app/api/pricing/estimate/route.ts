import { NextResponse } from "next/server";
import { lookupSellPriceThbForWeight, MAX_PRICING_WEIGHT_GRAMS } from "@quickload/shared/pricing-tier-lookup";
import { getDb } from "@quickload/shared/db";

function toNumber(value: string | null, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const productWeight = Math.max(0, toNumber(url.searchParams.get("productWeight")));

    if (!productWeight) {
      return NextResponse.json({ ok: false, error: "productWeight is required" }, { status: 400 });
    }

    const db = getDb();
    const tier = await lookupSellPriceThbForWeight(db, productWeight);
    if (!tier) {
      return NextResponse.json(
        { ok: false, error: `น้ำหนักเกินขีดจำกัด (สูงสุด ${MAX_PRICING_WEIGHT_GRAMS.toLocaleString("th-TH")} กรัม)` },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        cost: tier.priceThb,
        estimatedTotal: tier.priceThb,
        weightUpToGrams: tier.weightUpToGrams,
        provider: "pricing-table",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
