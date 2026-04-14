"use client";

import { useEffect, useState } from "react";

type CurrentUser = {
  displayName: string | null;
  pictureUrl: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
};

export default function RegisterParcelPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [trackingId, setTrackingId] = useState("");
  const [destination, setDestination] = useState("");
  const [size, setSize] = useState("M");
  const [msg, setMsg] = useState<string | null>(null);
  const needsProfile = !currentUser?.firstName || !currentUser?.lastName || !currentUser?.phone;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/me");
      const json = (await res.json()) as { ok?: boolean; data?: CurrentUser; error?: string };
      if (cancelled) return;
      if (!res.ok || !json.ok || !json.data) {
        setMsg(json.error ?? "Failed to load profile");
        setLoadingUser(false);
        return;
      }
      setCurrentUser(json.data);
      setFirstName(json.data.firstName ?? "");
      setLastName(json.data.lastName ?? "");
      setPhone(json.data.phone ?? "");
      setLoadingUser(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSavingPhone(true);
    const res = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, phone }),
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (needsProfile) {
      setMsg("กรุณากรอกข้อมูลสมาชิกให้ครบก่อน");
      return;
    }
    setMsg(null);
    const res = await fetch("/api/parcels", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingId, destination, size }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setMsg(json.error ?? "Failed");
      return;
    }
    setMsg("Saved");
    setTrackingId("");
    setDestination("");
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-lg font-semibold">Register parcel</h1>
      {loadingUser ? (
        <p className="mt-2 text-sm text-slate-600">Loading profile…</p>
      ) : (
        <div className="mt-4 rounded border border-slate-200 bg-white p-4">
          <p className="mb-3 text-sm font-medium text-slate-800">ข้อมูลสมาชิก</p>
          <div className="mb-3 flex items-center gap-3">
            {currentUser?.pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- LINE profile image URL
              <img
                src={currentUser.pictureUrl}
                alt=""
                width={48}
                height={48}
                className="h-12 w-12 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-12 w-12 rounded-full bg-slate-200" />
            )}
            <div>
              <p className="text-sm font-medium text-slate-900">{currentUser?.displayName ?? "LINE user"}</p>
              <p className="text-xs text-slate-500">กรอกเบอร์โทรก่อนใช้งานครั้งแรก</p>
            </div>
          </div>
          <form onSubmit={onSaveProfile} className="space-y-2">
            <label className="block text-sm">
              First name
              <input
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              Last name
              <input
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </label>
            <label className="block text-sm">
              Phone number
              <input
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              disabled={savingPhone}
              className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              {savingPhone ? "Saving…" : "Save profile"}
            </button>
          </form>
        </div>
      )}
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        {needsProfile ? (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            กรุณาบันทึกข้อมูลสมาชิกให้ครบก่อนลงทะเบียนพัสดุ
          </p>
        ) : null}
        <label className="block text-sm">
          Tracking ID
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={trackingId}
            onChange={(e) => setTrackingId(e.target.value)}
            disabled={needsProfile}
            required
          />
        </label>
        <label className="block text-sm">
          Destination
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            disabled={needsProfile}
          />
        </label>
        <label className="block text-sm">
          Size
          <select
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            disabled={needsProfile}
          >
            {["S", "M", "L", "XL"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={needsProfile} className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60">
          Submit
        </button>
      </form>
      {msg && <p className="mt-3 text-sm text-slate-700">{msg}</p>}
    </main>
  );
}
