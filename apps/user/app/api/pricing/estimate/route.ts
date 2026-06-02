import { asc, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb, pricingTiers } from "@quickload/shared/db";

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
    const rows = await db
      .select()
      .from(pricingTiers)
      .where(gte(pricingTiers.weightUpToGrams, productWeight))
      .orderBy(asc(pricingTiers.weightUpToGrams))
      .limit(1);

    const tier = rows[0];
    if (!tier) {
      return NextResponse.json(
        { ok: false, error: `น้ำหนักเกินขีดจำกัด (สูงสุด 30,000 กรัม)` },
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
