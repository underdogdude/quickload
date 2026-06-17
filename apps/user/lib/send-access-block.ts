import { and, eq, isNotNull, notInArray } from "drizzle-orm";
import { getDb, parcels } from "@quickload/shared/db";
import { computeOutstanding } from "@quickload/shared/penalty";
import { isSendAccessBlockedForParcel, SEND_ACCESS_BLOCKED_MESSAGE } from "@quickload/shared/send-access-block";
import { NextResponse } from "next/server";

const EXCLUDED_STATUSES = ["canceled", "awaiting_actual_weight", "draft", "registered", "paid"] as const;

export type SendAccessBlockResult = {
  blocked: boolean;
  overdueParcelCount: number;
};

export async function getSendAccessBlockForUser(
  userId: string,
  now = new Date(),
): Promise<SendAccessBlockResult> {
  const db = getDb();
  const rows = await db
    .select({
      price: parcels.price,
      amountPaid: parcels.amountPaid,
      thaiPostPriceConfirmedAt: parcels.thaiPostPriceConfirmedAt,
    })
    .from(parcels)
    .where(
      and(
        eq(parcels.userId, userId),
        eq(parcels.isPaid, false),
        isNotNull(parcels.thaiPostPriceConfirmedAt),
        isNotNull(parcels.price),
        notInArray(parcels.status, [...EXCLUDED_STATUSES]),
      ),
    );

  let overdueParcelCount = 0;
  for (const row of rows) {
    if (!row.thaiPostPriceConfirmedAt || !row.price) continue;
    let out;
    try {
      out = computeOutstanding({
        price: String(row.price),
        amountPaid: String(row.amountPaid ?? "0"),
      });
    } catch {
      continue;
    }
    if (out.outstanding <= 0) continue;
    if (
      isSendAccessBlockedForParcel({
        thaiPostPriceConfirmedAt: row.thaiPostPriceConfirmedAt,
        outstanding: out.outstanding,
        now,
      })
    ) {
      overdueParcelCount += 1;
    }
  }

  return {
    blocked: overdueParcelCount > 0,
    overdueParcelCount,
  };
}

export function sendAccessBlockedResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: "SEND_ACCESS_BLOCKED",
      message: SEND_ACCESS_BLOCKED_MESSAGE,
    },
    { status: 403 },
  );
}
