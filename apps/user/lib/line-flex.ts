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
  labelPdfUrl?: string | null;
  qrCodeImageUrl?: string | null;
};

type PaymentReminderFlexInput = {
  trackingNumber?: string | null;
  amountBaht: string | number;
  payUrl: string;
};

type PaymentDueFlexInput = {
  parcelId: string;
  trackingNumber?: string | null;
  amountBaht: string | number;
  payUrl: string;
};

type PaymentQrFlexInput = {
  trackingNumber?: string | null;
  amountBaht: string | number;
  expiresInMinutes: number;
  qrCodeImageUrl?: string | null;
  payUrl?: string | null;
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

function formatBaht(v: string | number): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
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

  const footerButtons: Array<Record<string, unknown>> = [];
  if (input.trackingUrl?.trim()) {
    footerButtons.push({
      type: "button",
      style: "primary",
      color: "#2726F5",
      action: {
        type: "uri",
        label: "ติดตามพัสดุ",
        uri: input.trackingUrl.trim(),
      },
    });
  }
  if (input.labelPdfUrl?.trim()) {
    footerButtons.push({
      type: "button",
      style: "secondary",
      action: {
        type: "uri",
        label: "พิมพ์ใบปะหน้า",
        uri: input.labelPdfUrl.trim(),
      },
    });
  }

  if (footerButtons.length > 0) {
    contents.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: footerButtons,
      paddingAll: "16px",
    };
  }

  return {
    type: "flex",
    altText: `สร้างพัสดุสำเร็จ หมายเลข ${trackingNumber}`,
    contents,
  };
}

export function createPaymentDueFlexMessage(input: PaymentDueFlexInput): {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
} {
  const trackingNumber = textOrDash(input.trackingNumber);
  const amount = formatBaht(input.amountBaht);

  return {
    type: "flex",
    altText: `พัสดุ ${trackingNumber} มียอดชำระ ฿${amount}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "อัปเดตราคาจริงแล้ว",
            weight: "bold",
            size: "xl",
            color: "#111827",
          },
          {
            type: "text",
            text: "กรุณาชำระเงินเพื่อดำเนินการส่งพัสดุต่อ",
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
            layout: "baseline",
            margin: "md",
            contents: [
              {
                type: "text",
                text: "หมายเลขพัสดุ",
                size: "xs",
                color: "#6B7280",
                flex: 3,
              },
              {
                type: "text",
                text: trackingNumber,
                size: "sm",
                color: "#111827",
                weight: "bold",
                align: "end",
                flex: 5,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            contents: [
              {
                type: "text",
                text: "ยอดที่ต้องชำระ",
                size: "xs",
                color: "#6B7280",
                flex: 3,
              },
              {
                type: "text",
                text: `฿ ${amount}`,
                size: "lg",
                color: "#2726F5",
                weight: "bold",
                align: "end",
                flex: 5,
              },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#2726F5",
            action: {
              type: "uri",
              label: "ชำระเงิน",
              uri: input.payUrl,
            },
          },
        ],
      },
    },
  };
}

export function createPaymentQrFlexMessage(input: PaymentQrFlexInput): {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
} {
  const trackingNumber = textOrDash(input.trackingNumber);
  const amount = formatBaht(input.amountBaht);
  const mins = Math.max(1, Math.floor(input.expiresInMinutes));
  const contents: Record<string, unknown> = {
    type: "bubble",
    size: "mega",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      paddingAll: "16px",
      contents: [
        {
          type: "text",
          text: "พร้อมชำระด้วย PromptPay",
          weight: "bold",
          size: "lg",
          color: "#111827",
        },
        {
          type: "text",
          text: `กรุณาชำระภายใน ${mins} นาที`,
          size: "sm",
          color: "#6B7280",
          wrap: true,
        },
        ...(!input.qrCodeImageUrl?.trim()
          ? [
              {
                type: "box",
                layout: "vertical",
                margin: "md",
                backgroundColor: "#FEF3C7",
                cornerRadius: "8px",
                paddingAll: "10px",
                contents: [
                  {
                    type: "text",
                    text: "ไม่สามารถแสดงรูป QR ในข้อความนี้",
                    size: "xs",
                    color: "#92400E",
                    weight: "bold",
                    wrap: true,
                  },
                  {
                    type: "text",
                    text: "กรุณาเปิดหน้าชำระเงินในแอปเพื่อสแกน QR PromptPay",
                    size: "xs",
                    color: "#92400E",
                    wrap: true,
                    margin: "sm",
                  },
                ],
              },
            ]
          : []),
        {
          type: "separator",
          margin: "md",
        },
        {
          type: "box",
          layout: "baseline",
          margin: "md",
          contents: [
            { type: "text", text: "หมายเลขพัสดุ", size: "xs", color: "#6B7280", flex: 3 },
            {
              type: "text",
              text: trackingNumber,
              size: "sm",
              color: "#111827",
              weight: "bold",
              align: "end",
              flex: 5,
              wrap: true,
            },
          ],
        },
        {
          type: "box",
          layout: "baseline",
          contents: [
            { type: "text", text: "ยอดที่ต้องชำระ", size: "xs", color: "#6B7280", flex: 3 },
            {
              type: "text",
              text: `฿ ${amount}`,
              size: "lg",
              color: "#2726F5",
              weight: "bold",
              align: "end",
              flex: 5,
            },
          ],
        },
      ],
    },
  };

  if (input.qrCodeImageUrl?.trim()) {
    contents.hero = {
      type: "image",
      url: input.qrCodeImageUrl.trim(),
      size: "full",
      aspectRatio: "1:1",
      aspectMode: "fit",
    };
  }
  if (!input.qrCodeImageUrl?.trim() && input.payUrl?.trim()) {
    contents.footer = {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      paddingAll: "16px",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#2726F5",
          action: {
            type: "uri",
            label: "เปิดหน้าชำระเงิน",
            uri: input.payUrl.trim(),
          },
        },
      ],
    };
  }
  return {
    type: "flex",
    altText: `QR พร้อมชำระ ฿${amount} ภายใน ${mins} นาที`,
    contents,
  };
}

export function createPaymentSuccessFlexMessage(input: {
  trackingNumber?: string | null;
  amountBaht: string | number;
}): {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
} {
  const trackingNumber = textOrDash(input.trackingNumber);
  const amount = formatBaht(input.amountBaht);
  return {
    type: "flex",
    altText: `ชำระเงินสำเร็จ สำหรับพัสดุ ${trackingNumber}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "ชำระเงินสำเร็จ",
            weight: "bold",
            size: "xl",
            color: "#059669",
          },
          {
            type: "text",
            text: "ระบบได้รับการชำระเงินเรียบร้อยแล้ว",
            size: "sm",
            color: "#6B7280",
            wrap: true,
          },
          { type: "separator", margin: "md" },
          {
            type: "box",
            layout: "baseline",
            margin: "md",
            contents: [
              { type: "text", text: "หมายเลขพัสดุ", size: "xs", color: "#6B7280", flex: 3 },
              {
                type: "text",
                text: trackingNumber,
                size: "sm",
                color: "#111827",
                weight: "bold",
                align: "end",
                flex: 5,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "ยอดที่ชำระ", size: "xs", color: "#6B7280", flex: 3 },
              {
                type: "text",
                text: `฿ ${amount}`,
                size: "lg",
                color: "#111827",
                weight: "bold",
                align: "end",
                flex: 5,
              },
            ],
          },
        ],
      },
    },
  };
}

export function createBulkPaymentSuccessFlexMessage(input: {
  /** Thailand Post item barcode (13 chars, e.g. WB222126989TH) — not order/reference codes. */
  barcodes: string[];
  amountBaht: string | number;
}): {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
} {
  const codes = input.barcodes.map((code) => textOrDash(code)).filter((code) => code !== "-");
  const amount = formatBaht(input.amountBaht);
  const altCodes = codes.length > 0 ? codes.join(", ") : "-";

  const trackingRows =
    codes.length > 0
      ? codes.map((code, index) => ({
          type: "box" as const,
          layout: "baseline" as const,
          ...(index === 0 ? { margin: "md" as const } : {}),
          contents: [
            {
              type: "text" as const,
              text: index === 0 ? "หมายเลขพัสดุ" : " ",
              size: "xs" as const,
              color: "#6B7280",
              flex: 3,
            },
            {
              type: "text" as const,
              text: code,
              size: "sm" as const,
              color: "#111827",
              weight: "bold" as const,
              align: "end" as const,
              flex: 5,
              wrap: true,
            },
          ],
        }))
      : [
          {
            type: "box" as const,
            layout: "baseline" as const,
            margin: "md" as const,
            contents: [
              { type: "text" as const, text: "หมายเลขพัสดุ", size: "xs" as const, color: "#6B7280", flex: 3 },
              {
                type: "text" as const,
                text: "-",
                size: "sm" as const,
                color: "#111827",
                weight: "bold" as const,
                align: "end" as const,
                flex: 5,
                wrap: true,
              },
            ],
          },
        ];

  return {
    type: "flex",
    altText: `ชำระเงินสำเร็จ สำหรับพัสดุ ${altCodes}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "ชำระเงินสำเร็จ",
            weight: "bold",
            size: "xl",
            color: "#059669",
          },
          {
            type: "text",
            text: "ระบบได้รับการชำระเงินเรียบร้อยแล้ว",
            size: "sm",
            color: "#6B7280",
            wrap: true,
          },
          { type: "separator", margin: "md" },
          ...trackingRows,
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "ยอดที่ชำระ", size: "xs", color: "#6B7280", flex: 3 },
              {
                type: "text",
                text: `฿ ${amount}`,
                size: "lg",
                color: "#111827",
                weight: "bold",
                align: "end",
                flex: 5,
              },
            ],
          },
        ],
      },
    },
  };
}

type ParcelStatusUpdateFlexInput = {
  trackingNumber?: string | null;
  statusDescriptionTh: string;
  /** Terminal logistics outcome — drives success (green) vs failure (red) styling. */
  terminalStatus: "delivered" | "failed" | "canceled";
};

export function createParcelStatusUpdateFlexMessage(input: ParcelStatusUpdateFlexInput): {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
} {
  const trackingNumber = textOrDash(input.trackingNumber);
  const description = input.statusDescriptionTh?.trim() || "อัปเดตสถานะ";
  const statusColor = input.terminalStatus === "delivered" ? "#059669" : "#BE123C";

  const rows: Array<{ label: string; value: string }> = [
    { label: "หมายเลขพัสดุ", value: trackingNumber },
  ];

  return {
    type: "flex",
    altText: `อัปเดตสถานะพัสดุ ${trackingNumber}: ${description}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "อัปเดตสถานะพัสดุ",
            size: "sm",
            color: "#6B7280",
          },
          {
            type: "text",
            text: description,
            size: "lg",
            weight: "bold",
            color: statusColor,
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
      },
    },
  };
}

export function createPaymentFailedFlexMessage(input: {
  trackingNumber?: string | null;
  amountBaht: string | number;
  reason: "failed" | "expired" | "canceled";
}): {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
} {
  const trackingNumber = textOrDash(input.trackingNumber);
  const amount = formatBaht(input.amountBaht);
  const reasonText =
    input.reason === "expired"
      ? "หมดเวลาในการชำระเงิน"
      : input.reason === "canceled"
        ? "รายการชำระเงินถูกยกเลิก"
        : "การชำระเงินไม่สำเร็จ";

  return {
    type: "flex",
    altText: `${reasonText} สำหรับพัสดุ ${trackingNumber}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: reasonText,
            weight: "bold",
            size: "xl",
            color: "#BE123C",
          },
          {
            type: "text",
            text: "กรุณาเปิดหน้าชำระเงินอีกครั้งเพื่อสร้าง QR ใหม่",
            size: "sm",
            color: "#6B7280",
            wrap: true,
          },
          { type: "separator", margin: "md" },
          {
            type: "box",
            layout: "baseline",
            margin: "md",
            contents: [
              { type: "text", text: "หมายเลขพัสดุ", size: "xs", color: "#6B7280", flex: 3 },
              {
                type: "text",
                text: trackingNumber,
                size: "sm",
                color: "#111827",
                weight: "bold",
                align: "end",
                flex: 5,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "ยอดรายการเดิม", size: "xs", color: "#6B7280", flex: 3 },
              {
                type: "text",
                text: `฿ ${amount}`,
                size: "lg",
                color: "#111827",
                weight: "bold",
                align: "end",
                flex: 5,
              },
            ],
          },
        ],
      },
    },
  };
}

function createPaymentReminderFlexMessage(
  input: PaymentReminderFlexInput,
  bodyText: string,
): {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
} {
  const trackingNumber = textOrDash(input.trackingNumber);
  const amount = formatBaht(input.amountBaht);

  return {
    type: "flex",
    altText: `แจ้งเตือนค่าส่งพัสดุ ${trackingNumber}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "แจ้งเตือนค่าส่งพัสดุ",
            weight: "bold",
            size: "xl",
            color: "#111827",
          },
          {
            type: "text",
            text: bodyText,
            size: "sm",
            color: "#6B7280",
            wrap: true,
          },
          { type: "separator", margin: "md" },
          {
            type: "box",
            layout: "baseline",
            margin: "md",
            contents: [
              { type: "text", text: "หมายเลขพัสดุ", size: "xs", color: "#6B7280", flex: 3 },
              {
                type: "text",
                text: trackingNumber,
                size: "sm",
                color: "#111827",
                weight: "bold",
                align: "end",
                flex: 5,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "ยอดที่ต้องชำระ", size: "xs", color: "#6B7280", flex: 3 },
              {
                type: "text",
                text: `฿ ${amount}`,
                size: "lg",
                color: "#2726F5",
                weight: "bold",
                align: "end",
                flex: 5,
              },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#2726F5",
            action: { type: "uri", label: "ชำระเงิน", uri: input.payUrl },
          },
        ],
      },
    },
  };
}

/** Day 1 — gentle nudge: assumes good intent, no shame language. */
export function createPaymentReminderDay1FlexMessage(input: PaymentReminderFlexInput): {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
} {
  return createPaymentReminderFlexMessage(
    input,
    "พัสดุของคุณพร้อมชำระแล้ว ขออภัยหากชำระไปแล้ว",
  );
}

/** Day 2 — same layout as day 1; follow-up tone for outstanding balance. */
export function createPaymentReminderDay2FlexMessage(input: PaymentReminderFlexInput): {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
} {
  return createPaymentReminderFlexMessage(
    input,
    [
      "ขออนุญาตแจ้งเตือนอีกครั้ง พัสดุของคุณยังมียอดค้างชำระอยู่",
      "",
      "รบกวนตรวจสอบและชำระยอดค้างเมื่อสะดวก เพื่อให้รายการนี้เรียบร้อย",
      "",
      "ขออภัยหากชำระไปแล้ว",
    ].join("\n"),
  );
}

/** Day 7 — final notice before formal debt collection escalation. */
export function createPaymentReminderDay7FlexMessage(input: PaymentReminderFlexInput): {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
} {
  const trackingNumber = textOrDash(input.trackingNumber);
  const amount = formatBaht(input.amountBaht);

  return {
    type: "flex",
    altText: `แจ้งเตือนครั้งสุดท้าย พัสดุ ${trackingNumber}`,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "🚨 แจ้งเตือนครั้งสุดท้าย",
            weight: "bold",
            size: "xl",
            color: "#BE123C",
          },
          {
            type: "text",
            size: "sm",
            color: "#6B7280",
            wrap: true,
            contents: [
              {
                type: "span",
                text: "พัสดุนี้ค้างชำระครบ 7 วัน\n",
              },
              {
                type: "span",
                text: "กรุณาชำระภายใน ",
              },
              {
                type: "span",
                text: "24 ชั่วโมง",
                weight: "bold",
                color: "#6B7280",
              },
              {
                type: "span",
                text: " ก่อนรายการจะถูกส่งต่อเข้าสู่ขั้นตอนทวงถามหนี้ตามกฎหมาย",
              },
            ],
          },
          { type: "separator", margin: "md" },
          {
            type: "box",
            layout: "baseline",
            margin: "md",
            contents: [
              { type: "text", text: "หมายเลขพัสดุ", size: "xs", color: "#6B7280", flex: 3 },
              {
                type: "text",
                text: trackingNumber,
                size: "sm",
                color: "#111827",
                weight: "bold",
                align: "end",
                flex: 5,
                wrap: true,
              },
            ],
          },
          {
            type: "box",
            layout: "baseline",
            contents: [
              { type: "text", text: "ยอดที่ต้องชำระ", size: "xs", color: "#6B7280", flex: 3 },
              {
                type: "text",
                text: `฿ ${amount}`,
                size: "lg",
                color: "#BE123C",
                weight: "bold",
                align: "end",
                flex: 5,
              },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        paddingAll: "16px",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#BE123C",
            action: { type: "uri", label: "ชำระเงินวันนี้", uri: input.payUrl },
          },
        ],
      },
    },
  };
}

