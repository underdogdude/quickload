"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
const PHONE_REGEX = /^(\+66|0)\d{8,9}$/;

export default function RegisterPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const needsProfile = !currentUser?.firstName || !currentUser?.lastName || !currentUser?.phone;
  const normalizedPhone = phone.replace(/[\s-]/g, "");

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
          setMsg(json.error ?? "Failed to load profile");
          return;
        }
        setCurrentUser(json.data);
        setFirstName(json.data.firstName ?? "");
        setLastName(json.data.lastName ?? "");
        setPhone(json.data.phone ?? "");
        setEmail(json.data.email ?? "");
        setBirthDate(json.data.birthDate ?? "");
      } catch (error) {
        if (cancelled) return;
        if (error instanceof Error && error.name === "AbortError") {
          setMsg("Loading profile timed out. Please refresh again.");
          return;
        }
        setMsg("Unable to load profile right now.");
      } finally {
        clearTimeout(timer);
        if (!cancelled) setLoadingUser(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const nextPhoneError = normalizedPhone && !PHONE_REGEX.test(normalizedPhone) ? "Please enter a valid phone number." : null;
    const nextEmailError = email && !EMAIL_REGEX.test(email) ? "Please enter a valid email address." : null;
    setPhoneError(nextPhoneError);
    setEmailError(nextEmailError);
    if (nextPhoneError) {
      setMsg(nextPhoneError);
      return;
    }
    if (nextEmailError) {
      setMsg(nextEmailError);
      return;
    }
    setSavingPhone(true);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, phone: normalizedPhone, email, birthDate }),
    });
    const json = (await res.json()) as { ok?: boolean; data?: CurrentUser; error?: string };
    setSavingPhone(false);
    if (!res.ok || !json.ok || !json.data) {
      setMsg(json.error ?? "Failed to save profile");
      return;
    }
    setCurrentUser(json.data);
    setMsg("บันทึกข้อมูลสมาชิกแล้ว");
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <section className="bg-[#2726F5] px-6 pb-20 pt-12 text-white">
        <div className="mx-auto flex w-full max-w-lg items-end justify-between">
          <div>
            <h1 className={`${TITLE_FONT_CLASS} text-4xl font-bold leading-tight`}>ลงทะเบียนพัสดุ</h1>
            <p className="mt-2 text-lg text-white/80">กรอกข้อมูลพัสดุของคุณ</p>
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
        <div className="mx-auto w-full max-w-lg rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {loadingUser ? (
            <p className="text-sm text-slate-600">Loading profile…</p>
          ) : (
            <>
              <p className="mb-4 text-sm font-medium text-slate-800">ข้อมูลสมาชิก</p>
              <div className="mb-4">
                <p className="text-sm font-semibold text-slate-900">{currentUser?.displayName ?? "LINE user"}</p>
                <p className="text-xs text-slate-500">กรอกข้อมูลสมาชิกให้ครบก่อนใช้งานครั้งแรก</p>
              </div>

              <form onSubmit={onSaveProfile} className="space-y-3">
                <label className="block text-sm text-slate-700">
                  First name
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-[#2726F5]"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  Last name
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-[#2726F5]"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </label>
                <label className="block text-sm text-slate-700">
                  Phone number
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-[#2726F5]"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (phoneError) setPhoneError(null);
                    }}
                    inputMode="tel"
                    autoComplete="tel"
                    pattern="^(\+66|0)\d{8,9}$"
                    required
                  />
                  {phoneError ? <p className="mt-1 text-xs text-red-600">{phoneError}</p> : null}
                </label>
                <label className="block text-sm text-slate-700">
                  Email
                  <input
                    type="email"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-[#2726F5]"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    autoComplete="email"
                    required
                  />
                  {emailError ? <p className="mt-1 text-xs text-red-600">{emailError}</p> : null}
                </label>
                <label className="block text-sm text-slate-700">
                  Birthdate
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 outline-none transition focus:border-[#2726F5]"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    required
                  />
                </label>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={savingPhone}
                    className="rounded-xl bg-[#2726F5] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {savingPhone ? "Saving…" : "Save profile"}
                  </button>
                  {!needsProfile ? (
                    <button
                      type="button"
                      onClick={() => router.replace("/")}
                      className="ml-2 rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      ไปหน้าหลัก
                    </button>
                  ) : null}
                </div>
              </form>
            </>
          )}

          {msg ? <p className="mt-4 text-sm text-slate-700">{msg}</p> : null}
        </div>
      </section>
    </main>
  );
}
