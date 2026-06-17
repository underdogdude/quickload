/** Block /send when unpaid ≥ this long after price confirmation. */
export const SEND_ACCESS_BLOCK_AFTER_MS = 24 * 60 * 60 * 1000;

export const SEND_ACCESS_BLOCKED_MESSAGE =
  "คุณมีพัสดุค้างชำระเกิน 24 ชม. ไม่สามารถทำรายการส่งพัสดุใหม่ได้ กรุณาชำระก่อนส่งพัสดุใหม่";

export function isSendAccessBlockedForParcel(args: {
  thaiPostPriceConfirmedAt: Date | null;
  outstanding: number;
  now?: Date;
}): boolean {
  if (!args.thaiPostPriceConfirmedAt || args.outstanding <= 0) return false;
  const now = args.now ?? new Date();
  return now.getTime() - args.thaiPostPriceConfirmedAt.getTime() >= SEND_ACCESS_BLOCK_AFTER_MS;
}
