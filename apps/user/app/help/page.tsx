"use client";

import Link from "next/link";
import { useState } from "react";

type SubmitState = "idle" | "submitting" | "success" | "error";

export default function HelpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setError(null);
    try {
      const res = await fetch("/api/help/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone, topic, message }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setState("error");
        setError(json.error ?? "ส่งข้อมูลไม่สำเร็จ");
        return;
      }
      setState("success");
      setName("");
      setEmail("");
      setPhone("");
      setTopic("");
      setMessage("");
    } catch {
      setState("error");
      setError("ส่งข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2726F5] focus:ring-1 focus:ring-[#2726F5]";

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
            aria-label="กลับไปหน้าแรก"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </Link>
          <h1 className="text-3xl font-bold leading-none">Quickload Help</h1>
          <p className="mt-1 text-sm text-white/80">ติดต่อทีมงาน Quickload ได้ผ่านแบบฟอร์มด้านล่าง</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-3">
          <article className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <p className="text-sm font-semibold text-slate-900">ช่องทางติดต่อ</p>
            <p className="mt-2 text-sm text-slate-700">support@quickload.com</p>
            <p className="text-sm text-slate-700">support@getsmartpost.com</p>
          </article>

          <form onSubmit={(e) => void onSubmit(e)} className="space-y-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div>
              <label htmlFor="help-name" className="text-sm font-medium text-slate-800">
                ชื่อ-นามสกุล
              </label>
              <input
                id="help-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="กรอกชื่อของคุณ"
                required
              />
            </div>
            <div>
              <label htmlFor="help-email" className="text-sm font-medium text-slate-800">
                อีเมล
              </label>
              <input
                id="help-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="name@example.com"
                required
              />
            </div>
            <div>
              <label htmlFor="help-phone" className="text-sm font-medium text-slate-800">
                เบอร์โทรศัพท์
              </label>
              <input
                id="help-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="เช่น 0852990414"
              />
            </div>
            <div>
              <label htmlFor="help-topic" className="text-sm font-medium text-slate-800">
                หัวข้อ
              </label>
              <input
                id="help-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className={inputClass}
                placeholder="แจ้งปัญหาที่ต้องการความช่วยเหลือ"
                required
              />
            </div>
            <div>
              <label htmlFor="help-message" className="text-sm font-medium text-slate-800">
                รายละเอียด
              </label>
              <textarea
                id="help-message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={`${inputClass} resize-y`}
                placeholder="อธิบายปัญหาโดยละเอียด"
                required
              />
            </div>

            {state === "success" ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                ส่งข้อมูลเรียบร้อยแล้ว ทีมงานจะติดต่อกลับโดยเร็วที่สุด
              </p>
            ) : null}
            {state === "error" && error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">{error}</p>
            ) : null}

            <button
              type="submit"
              disabled={state === "submitting"}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#2726F5] px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {state === "submitting" ? "กำลังส่ง..." : "ส่งข้อมูล"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
