type LinePushMessage =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "flex";
      altText: string;
      contents: Record<string, unknown>;
    };

type PushLineMessageArgs = {
  to: string;
  message: LinePushMessage;
};

function getLineMessagingConfig() {
  const token =
    process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN?.trim() ||
    process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() ||
    "";
  const baseUrl = process.env.LINE_MESSAGING_API_BASE_URL?.trim() || "https://api.line.me";
  return { token, baseUrl };
}

export async function pushLineMessage(args: PushLineMessageArgs): Promise<void> {
  const { token, baseUrl } = getLineMessagingConfig();
  if (!token) {
    throw new Error("Missing LINE messaging access token");
  }
  if (!args.to?.trim()) {
    throw new Error("Missing LINE recipient user id");
  }

  const endpoint = `${baseUrl.replace(/\/+$/, "")}/v2/bot/message/push`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: args.to,
      messages: [args.message],
    }),
  });

  if (!res.ok) {
    const raw = await res.text();
    const snippet = raw.slice(0, 700);
    throw new Error(`LINE push failed (${res.status}): ${snippet || "no body"}`);
  }
}

