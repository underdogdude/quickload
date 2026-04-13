import { getDb } from "./db";
import { notificationLog } from "./db/schema";
import { sendLineMessage } from "./line";

export async function pushAndLogLineMessage(params: {
  userId: string | null;
  lineUserId: string;
  type: string;
  message: Parameters<typeof sendLineMessage>[1];
  payload?: unknown;
}): Promise<{ ok: boolean; status: string }> {
  const db = getDb();
  let status: "sent" | "failed" = "sent";
  try {
    const res = await sendLineMessage(params.lineUserId, params.message);
    if (!res.ok) status = "failed";
  } catch {
    status = "failed";
  }
  await db.insert(notificationLog).values({
    userId: params.userId,
    lineUserId: params.lineUserId,
    type: params.type,
    payload: params.payload as object | null,
    status,
  });
  return { ok: status === "sent", status };
}
