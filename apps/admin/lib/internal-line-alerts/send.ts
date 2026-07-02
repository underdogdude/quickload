import { sendLineMessage } from "@quickload/shared/line";

export async function sendInternalLineAlert(text: string): Promise<void> {
  const target = process.env.LINE_INTERNAL_NOTIFY_USER_ID?.trim();
  if (!target) {
    throw new Error("LINE_INTERNAL_NOTIFY_USER_ID is not set");
  }
  await sendLineMessage(target, { type: "text", text });
}
