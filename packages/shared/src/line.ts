export type LineMessage =
  | { type: "text"; text: string }
  | Record<string, unknown>;

export async function sendLineMessage(lineUserId: string, message: LineMessage): Promise<Response> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  return fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineUserId,
      messages: [message],
    }),
  });
}
