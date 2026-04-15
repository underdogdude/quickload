import { getDb, senderAddresses } from "@quickload/shared/db";
import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireLineSession } from "@/lib/require-user";
import { serializeSenderAddress } from "@/lib/sender-address-api";

const PHONE_REGEX = /^(\+66|0)\d{8,9}$/;

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
  const phone = body.phone?.trim().replace(/[\s-]/g, "") ?? "";
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
  if (!PHONE_REGEX.test(phone)) {
    return { error: "Invalid phone format" as const };
  }
  return {
    data: { contactName, phone, addressLine, tambon, amphoe, province, zipcode, isPrimary },
  };
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireLineSession();
    const { id } = params;
    const db = getDb();
    const rows = await db
      .select()
      .from(senderAddresses)
      .where(and(eq(senderAddresses.id, id), eq(senderAddresses.userId, session.userId)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, data: serializeSenderAddress(row) });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireLineSession();
    const { id } = params;
    const body = (await request.json()) as Body;
    const parsed = parseBody(body);
    if ("error" in parsed) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }
    const { contactName, phone, addressLine, tambon, amphoe, province, zipcode, isPrimary } = parsed.data;

    const db = getDb();
    const existing = await db
      .select({ id: senderAddresses.id })
      .from(senderAddresses)
      .where(and(eq(senderAddresses.id, id), eq(senderAddresses.userId, session.userId)))
      .limit(1);
    if (!existing[0]) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    const updated = await db.transaction(async (tx) => {
      if (isPrimary) {
        await tx
          .update(senderAddresses)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(senderAddresses.userId, session.userId), ne(senderAddresses.id, id)));
      }
      const rows = await tx
        .update(senderAddresses)
        .set({
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
        .where(and(eq(senderAddresses.id, id), eq(senderAddresses.userId, session.userId)))
        .returning();
      return rows[0];
    });

    if (!updated) {
      return NextResponse.json({ ok: false, error: "Update failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, data: serializeSenderAddress(updated) });
  } catch (e) {
    if (e instanceof Response) return e;
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
