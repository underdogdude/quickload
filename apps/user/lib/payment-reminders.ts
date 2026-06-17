import {
  createPaymentReminderDay1FlexMessage,
  createPaymentReminderDay2FlexMessage,
  createPaymentReminderDay7FlexMessage,
} from "@/lib/line-flex";

const AGENT_NAMES = ["นิดา", "ใบเตย", "แอน", "มินตรา", "เบล", "มาย", "แพร", "ฟ้า"] as const;

export const PAYMENT_REMINDER_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type PaymentReminderDay = (typeof PAYMENT_REMINDER_DAYS)[number];

export function reminderTypeForDay(day: PaymentReminderDay): string {
  return `payment_reminder_day_${day}`;
}

export function pickReminderAgentName(parcelId: string): string {
  let hash = 0;
  for (let i = 0; i < parcelId.length; i++) {
    hash = (hash + parcelId.charCodeAt(i)) % AGENT_NAMES.length;
  }
  return AGENT_NAMES[hash] ?? AGENT_NAMES[0];
}

/** Calendar-day difference in Asia/Bangkok (matches cron at 09:00 ICT). */
export function daysSinceConfirmed(confirmedAt: Date, now = new Date()): number {
  const bangkokYmd = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const y = Number(parts.find((p) => p.type === "year")?.value);
    const m = Number(parts.find((p) => p.type === "month")?.value);
    const day = Number(parts.find((p) => p.type === "day")?.value);
    return Date.UTC(y, m - 1, day);
  };
  return Math.floor((bangkokYmd(now) - bangkokYmd(confirmedAt)) / (24 * 60 * 60 * 1000));
}

export function daysRemainingInPaymentWindow(
  confirmedAt: Date,
  windowDays = 7,
  now = new Date(),
): number {
  const elapsed = daysSinceConfirmed(confirmedAt, now);
  return Math.max(0, windowDays - elapsed);
}

export function nextDueReminderDay(
  daysSince: number,
  alreadySent: (day: PaymentReminderDay) => boolean,
): PaymentReminderDay | null {
  for (const day of PAYMENT_REMINDER_DAYS) {
    if (daysSince >= day && !alreadySent(day)) return day;
  }
  return null;
}

function formatReminderBaht(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Plain text follow-up — day 3 uses agent name; day 4 does not. */
function createPaymentReminderOverdueTextMessage(input: {
  parcelId?: string;
  displayCode: string;
  amountBaht: string | number;
  overdueDays: number;
  includeAgentName: boolean;
}): { type: "text"; text: string } {
  const code = input.displayCode.trim() || "-";
  const amount = formatReminderBaht(input.amountBaht);
  const greetingLine = input.includeAgentName
    ? `สวัสดีค่ะ เจ้าหน้าที่${pickReminderAgentName(input.parcelId ?? "")} ติดต่อจาก QUICKLOAD ค่ะ`
    : "สวัสดีค่ะ ติดต่ออีกครั้งจาก QUICKLOAD ค่ะ";

  return {
    type: "text",
    text: [
      greetingLine,
      "",
      `ขออนุญาตติดตามยอดค้างชำระของเลขพัสดุ ${code} ค่ะ`,
      "",
      `ยอดค้างชำระ: ฿ ${amount}`,
      `รายการนี้เลยกำหนดชำระมาแล้ว ${input.overdueDays} วันค่ะ`,
      "",
      "รบกวนช่วยชำระยอดค้าง เพื่อปิดรายการนี้ให้เรียบร้อยนะคะ",
      "",
      "สามารถดูบิลและรายละเอียดได้ที่เมนู",
      "ชำระเงิน > เลือกยอดที่ต้องการชำระ",
      "",
      "ขออภัยหากคุณได้ชำระยอดนี้ก่อนหน้านี้แล้วค่ะ",
      "",
      "หากมีข้อสงสัย สามารถพิมพ์สอบถามได้ที่แชทนี้",
      "หรือติดต่อ support@supersolutionsystem.com",
      "",
      "ขอบคุณค่ะ 🙏",
    ].join("\n"),
  };
}

/** Day 3: plain text — feels like a real person typed it (reduces reactance vs. branded flex). */
export function createPaymentReminderDay3TextMessage(input: {
  parcelId: string;
  displayCode: string;
  amountBaht: string | number;
}): { type: "text"; text: string } {
  return createPaymentReminderOverdueTextMessage({
    ...input,
    overdueDays: 3,
    includeAgentName: true,
  });
}

/** Day 4: same body as day 3; greeting matches day 5 opener (no agent name). */
export function createPaymentReminderDay4TextMessage(input: {
  displayCode: string;
  amountBaht: string | number;
}): { type: "text"; text: string } {
  return createPaymentReminderOverdueTextMessage({
    displayCode: input.displayCode,
    amountBaht: input.amountBaht,
    overdueDays: 4,
    includeAgentName: false,
  });
}

/** Day 5: plain text follow-up — firmer tone before final day-7 flex. */
export function createPaymentReminderDay5TextMessage(input: {
  displayCode: string;
  amountBaht: string | number;
}): { type: "text"; text: string } {
  const code = input.displayCode.trim() || "-";
  const amount = formatReminderBaht(input.amountBaht);

  return {
    type: "text",
    text: [
      "สวัสดีค่ะ ติดต่ออีกครั้งจาก QUICKLOAD ค่ะ",
      "",
      `ขออนุญาตติดตามยอดค้างชำระของเลขพัสดุ ${code} อีกครั้งนะคะ`,
      "",
      `ยอดค้างชำระอยู่ที่ ฿ ${amount}`,
      "",
      "รบกวนชำระยอดค้างโดยเร็ว เพื่อปิดรายการนี้ให้เรียบร้อย หากยังไม่ได้รับการชำระภายในระยะเวลาที่กำหนด",
      "รายการนี้อาจถูกส่งต่อเข้าสู่ขั้นตอนติดตามยอดค้างชำระอย่างเป็นทางการค่ะ",
      "",
      "สามารถดูบิลและรายละเอียดได้ที่เมนู",
      "ชำระเงิน > เลือกยอดที่ต้องการชำระ",
      "",
      "หากมีข้อสงสัย สามารถพิมพ์สอบถามได้ที่แชทนี้",
      "หรือติดต่อ support@supersolutionsystem.com",
      "",
      "ขอบคุณค่ะ 🙏",
    ].join("\n"),
  };
}

/** Day 6: short firm text — last warning before day-7 final flex. */
export function createPaymentReminderDay6TextMessage(input: {
  displayCode: string;
  amountBaht: string | number;
}): { type: "text"; text: string } {
  const code = input.displayCode.trim() || "-";
  const amount = formatReminderBaht(input.amountBaht);

  return {
    type: "text",
    text: [
      `หมายเลขพัสดุ ${code} ค้างชำระ ฿ ${amount} เป็นเวลา 6 วัน`,
      "กรุณาชำระภายใน 24 ชม. มิฉะนะนี้จะดำเนินการติดตามหนี้ตามขั้นตอน",
      "",
      "ชำระได้ที่เมนู: ชำระเงิน > เลือกยอดที่ต้องการชำระ",
    ].join("\n"),
  };
}

export function buildReminderMessage(
  day: PaymentReminderDay,
  input: {
    parcelId: string;
    displayCode: string;
    amountBaht: string | number;
    payUrl: string;
    daysRemaining?: number;
  },
):
  | { type: "text"; text: string }
  | ReturnType<typeof createPaymentReminderDay1FlexMessage>
  | ReturnType<typeof createPaymentReminderDay2FlexMessage> {
  if (day === 2) {
    return createPaymentReminderDay2FlexMessage({
      trackingNumber: input.displayCode,
      amountBaht: input.amountBaht,
      payUrl: input.payUrl,
    });
  }
  if (day === 3) {
    return createPaymentReminderDay3TextMessage({
      parcelId: input.parcelId,
      displayCode: input.displayCode,
      amountBaht: input.amountBaht,
    });
  }
  if (day === 4) {
    return createPaymentReminderDay4TextMessage({
      displayCode: input.displayCode,
      amountBaht: input.amountBaht,
    });
  }
  if (day === 5) {
    return createPaymentReminderDay5TextMessage({
      displayCode: input.displayCode,
      amountBaht: input.amountBaht,
    });
  }
  if (day === 6) {
    return createPaymentReminderDay6TextMessage({
      displayCode: input.displayCode,
      amountBaht: input.amountBaht,
    });
  }
  if (day === 7) {
    return createPaymentReminderDay7FlexMessage({
      trackingNumber: input.displayCode,
      amountBaht: input.amountBaht,
      payUrl: input.payUrl,
    });
  }
  return createPaymentReminderDay1FlexMessage({
    trackingNumber: input.displayCode,
    amountBaht: input.amountBaht,
    payUrl: input.payUrl,
  });
}
