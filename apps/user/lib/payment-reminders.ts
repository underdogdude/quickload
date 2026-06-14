import {
  createPaymentReminderDay1FlexMessage,
  createPaymentReminderDay7FlexMessage,
} from "@/lib/line-flex";

const AGENT_NAMES = ["นิดา", "พิม", "แอน", "มินตรา", "เบล", "มาย", "แพร", "ฟ้า"] as const;

export const PAYMENT_REMINDER_DAYS = [1, 3, 7] as const;
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

/** Day 3: plain text — feels like a real person typed it (reduces reactance vs. branded flex). */
export function createPaymentReminderDay3TextMessage(input: {
  parcelId: string;
  displayCode: string;
  daysRemaining?: number;
}): { type: "text"; text: string } {
  const name = pickReminderAgentName(input.parcelId);
  const code = input.displayCode.trim() || "-";
  const remaining = input.daysRemaining ?? 7;
  const deadlineLine =
    remaining <= 0
      ? "กรุณาชำระเงินโดยเร็วที่สุดนะคะ 🙏"
      : `กรุณาชำระเงินภายใน ${remaining} วันนะคะ 🙏`;
  return {
    type: "text",
    text: `สวัสดีคะ ติดต่อจาก QUICKLOAD ชื่อ ${name} นะคะ\nยังไม่ได้รับการชำระเงินใน order ${code}\n${deadlineLine}`,
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
): { type: "text"; text: string } | ReturnType<typeof createPaymentReminderDay1FlexMessage> {
  if (day === 3) {
    return createPaymentReminderDay3TextMessage({
      parcelId: input.parcelId,
      displayCode: input.displayCode,
      daysRemaining: input.daysRemaining,
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
