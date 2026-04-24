type OrderSuccessFlexInput = {
  trackingNumber?: string | null;
  referenceCode?: string | null;
  senderName?: string | null;
  senderPhone?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  weightGram?: string | number | null;
  sizeText?: string | null;
  parcelType?: string | null;
  trackingUrl?: string | null;
  qrCodeImageUrl?: string | null;
};

function textOrDash(v?: string | null): string {
  const s = v?.trim();
  return s ? s : "-";
}

function formatWeight(v?: string | number | null): string {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v <= 0) return "-";
    return `${v.toLocaleString("th-TH")} กรัม`;
  }
  if (!v) return "-";
  const n = Number(v);
  if (Number.isFinite(n) && n > 0) return `${n.toLocaleString("th-TH")} กรัม`;
  return textOrDash(String(v));
}

export function createOrderSuccessFlexMessage(input: OrderSuccessFlexInput): {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
} {
  const trackingNumber = textOrDash(input.trackingNumber);
  const referenceCode = textOrDash(input.referenceCode);
  const sender = [input.senderName?.trim(), input.senderPhone?.trim()].filter(Boolean).join(" | ") || "-";
  const recipient = [input.recipientName?.trim(), input.recipientPhone?.trim()].filter(Boolean).join(" | ") || "-";
  const rows = [
    { label: "หมายเลขพัสดุ", value: trackingNumber },
    { label: "Reference code", value: referenceCode },
    { label: "ผู้ส่ง", value: sender },
    { label: "ผู้รับ", value: recipient },
    { label: "น้ำหนัก", value: formatWeight(input.weightGram) },
    { label: "ขนาด", value: textOrDash(input.sizeText) },
    { label: "ประเภท", value: textOrDash(input.parcelType) },
  ];

  const contents: Record<string, unknown> = {
    type: "bubble",
    size: "giga",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "text",
          text: "สร้างพัสดุสำเร็จ",
          weight: "bold",
          size: "xl",
          color: "#111827",
        },
        {
          type: "text",
          text: "ระบบบันทึกข้อมูลเรียบร้อยแล้ว",
          size: "sm",
          color: "#6B7280",
          wrap: true,
        },
        {
          type: "separator",
          margin: "md",
        },
        {
          type: "box",
          layout: "vertical",
          spacing: "sm",
          margin: "md",
          contents: rows.map((row) => ({
            type: "box",
            layout: "baseline",
            spacing: "sm",
            contents: [
              {
                type: "text",
                text: row.label,
                color: "#6B7280",
                size: "xs",
                flex: 3,
                wrap: true,
              },
              {
                type: "text",
                text: row.value,
                color: "#111827",
                size: "sm",
                weight: "bold",
                align: "end",
                flex: 5,
                wrap: true,
              },
            ],
          })),
        },
      ],
      paddingAll: "16px",
    },
  };

  if (input.qrCodeImageUrl?.trim()) {
    contents.hero = {
      type: "image",
      url: input.qrCodeImageUrl.trim(),
      size: "full",
      aspectRatio: "1:1",
      aspectMode: "cover",
      action: {
        type: "uri",
        uri: input.qrCodeImageUrl.trim(),
      },
    };
  }

  if (input.trackingUrl?.trim()) {
    contents.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#2726F5",
          action: {
            type: "uri",
            label: "ติดตามพัสดุ",
            uri: input.trackingUrl.trim(),
          },
        },
      ],
      paddingAll: "16px",
    };
  }

  return {
    type: "flex",
    altText: `สร้างพัสดุสำเร็จ หมายเลข ${trackingNumber}`,
    contents,
  };
}

