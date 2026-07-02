function internalNotifyTargets(): string[] {
  const raw =
    process.env.LINE_INTERNAL_NOTIFY_USER_IDS?.trim() ||
    process.env.LINE_INTERNAL_NOTIFY_USER_ID?.trim() ||
    "";
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

export async function sendInternalLineAlert(text: string): Promise<void> {
  const token = process.env.LINE_INTERNAL_CHANNEL_ACCESS_TOKEN?.trim();
  const targets = internalNotifyTargets();
  if (!token) {
    throw new Error("LINE_INTERNAL_CHANNEL_ACCESS_TOKEN is not set");
  }
  if (targets.length === 0) {
    throw new Error("LINE_INTERNAL_NOTIFY_USER_IDS or LINE_INTERNAL_NOTIFY_USER_ID is not set");
  }

  const failures: string[] = [];
  let sent = 0;
  for (const target of targets) {
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: target,
        messages: [{ type: "text", text }],
      }),
    });

    if (response.ok) {
      sent += 1;
      continue;
    }

    const body = await response.text().catch(() => "");
    failures.push(`${target}: ${response.status} ${body}`);
  }

  if (failures.length > 0) {
    console.warn(`LINE internal send partial failure: ${failures.join("; ")}`);
  }
  if (sent === 0) {
    throw new Error(`LINE internal send failed for all recipients: ${failures.join("; ")}`);
  }
}
