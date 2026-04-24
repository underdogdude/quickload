import { getDb, senderAddresses } from "@quickload/shared/db";
import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { CacheHeaders, jsonWithCache } from "@/lib/api-cache";
import { normalizeThaiPhone, isValidThaiPhone } from "@/lib/thai-phone";
import { requireLineSession } from "@/lib/require-user";
import { serializeSenderAddress } from "@/lib/sender-address-api";

type Body = {
  contactName?: string;
  phone?: string;
  addressLine?: string;
  tambon?: string;
  amphoe?: string;
  province?: string;
  zipcode?: string;
  isPrimary?: boolean;
};

function parseBody(body: Body) {
  const contactName = body.contactName?.trim();
  const phone = normalizeThaiPhone(body.phone ?? "");
  const addressLine = body.addressLine?.trim();
  const tambon = body.tambon?.trim();
  const amphoe = body.amphoe?.trim();
  const province = body.province?.trim();
  const zipcode = body.zipcode != null ? String(body.zipcode).trim() : "";
  const isPrimary = Boolean(body.isPrimary);

  if (!contactName || !addressLine || !tambon || !amphoe || !province || !zipcode) {
    return { error: "Missing required fields" as const };
  }
  if (!phone) {
    return { error: "phone is required" as const };
  }
  if (!isValidThaiPhone(phone)) {
    return { error: "Invalid phone format" as const };
  }
  return {
    data: { contactName, phone, addressLine, tambon, amphoe, province, zipcode, isPrimary },
  };
}

export async function GET() {
  try {
    const session = await requireLineSession();
    const db = getDb();
    const rows = await db
      .select()
      .from(senderAddresses)
      .where(eq(senderAddresses.userId, session.userId))
      .orderBy(desc(senderAddresses.isPrimary), desc(senderAddresses.createdAt));
    return jsonWithCache(
      { ok: true, data: rows.map(serializeSenderAddress) },
      CacheHeaders.privateShortSwr(10, 30),
    );
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireLineSession();
    const body = (await request.json()) as Body;
    const parsed = parseBody(body);
    if ("error" in parsed) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    const { contactName, phone, addressLine, tambon, amphoe, province, zipcode, isPrimary } = parsed.data;

    const db = getDb();
    const created = await db.transaction(async (tx) => {
      if (isPrimary) {
        await tx
          .update(senderAddresses)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(eq(senderAddresses.userId, session.userId));
      }
      const inserted = await tx
        .insert(senderAddresses)
        .values({
          userId: session.userId,
          contactName,
          phone,
          addressLine,
          tambon,
          amphoe,
          province,
          zipcode,
          isPrimary,
          updatedAt: new Date(),
        })
        .returning();
      return inserted[0];
    });

    if (!created) {
      return NextResponse.json({ ok: false, error: "Insert failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: serializeSenderAddress(created) });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    if (msg.includes("sender_addresses") || msg.includes("does not exist")) {
      return NextResponse.json(
        { ok: false, error: "Database table missing. Run sql/20260214_sender_addresses.sql on your database." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
