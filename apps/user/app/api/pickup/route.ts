import {
  getDb,
  ishipPickupRequestParcels,
  ishipPickupRequests,
  orders,
  parcels,
  senderAddresses,
} from "@quickload/shared/db";
import { recordSystemErrorEvent } from "@quickload/shared/internal-events";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { CacheHeaders } from "@/lib/api-cache";
import {
  buildIshipRequestCourierPayload,
  formatIshipPickupAddress,
  getIshipConfig,
  ISHIP_PICKUP_COURIER_CODE,
  IshipApiError,
  requestIshipCourier,
} from "@/lib/iship";
import {
  BLOCKING_ISHIP_PICKUP_STATUSES,
  buildSystemPickupRemark,
  MAX_PICKUP_WEIGHT_KG,
  normalizePickupIdempotencyKey,
  type PickupSenderSnapshot,
  toPickupRequestDto,
} from "@/lib/iship-pickup";
import { isValidThaiPhone, normalizeThaiPhone } from "@/lib/thai-phone";
import { requireLineSession } from "@/lib/require-user";

const PAGE_SIZE = 10;
const MAX_SYSTEM_PARCELS = 100;

type PickupBody = {
  inputSource?: unknown;
  senderAddressId?: string;
  parcelIds?: string[];
  remark?: string;
  idempotencyKey?: string;
};

type ResolvedParcel = {
  id: string;
  trackingCode: string;
  barcode: string | null;
  weightKg: number;
  recipientName: string | null;
};

type ResolvedPickup = {
  senderAddressId: string;
  sender: PickupSenderSnapshot;
  parcelCount: number;
  heaviestWeightKg: number;
  remark: string;
  selectedParcels: ResolvedParcel[];
};

class PickupInputError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status = 400, code?: string) {
    super(message);
    this.name = "PickupInputError";
    this.status = status;
    this.code = code;
  }
}

function requiredText(value: string | null | undefined, label: string): string {
  const text = value?.trim();
  if (!text) throw new PickupInputError(`ข้อมูล${label}ของผู้ส่งไม่ครบ กรุณาแก้ไขข้อมูลผู้ส่งก่อน`);
  return text;
}

function senderSnapshot(input: {
  contactName: string | null;
  phone: string | null;
  addressLine: string | null;
  tambon: string | null;
  amphoe: string | null;
  province: string | null;
  zipcode: string | null;
}): PickupSenderSnapshot {
  const phone = normalizeThaiPhone(requiredText(input.phone, "เบอร์โทร"));
  if (!isValidThaiPhone(phone)) {
    throw new PickupInputError("เบอร์โทรผู้ส่งไม่ถูกต้อง กรุณาแก้ไขข้อมูลผู้ส่งก่อน");
  }
  return {
    contactName: requiredText(input.contactName, "ชื่อ"),
    phone,
    addressLine: requiredText(input.addressLine, "ที่อยู่"),
    tambon: requiredText(input.tambon, "ตำบล/แขวง"),
    amphoe: requiredText(input.amphoe, "อำเภอ/เขต"),
    province: requiredText(input.province, "จังหวัด"),
    zipcode: requiredText(input.zipcode, "รหัสไปรษณีย์"),
  };
}

async function resolveSystemPickup(body: PickupBody, userId: string): Promise<ResolvedPickup> {
  const senderAddressId =
    typeof body.senderAddressId === "string" ? body.senderAddressId.trim() : "";
  if (!senderAddressId) {
    throw new PickupInputError("กรุณาเพิ่มหรือเลือกที่อยู่เข้ารับพัสดุ");
  }

  const parcelIds = [...new Set((body.parcelIds ?? []).map((id) => id.trim()).filter(Boolean))];
  if (!parcelIds.length) throw new PickupInputError("กรุณาเลือกพัสดุอย่างน้อย 1 ชิ้น");
  if (parcelIds.length > MAX_SYSTEM_PARCELS) {
    throw new PickupInputError(`เลือกพัสดุได้สูงสุด ${MAX_SYSTEM_PARCELS} ชิ้นต่อครั้ง`);
  }

  const db = getDb();
  const [pickupAddress] = await db
    .select()
    .from(senderAddresses)
    .where(
      and(
        eq(senderAddresses.id, senderAddressId),
        eq(senderAddresses.userId, userId),
      ),
    )
    .limit(1);
  if (!pickupAddress) {
    throw new PickupInputError("ไม่พบที่อยู่เข้ารับพัสดุ กรุณาเลือกที่อยู่อีกครั้ง", 404);
  }
  const pickupSender = senderSnapshot({
    contactName: pickupAddress.contactName,
    phone: pickupAddress.phone,
    addressLine: pickupAddress.addressLine,
    tambon: pickupAddress.tambon,
    amphoe: pickupAddress.amphoe,
    province: pickupAddress.province,
    zipcode: pickupAddress.zipcode,
  });

  const rows = await db
    .select({
      parcelId: parcels.id,
      trackingId: parcels.trackingId,
      barcode: parcels.barcode,
      weightKg: parcels.weightKg,
      status: parcels.status,
      recipientName: orders.cusName,
      orderCreatedAt: orders.createdAt,
    })
    .from(parcels)
    .innerJoin(orders, eq(orders.parcelId, parcels.id))
    .where(and(eq(parcels.userId, userId), inArray(parcels.id, parcelIds)))
    .orderBy(desc(orders.createdAt));

  const latestByParcel = new Map<string, (typeof rows)[number]>();
  for (const row of rows) if (!latestByParcel.has(row.parcelId)) latestByParcel.set(row.parcelId, row);
  if (latestByParcel.size !== parcelIds.length) {
    throw new PickupInputError("ไม่พบข้อมูลพัสดุบางรายการ กรุณาโหลดรายการใหม่", 404);
  }

  const selectedParcels: ResolvedParcel[] = [];

  for (const parcelId of parcelIds) {
    const row = latestByParcel.get(parcelId)!;
    if (row.status !== "awaiting_actual_weight") {
      throw new PickupInputError("พัสดุบางรายการไม่อยู่ในสถานะรอนำส่งไปรษณีย์ กรุณาโหลดรายการใหม่", 409);
    }
    const weightKg = Number(row.weightKg);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      throw new PickupInputError(`พัสดุ ${row.barcode || row.trackingId} ไม่มีข้อมูลน้ำหนัก`);
    }
    if (weightKg > MAX_PICKUP_WEIGHT_KG) {
      throw new PickupInputError(
        `พัสดุ ${row.barcode || row.trackingId} มีน้ำหนักเกิน ${MAX_PICKUP_WEIGHT_KG} กก.`,
      );
    }
    selectedParcels.push({
      id: row.parcelId,
      trackingCode: row.trackingId,
      barcode: row.barcode,
      weightKg,
      recipientName: row.recipientName?.trim() || null,
    });
  }

  const conflicts = await db
    .select({ parcelId: ishipPickupRequestParcels.parcelId })
    .from(ishipPickupRequestParcels)
    .innerJoin(
      ishipPickupRequests,
      eq(ishipPickupRequests.id, ishipPickupRequestParcels.pickupRequestId),
    )
    .where(
      and(
        inArray(ishipPickupRequestParcels.parcelId, parcelIds),
        inArray(ishipPickupRequests.status, BLOCKING_ISHIP_PICKUP_STATUSES),
      ),
    );
  if (conflicts.length) {
    throw new PickupInputError(
      "พัสดุบางรายการมีคำขอเข้ารับที่กำลังดำเนินการอยู่แล้ว",
      409,
      "PICKUP_PARCEL_CONFLICT",
    );
  }

  return {
    senderAddressId,
    sender: pickupSender,
    parcelCount: selectedParcels.length,
    heaviestWeightKg: Math.max(...selectedParcels.map((item) => item.weightKg)),
    remark: buildSystemPickupRemark(
      selectedParcels.map((item) => item.barcode || item.trackingCode),
      body.remark ?? "",
    ),
    selectedParcels,
  };
}

function jsonError(error: unknown) {
  if (error instanceof PickupInputError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code },
      { status: error.status, headers: CacheHeaders.noStore },
    );
  }
  if (error instanceof IshipApiError) {
    return NextResponse.json(
      { ok: false, error: error.message, code: error.code, ambiguous: error.ambiguous },
      { status: error.httpStatus, headers: CacheHeaders.noStore },
    );
  }
  const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดในระบบ";
  return NextResponse.json(
    { ok: false, error: message },
    { status: 500, headers: CacheHeaders.noStore },
  );
}

function replayResponse(row: typeof ishipPickupRequests.$inferSelect) {
  const data = toPickupRequestDto(row);
  if (row.status === "failed") {
    return NextResponse.json(
      { ok: false, error: row.failureMessage || "คำขอเรียกรถรายการนี้ไม่สำเร็จ", data, replayed: true },
      { status: 409, headers: CacheHeaders.noStore },
    );
  }
  if (row.status === "unknown" || row.status === "submitting") {
    return NextResponse.json(
      {
        ok: false,
        error:
          row.failureMessage ||
          "คำขอนี้กำลังตรวจสอบสถานะ ระบบจะไม่ส่งคำขอซ้ำเพื่อป้องกันรถเข้ารับซ้ำ",
        data,
        replayed: true,
        ambiguous: true,
      },
      { status: 409, headers: CacheHeaders.noStore },
    );
  }
  return NextResponse.json(
    { ok: true, data, replayed: true },
    { headers: CacheHeaders.noStore },
  );
}

export async function GET(request: Request) {
  try {
    const session = await requireLineSession();
    const searchParams = new URL(request.url).searchParams;
    const pageRaw = Number(searchParams.get("page") || "1");
    const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const activeOnly = searchParams.get("scope") === "active";
    const db = getDb();
    const rows = await db
      .select()
      .from(ishipPickupRequests)
      .where(
        activeOnly
          ? and(
              eq(ishipPickupRequests.userId, session.userId),
              inArray(ishipPickupRequests.status, [
                "submitting",
                "requested",
                "assigned",
                "unknown",
              ]),
            )
          : eq(ishipPickupRequests.userId, session.userId),
      )
      .orderBy(desc(ishipPickupRequests.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset((page - 1) * PAGE_SIZE);
    const pageRows = rows.slice(0, PAGE_SIZE);
    const pickupIds = pageRows.map((row) => row.id);
    const recipientRows = pickupIds.length
      ? await db
          .select({
            pickupRequestId: ishipPickupRequestParcels.pickupRequestId,
            parcelId: ishipPickupRequestParcels.parcelId,
            recipientName: orders.cusName,
            orderCreatedAt: orders.createdAt,
          })
          .from(ishipPickupRequestParcels)
          .innerJoin(orders, eq(orders.parcelId, ishipPickupRequestParcels.parcelId))
          .where(inArray(ishipPickupRequestParcels.pickupRequestId, pickupIds))
          .orderBy(desc(orders.createdAt))
      : [];
    const recipientNamesByPickup = new Map<string, string[]>();
    const seenParcels = new Set<string>();
    for (const recipient of recipientRows) {
      const parcelKey = `${recipient.pickupRequestId}:${recipient.parcelId}`;
      if (seenParcels.has(parcelKey)) continue;
      seenParcels.add(parcelKey);
      const name = recipient.recipientName?.trim();
      if (!name) continue;
      const names = recipientNamesByPickup.get(recipient.pickupRequestId) ?? [];
      if (!names.includes(name)) names.push(name);
      recipientNamesByPickup.set(recipient.pickupRequestId, names);
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          items: pageRows.map((row) =>
            toPickupRequestDto(row, recipientNamesByPickup.get(row.id)),
          ),
          page,
          hasMore: rows.length > PAGE_SIZE,
        },
      },
      { headers: CacheHeaders.noStore },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  let reservedId: string | null = null;
  try {
    const session = await requireLineSession();
    const body = (await request.json()) as PickupBody;
    if (body.inputSource !== undefined && body.inputSource !== "system") {
      throw new PickupInputError("รองรับเฉพาะพัสดุที่ลงทะเบียนในระบบ Quickload");
    }
    const idempotencyKey = normalizePickupIdempotencyKey(body.idempotencyKey);
    if (!idempotencyKey) throw new PickupInputError("รหัสคำขอไม่ถูกต้อง กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง");

    const db = getDb();
    const [existing] = await db
      .select()
      .from(ishipPickupRequests)
      .where(
        and(
          eq(ishipPickupRequests.userId, session.userId),
          eq(ishipPickupRequests.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) {
      return replayResponse(existing);
    }

    const resolved = await resolveSystemPickup(body, session.userId);

    getIshipConfig();
    const courierCode = ISHIP_PICKUP_COURIER_CODE;
    const pickupAddressFull = formatIshipPickupAddress(resolved.sender);
    const ishipPayload = buildIshipRequestCourierPayload({
      pickupAddress: pickupAddressFull,
      name: resolved.sender.contactName,
      phone: resolved.sender.phone,
      parcelCount: resolved.parcelCount,
      remark: resolved.remark,
    });

    const reserved = await db.transaction(async (tx) => {
      const [sameKey] = await tx
        .select()
        .from(ishipPickupRequests)
        .where(
          and(
            eq(ishipPickupRequests.userId, session.userId),
            eq(ishipPickupRequests.idempotencyKey, idempotencyKey),
          ),
        )
        .limit(1);
      if (sameKey) return { row: sameKey, replayed: true } as const;

      if (resolved.selectedParcels.length) {
        const ids = resolved.selectedParcels.map((item) => item.id);
        const currentParcels = await tx
          .select({ id: parcels.id, status: parcels.status })
          .from(parcels)
          .where(and(eq(parcels.userId, session.userId), inArray(parcels.id, ids)))
          .for("update");
        if (
          currentParcels.length !== ids.length ||
          currentParcels.some((item) => item.status !== "awaiting_actual_weight")
        ) {
          throw new PickupInputError("สถานะพัสดุมีการเปลี่ยนแปลง กรุณาโหลดรายการใหม่", 409);
        }
        const active = await tx
          .select({ parcelId: ishipPickupRequestParcels.parcelId })
          .from(ishipPickupRequestParcels)
          .innerJoin(
            ishipPickupRequests,
            eq(ishipPickupRequests.id, ishipPickupRequestParcels.pickupRequestId),
          )
          .where(
            and(
              inArray(ishipPickupRequestParcels.parcelId, ids),
              inArray(ishipPickupRequests.status, BLOCKING_ISHIP_PICKUP_STATUSES),
            ),
          );
        if (active.length) {
          throw new PickupInputError(
            "พัสดุบางรายการมีคำขอเข้ารับที่กำลังดำเนินการอยู่แล้ว",
            409,
            "PICKUP_PARCEL_CONFLICT",
          );
        }
      }

      const [row] = await tx
        .insert(ishipPickupRequests)
        .values({
          userId: session.userId,
          idempotencyKey,
          inputSource: "system",
          senderAddressId: resolved.senderAddressId,
          contactName: resolved.sender.contactName,
          contactPhone: resolved.sender.phone,
          pickupAddressLine: resolved.sender.addressLine,
          pickupTambon: resolved.sender.tambon,
          pickupAmphoe: resolved.sender.amphoe,
          pickupProvince: resolved.sender.province,
          pickupZipcode: resolved.sender.zipcode,
          pickupAddressFull,
          parcelCount: resolved.parcelCount,
          heaviestWeightKg: resolved.heaviestWeightKg.toFixed(3),
          courierCode,
          remark: resolved.remark,
          status: "submitting",
          ishipRequestJson: ishipPayload,
          updatedAt: new Date(),
        })
        .returning();
      if (!row) throw new Error("สร้างคำขอเข้ารับไม่สำเร็จ");

      if (resolved.selectedParcels.length) {
        await tx.insert(ishipPickupRequestParcels).values(
          resolved.selectedParcels.map((item) => ({
            pickupRequestId: row.id,
            parcelId: item.id,
            trackingCode: item.trackingCode,
            barcode: item.barcode,
          })),
        );
      }
      return { row, replayed: false } as const;
    });

    if (reserved.replayed) {
      return replayResponse(reserved.row);
    }
    reservedId = reserved.row.id;

    let result: Awaited<ReturnType<typeof requestIshipCourier>>;
    try {
      result = await requestIshipCourier(ishipPayload);
    } catch (error) {
      const ishipError =
        error instanceof IshipApiError
          ? error
          : new IshipApiError({ code: "provider", message: "ผู้ให้บริการไม่รับคำขอเรียกรถเข้ารับ" });
      await db
        .update(ishipPickupRequests)
        .set({
          status: ishipError.ambiguous ? "unknown" : "failed",
          failureCode: ishipError.code,
          failureMessage: ishipError.message,
          ishipResponseJson: ishipError.rawResponse,
          updatedAt: new Date(),
        })
        .where(eq(ishipPickupRequests.id, reserved.row.id));
      throw ishipError;
    }

    const persistedValues = {
      status: "requested" as const,
      ishipTicketPickupId: result.ticketPickupId,
      ishipRecordId: result.recordId,
      providerMessage: result.message,
      staffInfoName: result.staffInfoName,
      staffInfoPhone: result.staffInfoPhone,
      timeoutAtText: result.timeoutAtText,
      ticketMessage: result.ticketMessage,
      ishipResponseJson: result.raw,
      failureCode: null,
      failureMessage: null,
      updatedAt: new Date(),
    };
    let updated: typeof ishipPickupRequests.$inferSelect | undefined;
    let persistenceError: unknown = null;
    // Retrying this local idempotent UPDATE is safe; retrying request_courier
    // is not. Brief database/pooler failures should not leave a successful
    // external booking unsynchronised when a later write can recover it.
    for (let attempt = 0; attempt < 3 && !updated; attempt += 1) {
      try {
        // Keep the write and returned row in one database statement. A
        // separate read-after-write can briefly fail even though iShip
        // already accepted the booking.
        [updated] = await db
          .update(ishipPickupRequests)
          .set(persistedValues)
          .where(eq(ishipPickupRequests.id, reserved.row.id))
          .returning();
        persistenceError = null;
      } catch (error) {
        persistenceError = error;
      }
      if (!updated && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }

    if (!updated) {
      const fallbackRow: typeof ishipPickupRequests.$inferSelect = {
        ...reserved.row,
        ...persistedValues,
      };
      console.error("[pickup] iShip accepted but local persistence did not complete", {
        pickupRequestId: reserved.row.id,
        ticketPickupId: result.ticketPickupId,
        error:
          persistenceError instanceof Error
            ? persistenceError.message
            : "pickup row not returned",
      });
      void recordSystemErrorEvent({
        source: "pickup.iship-success-persistence",
        error:
          persistenceError ??
          new Error("Pickup row disappeared while saving a successful iShip response"),
        severity: "critical",
        context: {
          pickupRequestId: reserved.row.id,
          ticketPickupId: result.ticketPickupId,
          idempotencyKey,
        },
      });
      return NextResponse.json(
        {
          ok: true,
          data: toPickupRequestDto(
            fallbackRow,
            resolved.selectedParcels.map((parcel) => parcel.recipientName),
          ),
          persistencePending: true,
          warning:
            "ส่งคำขอเรียกรถสำเร็จแล้ว ระบบกำลังซิงก์ข้อมูล กรุณาอย่าส่งคำขอซ้ำ",
        },
        { status: 202, headers: CacheHeaders.noStore },
      );
    }
    return NextResponse.json(
      {
        ok: true,
        data: toPickupRequestDto(
          updated,
          resolved.selectedParcels.map((parcel) => parcel.recipientName),
        ),
      },
      { headers: CacheHeaders.noStore },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    const code = (error as { code?: string } | null)?.code;
    if (code === "23505") {
      return NextResponse.json(
        { ok: false, error: "คำขอนี้กำลังดำเนินการอยู่ กรุณาโหลดประวัติอีกครั้ง", requestId: reservedId },
        { status: 409, headers: CacheHeaders.noStore },
      );
    }
    return jsonError(error);
  }
}
