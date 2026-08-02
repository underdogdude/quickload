"use client";

import { navigateAfterAuth } from "@/lib/navigate-after-auth";
import { savePendingProfile } from "@/lib/pending-profile";
import { isValidThaiPhone, normalizeThaiPhone } from "@/lib/thai-phone";
import { BirthDateField } from "@/components/birth-date-field";
import { AppFooter } from "@/components/app-footer";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type CurrentUser = {
  displayName: string | null;
  pictureUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  birthDate: string | null;
};

const TITLE_FONT_CLASS = "font-title-placeholder";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function splitDisplayName(name: string | null | undefined): { firstName: string; lastName: string } {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return { firstName: "", lastName: "" };
  const idx = trimmed.indexOf(" ");
  if (idx === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1).trim() };
}

export type ProfileFormMode = "register" | "edit";

export function ProfileForm({ mode }: { mode: ProfileFormMode }) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"info" | "success" | "error">("info");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const normalizedPhone = useMemo(() => normalizeThaiPhone(phone), [phone]);
  const phoneNeedsVerification = useMemo(() => {
    const savedPhone = normalizeThaiPhone(currentUser?.phone ?? "");
    return normalizedPhone !== savedPhone;
  }, [currentUser?.phone, normalizedPhone]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const res = await fetch("/api/me", { signal: controller.signal });
        if (res.status === 401) {
          router.replace("/entry");
          return;
        }
        const text = await res.text();
        const json = text ? (JSON.parse(text) as { ok?: boolean; data?: CurrentUser; error?: string }) : {};
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.data) {
          setMsgTone("error");
          setMsg(json.error ?? "ไม่สามารถโหลดข้อมูลสมาชิกได้ กรุณาลองใหม่อีกครั้ง");
          return;
        }
        const data = json.data;
        setCurrentUser(data);
        const missingProfile = !data.firstName?.trim() || !data.lastName?.trim() || !data.phone?.trim();
        if (mode === "register" && !missingProfile) {
          router.replace("/profile");
          return;
        }

        let initialFirst = data.firstName ?? "";
        let initialLast = data.lastName ?? "";
        if (!initialFirst && !initialLast && data.displayName) {
          const split = splitDisplayName(data.displayName);
          initialFirst = split.firstName;
          initialLast = split.lastName;
        }
        setFirstName(initialFirst);
        setLastName(initialLast);
        setPhone(data.phone ?? "");
        setEmail(data.email ?? "");
        setBirthDate(data.birthDate ?? "");
      } catch (error) {
        if (cancelled) return;
        setMsgTone("error");
        if (error instanceof Error && error.name === "AbortError") {
          setMsg("โหลดข้อมูลนานเกินไป กรุณารีเฟรชอีกครั้ง");
          return;
        }
        setMsg("ไม่สามารถโหลดข้อมูลสมาชิกได้ในตอนนี้");
      } finally {
        clearTimeout(timer);
        if (!cancelled) setLoadingUser(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, router]);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setMsgTone("info");

    const nextPhoneError =
      normalizedPhone && !isValidThaiPhone(normalizedPhone)
        ? "กรุณากรอกเบอร์โทรให้ถูกต้อง เช่น 0812345678"
        : null;
    const nextEmailError =
      email && !EMAIL_REGEX.test(email) ? "กรุณากรอกอีเมลให้ถูกต้อง" : null;
    setPhoneError(nextPhoneError);
    setEmailError(nextEmailError);
    if (nextPhoneError) {
      setMsgTone("error");
      setMsg(nextPhoneError);
      return;
    }
    if (nextEmailError) {
      setMsgTone("error");
      setMsg(nextEmailError);
      return;
    }

    setSaving(true);
    try {
      if (phoneNeedsVerification) {
        savePendingProfile({
          firstName,
          lastName,
          phone: normalizedPhone,
          email,
          birthDate,
        });
        const verifyPath =
          mode === "register" ? "/register/verify-phone" : "/profile/edit/verify-phone";
        router.push(`${verifyPath}?phone=${encodeURIComponent(normalizedPhone)}`);
        return;
      }

      const res = await fetch("/api/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, phone: normalizedPhone, email, birthDate }),
      });
      const json = (await res.json()) as { ok?: boolean; data?: CurrentUser; error?: string };
      if (!res.ok || !json.ok || !json.data) {
        setMsgTone("error");
        setMsg(json.error ?? "บันทึกข้อมูลสมาชิกไม่สำเร็จ");
        return;
      }
      setCurrentUser(json.data);
      setMsgTone("success");
      setMsg(
        mode === "register"
          ? "ยินดีต้อนรับ! กำลังพาไปหน้าหลัก…"
          : "บันทึกข้อมูลสมาชิกแล้ว กำลังกลับไปหน้าโปรไฟล์…",
      );

      // Hard redirect so middleware sees the updated session cookie in LINE WebView.
      setTimeout(() => {
        navigateAfterAuth(router, mode === "register" ? "/" : "/profile", { hard: true });
      }, 700);
    } catch {
      setMsgTone("error");
      setMsg("บันทึกข้อมูลสมาชิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  const greeting = mode === "register" ? "ยินดีต้อนรับ" : "แก้ไขข้อมูล";
  const subtitle = mode === "register"
    ? "กรอกข้อมูลสมาชิกเพื่อเริ่มใช้งาน Quickload"
    : "อัปเดตข้อมูลส่วนตัวและช่องทางติดต่อ";
  const msgToneClass =
    msgTone === "success"
      ? "text-emerald-700"
      : msgTone === "error"
      ? "text-red-600"
      : "text-slate-700";

  return (
    <main className="min-h-screen bg-slate-100">
      <section className="bg-[#0802b8] px-6 pb-20 pt-12 text-white">
        <div className="mx-auto flex w-full max-w-lg items-end justify-between">
          <div>
            <h1 className={`${TITLE_FONT_CLASS} text-4xl font-bold leading-tight`}>{greeting}</h1>
            <p className="mt-2 text-lg text-white/80">{subtitle}</p>
          </div>
          {currentUser?.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- LINE profile image URL
            <img
              src={currentUser.pictureUrl}
              alt=""
              width={64}
              height={64}
              className="h-16 w-16 rounded-full border-2 border-white/30 object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="h-16 w-16 rounded-full bg-white/25" />
          )}
        </div>
      </section>

      <section className="-mt-12 px-6 pb-10">
        <div className="mx-auto w-full max-w-lg rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {loadingUser ? (
            <p className="text-sm text-slate-600">กำลังโหลดข้อมูล…</p>
          ) : (
            <>
              <p className="mb-4 text-sm font-medium text-slate-800">ข้อมูลสมาชิก</p>
              <div className="mb-4">
                <p className="text-xs text-slate-500">
                  {mode === "register"
                    ? "กรอกข้อมูลให้ครบถ้วนเพื่อเริ่มใช้งานครั้งแรก"
                    : "ข้อมูลนี้ใช้สำหรับการจัดส่งและการติดต่อเรื่องพัสดุ"}
                </p>
              </div>

              <form onSubmit={onSaveProfile} className="space-y-3">
                <label className="block text-sm text-slate-700">
                  ชื่อ
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-[#0802b8]"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="เช่น สมชาย"
                    autoComplete="given-name"
                    required
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  นามสกุล
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-[#0802b8]"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="เช่น ใจดี"
                    autoComplete="family-name"
                    required
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  เบอร์โทรศัพท์
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-[#0802b8]"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (phoneError) setPhoneError(null);
                    }}
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="เช่น 0812345678"
                    required
                  />
                  {phoneNeedsVerification && normalizedPhone ? (
                    <p className="mt-1 text-xs text-slate-500">
                      เปลี่ยนเบอร์โทรจะต้องยืนยันด้วยรหัส OTP ทาง SMS
                    </p>
                  ) : null}
                  {phoneError ? <p className="mt-1 text-xs text-red-600">{phoneError}</p> : null}
                </label>
                <label className="block text-sm text-slate-700">
                  อีเมล
                  <input
                    type="email"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-[#0802b8]"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    autoComplete="email"
                    placeholder="name@example.com"
                  />
                  {emailError ? <p className="mt-1 text-xs text-red-600">{emailError}</p> : null}
                </label>
                <div className="block text-sm text-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <span>วันเกิด</span>
                  </div>
                  <BirthDateField value={birthDate} onChange={setBirthDate} />
                </div>

                <div className="flex gap-2 pt-2">
                  {mode === "edit" ? (
                    <button
                      type="button"
                      onClick={() => router.replace("/profile")}
                      className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      ไปหน้าหลัก
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 rounded-lg bg-[#0802b8] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {saving ? "กำลังบันทึก…" : mode === "register" ? "เริ่มใช้งาน" : "บันทึกข้อมูล"}
                  </button>
                </div>
              </form>
            </>
          )}

          {msg ? <p className={`mt-4 text-sm ${msgToneClass}`}>{msg}</p> : null}
        </div>

        <AppFooter />
      </section>
    </main>
  );
}
