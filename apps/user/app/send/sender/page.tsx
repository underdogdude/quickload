"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { normalizeThaiPhone, isValidThaiPhone } from "@/lib/thai-phone";
import { senderCopy } from "./strings";

type ThaiAddressRow = {
  tambon: string;
  amphoe: string;
  province: string;
  zipcode: string;
};

function formatSelectedAddress(row: ThaiAddressRow) {
  return `${row.tambon}, ${row.amphoe}, ${row.province}, ${row.zipcode}`;
}

function SenderFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSelected, setLocationSelected] = useState<ThaiAddressRow | null>(null);
  const [primaryAccount, setPrimaryAccount] = useState(false);

  const [suggestions, setSuggestions] = useState<ThaiAddressRow[]>([]);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);

  const comboRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const normalizedPhone = normalizeThaiPhone(phone);

  useEffect(() => {
    if (!editId) {
      setLoadingRecord(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/sender-addresses/${editId}`);
      if (res.status === 401) {
        router.replace("/entry");
        return;
      }
      const json = (await res.json()) as { ok?: boolean; data?: Record<string, unknown>; error?: string };
      if (cancelled) return;
      if (!res.ok || !json.ok || !json.data) {
        setFormError(json.error ?? senderCopy.errLoad);
        setLoadingRecord(false);
        return;
      }
      const d = json.data;
      setName(String(d.contactName ?? ""));
      setPhone(String(d.phone ?? ""));
      setAddressLine(String(d.addressLine ?? ""));
      setLocationSelected({
        tambon: String(d.tambon ?? ""),
        amphoe: String(d.amphoe ?? ""),
        province: String(d.province ?? ""),
        zipcode: String(d.zipcode ?? ""),
      });
      setLocationQuery(formatSelectedAddress({
        tambon: String(d.tambon ?? ""),
        amphoe: String(d.amphoe ?? ""),
        province: String(d.province ?? ""),
        zipcode: String(d.zipcode ?? ""),
      }));
      setPrimaryAccount(Boolean(d.isPrimary));
      setLoadingRecord(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, router]);

  const fetchSuggestions = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }
    setSuggestLoading(true);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(`/api/thai-address?q=${encodeURIComponent(trimmed)}&limit=30`, {
        signal: controller.signal,
      });
      const json = (await res.json()) as { ok?: boolean; data?: ThaiAddressRow[] };
      if (!res.ok || !json.ok || !Array.isArray(json.data)) {
        setSuggestions([]);
        return;
      }
      setSuggestions(json.data);
    } catch {
      setSuggestions([]);
    } finally {
      clearTimeout(t);
      setSuggestLoading(false);
    }
  }, []);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setListOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    if (!listOpen || locationSelected) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchSuggestions(locationQuery);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [locationQuery, listOpen, locationSelected, fetchSuggestions]);

  function onLocationChange(value: string) {
    setLocationQuery(value);
    setLocationSelected(null);
    setLocationError(null);
    setListOpen(true);
  }

  function onPickLocation(row: ThaiAddressRow) {
    setLocationSelected(row);
    setLocationQuery(formatSelectedAddress(row));
    setSuggestions([]);
    setListOpen(false);
    setLocationError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setMsgClear();

    const nextNameError = !name.trim() ? senderCopy.errName : null;
    const nextPhoneError = !normalizedPhone
      ? senderCopy.errPhoneRequired
      : /^(?:\+66|66)/.test(phone.trim())
        ? senderCopy.errPhoneFormat
        : !isValidThaiPhone(phone)
          ? senderCopy.errPhoneFormat
          : null;
    const nextAddressError = !addressLine.trim() ? senderCopy.errAddress : null;
    const nextLocationError = !locationSelected ? senderCopy.errLocation : null;

    setNameError(nextNameError);
    setPhoneError(nextPhoneError);
    setAddressError(nextAddressError);
    setLocationError(nextLocationError);

    if (nextNameError || nextPhoneError || nextAddressError || nextLocationError) return;

    const loc = locationSelected;
    if (!loc) return;

    setSaving(true);
    const payload = {
      contactName: name.trim(),
      phone: normalizedPhone,
      addressLine: addressLine.trim(),
      tambon: loc.tambon,
      amphoe: loc.amphoe,
      province: loc.province,
      zipcode: loc.zipcode,
      isPrimary: primaryAccount,
    };

    try {
      const url = editId ? `/api/sender-addresses/${editId}` : "/api/sender-addresses";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; data?: { id?: string }; error?: string };
      if (res.status === 401) {
        router.replace("/entry");
        return;
      }
      if (!res.ok || !json.ok || !json.data?.id) {
        setFormError(json.error ?? senderCopy.errSave);
        return;
      }
      router.replace(`/send?senderSaved=1&senderId=${encodeURIComponent(json.data.id)}&step=recipient`);
      router.refresh();
    } catch {
      setFormError(senderCopy.errSave);
    } finally {
      setSaving(false);
    }
  }

  function setMsgClear() {
    setNameError(null);
    setPhoneError(null);
    setAddressError(null);
    setLocationError(null);
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2726F5] focus:ring-1 focus:ring-[#2726F5]";

  const title = editId ? senderCopy.titleEdit : senderCopy.title;

  if (loadingRecord) {
    return (
      <main className="min-h-screen bg-slate-100 pb-8">
        <section className="bg-[#2726F5] px-6 pb-16 pt-10 text-white">
          <div className="mx-auto w-full max-w-lg">
            <h1 className="text-3xl font-bold">{title}</h1>
          </div>
        </section>
        <section className="-mt-8 px-6">
          <p className="mx-auto max-w-lg rounded-lg bg-white p-5 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">{senderCopy.loadingForm}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-8">
      <section className="bg-[#2726F5] px-6 pb-20 pt-8 text-white">
        <div className="mx-auto w-full max-w-lg">
          <Link
            href="/send"
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
            aria-label="กลับไปหน้าลงทะเบียนพัสดุ"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </Link>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-0 text-base text-white/80">{senderCopy.subtitle}</p>
        </div>
      </section>

      <section className="-mt-12 px-6">
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mx-auto w-full max-w-lg space-y-4 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200"
        >
          {formError ? <p className="text-sm font-medium text-red-600">{formError}</p> : null}

          <div>
            <label htmlFor="sender-name" className="text-sm font-semibold text-slate-800">
              {senderCopy.labelName}
            </label>
            <input
              id="sender-name"
              name="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              autoComplete="name"
              className={inputClass}
              placeholder={senderCopy.placeholderName}
              disabled={saving}
            />
            {nameError ? <p className="mt-1 text-sm text-red-600">{nameError}</p> : null}
          </div>

          <div>
            <label htmlFor="sender-phone" className="text-sm font-semibold text-slate-800">
              {senderCopy.labelPhone}
            </label>
            <input
              id="sender-phone"
              name="phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneError(null);
              }}
              autoComplete="tel"
              className={inputClass}
              placeholder={senderCopy.placeholderPhone}
              disabled={saving}
            />
            {phoneError ? <p className="mt-1 text-sm text-red-600">{phoneError}</p> : null}
          </div>

          <div>
            <label htmlFor="sender-address" className="text-sm font-semibold text-slate-800">
              {senderCopy.labelAddress}
            </label>
            <textarea
              id="sender-address"
              name="address"
              rows={3}
              value={addressLine}
              onChange={(e) => {
                setAddressLine(e.target.value);
                setAddressError(null);
              }}
              className={`${inputClass} resize-y`}
              placeholder={senderCopy.placeholderAddress}
              disabled={saving}
            />
            {addressError ? <p className="mt-1 text-sm text-red-600">{addressError}</p> : null}
          </div>

          <div ref={comboRef} className="relative">
            <label htmlFor="sender-location-search" className="text-sm font-semibold text-slate-800">
              {senderCopy.labelLocation}
            </label>
            <p className="mt-0.5 text-xs text-slate-500">{senderCopy.hintLocation}</p>
            <input
              id="sender-location-search"
              name="location"
              value={locationQuery}
              onChange={(e) => onLocationChange(e.target.value)}
              onFocus={() => setListOpen(true)}
              autoComplete="off"
              className={inputClass}
              placeholder={senderCopy.placeholderLocation}
              disabled={saving}
            />
            {locationError ? <p className="mt-1 text-sm text-red-600">{locationError}</p> : null}

            {listOpen && !locationSelected && (locationQuery.trim() || suggestLoading) ? (
              <div className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                {suggestLoading && suggestions.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-500">{senderCopy.searching}</p>
                ) : null}
                {!suggestLoading && suggestions.length === 0 && locationQuery.trim() ? (
                  <p className="px-3 py-2 text-sm text-slate-500">{senderCopy.noResults}</p>
                ) : null}
                {suggestions.map((row) => (
                  <button
                    key={`${row.tambon}|${row.amphoe}|${row.province}|${row.zipcode}`}
                    type="button"
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-50"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onPickLocation(row)}
                  >
                    <span className="text-sm font-medium text-slate-900">
                      {row.tambon}, {row.amphoe}, {row.province}, {row.zipcode}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3">
            <input
              type="checkbox"
              checked={primaryAccount}
              onChange={(e) => setPrimaryAccount(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300 text-[#2726F5] focus:ring-[#2726F5]"
              disabled={saving}
            />
            <span className="text-sm font-medium text-slate-800">{senderCopy.checkboxPrimary}</span>
          </label>

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center rounded-full bg-[#2726F5] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f1ed0] disabled:opacity-60 sm:flex-none"
            >
              {saving ? senderCopy.saving : senderCopy.save}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default function SenderInfoPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-6">
          <p className="text-sm text-slate-600">{senderCopy.loadingForm}</p>
        </main>
      }
    >
      <SenderFormInner />
    </Suspense>
  );
}
