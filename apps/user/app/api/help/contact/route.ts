import nodemailer from "nodemailer";
import { NextResponse } from "next/server";

type ContactBody = {
  name?: string;
  email?: string;
  phone?: string;
  topic?: string;
  message?: string;
};

const TO_EMAIL = "pusitkttrnr@gmail.com";
const FROM_EMAIL = "support@quickload.com";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ContactBody;
    const name = body.name?.trim() ?? "";
    const email = body.email?.trim() ?? "";
    const phone = body.phone?.trim() ?? "";
    const topic = body.topic?.trim() ?? "";
    const message = body.message?.trim() ?? "";

    if (!name || !email || !topic || !message) {
      return NextResponse.json({ ok: false, error: "กรุณากรอกข้อมูลให้ครบถ้วน" }, { status: 400 });
    }

    const smtpHost = requiredEnv("SMTP_HOST");
    const smtpPort = Number(requiredEnv("SMTP_PORT"));
    const smtpUser = requiredEnv("SMTP_USER");
    const smtpPass = requiredEnv("SMTP_PASS");
    const smtpSecure = (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true";

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: TO_EMAIL,
      replyTo: email,
      subject: `[Quickload Help] ${topic}`,
      text: [
        "Quickload Help Contact Form",
        "",
        `ชื่อ: ${name}`,
        `อีเมล: ${email}`,
        `เบอร์โทร: ${phone || "-"}`,
        `หัวข้อ: ${topic}`,
        "",
        "รายละเอียด:",
        message,
      ].join("\n"),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Internal error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
