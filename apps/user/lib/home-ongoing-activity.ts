export type OngoingActivity = {
  id: string;
  createdAt: string;
  href: string;
  kind: "pickup" | "parcel";
  title: string;
  detail: string;
  supportingText: string;
};

function pickupTitle(status: string) {
  if (status === "assigned") return "พนักงานกำลังเข้ารับพัสดุ";
  if (status === "submitting") return "กำลังส่งคำขอเข้ารับ";
  if (status === "unknown") return "กำลังตรวจสอบคำขอเข้ารับ";
  return "รอไปรษณีย์เข้ารับพัสดุ";
}

function parcelTitle(status: string) {
  if (status === "pending_payment") return "พัสดุรอชำระเงิน";
  if (status === "in_transit") return "พัสดุกำลังเดินทาง";
  if (status === "at_destination_post") return "พัสดุถึงปลายทางแล้ว";
  if (status === "returning") return "พัสดุกำลังส่งคืน";
  if (status === "awaiting_actual_weight") return "พัสดุรอชั่งน้ำหนัก";
  return "กำลังเตรียมจัดส่งพัสดุ";
}

function formatBaht(value: number) {
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.max(0, value));
}

export function buildPickupOngoingActivity(input: {
  id: string;
  createdAt: string;
  status: string;
  ticketPickupId: string | null;
  parcelCount: number;
}): OngoingActivity {
  return {
    id: `pickup:${input.id}`,
    createdAt: input.createdAt,
    href: "/pickup/requests",
    kind: "pickup",
    title: pickupTitle(input.status),
    detail: `${input.parcelCount.toLocaleString("th-TH")} ชิ้น`,
    supportingText: input.ticketPickupId
      ? `เลขที่คำขอ ${input.ticketPickupId}`
      : "กำลังออกเลขที่คำขอ",
  };
}

export function buildParcelOngoingActivity(input: {
  id: string;
  createdAt: string;
  status: string;
  trackingId: string;
  barcode: string | null;
  price: string | null;
  amountPaid: string | null;
}): OngoingActivity {
  const outstanding = Math.max(
    0,
    Number(input.price ?? 0) - Number(input.amountPaid ?? 0),
  );
  const displayCode = input.barcode?.trim() || input.trackingId;
  const needsPayment = input.status === "pending_payment" && outstanding > 0;

  return {
    id: `parcel:${input.id}`,
    createdAt: input.createdAt,
    href: needsPayment
      ? `/pay/${encodeURIComponent(input.id)}`
      : `/parcels/${encodeURIComponent(input.id)}`,
    kind: "parcel",
    title: parcelTitle(input.status),
    detail: displayCode,
    supportingText: needsPayment
      ? `ยอดชำระ ${formatBaht(outstanding)} บาท`
      : input.status === "awaiting_actual_weight"
        ? "นำส่งที่ไปรษณีย์หรือเรียกรถเข้ารับ"
        : "แตะเพื่อดูรายละเอียด",
  };
}

export function selectRecentOngoingActivities(
  activities: OngoingActivity[],
  limit = 6,
): OngoingActivity[] {
  return [...activities]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, Math.max(0, limit));
}
