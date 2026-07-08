"use client";

import type { SenderAddress } from "@quickload/shared/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { normalizeThaiPhone, isValidThaiPhone } from "@/lib/thai-phone";
import {
  buildAddressFormAfterSaveHref,
  buildAddressFormBackHref,
  isAddressFormFromAddresses,
} from "@/lib/address-form-return";
import { readAddressHandoff, saveAddressHandoff } from "@/lib/address-handoff-cache";
import { pickFreshAddressForSend } from "@/lib/send-address-loader";
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
  const backHref = buildAddressFormBackHref("sender", searchParams);
  const fromAddresses = isAddressFormFromAddresses(searchParams);

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

  const hydrateAddressForm = useCallback((d: SenderAddress) => {
    setName(d.contactName);
    setPhone(d.phone);
    setAddressLine(d.addressLine);
    setLocationSelected({
      tambon: d.tambon,
      amphoe: d.amphoe,
      province: d.province,
      zipcode: d.zipcode,
    });
    setLocationQuery(formatSelectedAddress({
      tambon: d.tambon,
      amphoe: d.amphoe,
      province: d.province,
      zipcode: d.zipcode,
    }));
    setPrimaryAccount(Boolean(d.isPrimary));
  }, []);

  useEffect(() => {
    if (!editId) {
      setLoadingRecord(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const cached = readAddressHandoff("sender", editId);
      if (cached) {
        hydrateAddressForm(cached);
        setLoadingRecord(false);
      }

      try {
        const res = await fetch(`/api/sender-addresses/${editId}`, { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/entry");
          return;
        }
        const json = (await res.json()) as { ok?: boolean; data?: SenderAddress; error?: string };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.data) {
          if (!cached) {
            setFormError(json.error ?? senderCopy.errLoad);
            setLoadingRecord(false);
          }
          return;
        }
        const freshAddress = pickFreshAddressForSend(cached, json.data);
        if (freshAddress) {
          hydrateAddressForm(freshAddress);
        }
        setLoadingRecord(false);
      } catch {
        if (!cancelled && !cached) {
          setFormError(senderCopy.errLoad);
          setLoadingRecord(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, hydrateAddressForm, router]);

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
    function onDocPointerDown(e: PointerEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setListOpen(false);
      }
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
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
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const submittedPrimaryAccount = formData.get("isPrimary") === "on";

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

    if (nextNameError || nextPhoneError || nextAddressError || nextLocationError) {
      const firstErrorId = nextNameError
        ? "sender-name"
        : nextPhoneError
          ? "sender-phone"
          : nextAddressError
            ? "sender-address"
            : "sender-location-search";
      setTimeout(() => {
        document.getElementById(firstErrorId)?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

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
      isPrimary: submittedPrimaryAccount,
    };

    try {
      const url = editId ? `/api/sender-addresses/${editId}` : "/api/sender-addresses";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; data?: SenderAddress; error?: string };
      if (res.status === 401) {
        router.replace("/entry");
        return;
      }
      if (!res.ok || !json.ok || !json.data?.id) {
        setFormError(json.error ?? senderCopy.errSave);
        return;
      }
      if (!fromAddresses) {
        saveAddressHandoff("sender", json.data);
      }
      const nextHref = buildAddressFormAfterSaveHref("sender", json.data.id, searchParams);
      window.location.replace(nextHref);
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
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2726F5] focus:ring-1 focus:ring-[#2726F5]";

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
            href={backHref}
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
            aria-label={fromAddresses ? "กลับไปสมุดที่อยู่" : "กลับไปหน้าลงทะเบียนพัสดุ"}
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
              onFocus={() => { if (!locationSelected) setListOpen(true); }}
              autoComplete="off"
              className={`${inputClass} ${locationSelected ? "border-emerald-500 focus:border-emerald-500 focus:ring-emerald-500" : ""}`}
              placeholder={senderCopy.placeholderLocation}
              disabled={saving}
              readOnly={Boolean(locationSelected)}
            />
            {locationSelected ? (
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden>
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 0 1 0 1.414l-8 8a1 1 0 0 1-1.414 0l-4-4a1 1 0 0 1 1.414-1.414L8 12.586l7.293-7.293a1 1 0 0 1 1.414 0Z" clipRule="evenodd" />
                  </svg>
                  เลือกแล้ว
                </span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => { setLocationSelected(null); setLocationQuery(""); setListOpen(false); setLocationError(null); }}
                  className="text-xs text-[#2726F5] underline underline-offset-2 disabled:opacity-50"
                >
                  เปลี่ยน
                </button>
              </div>
            ) : null}
            {locationError ? <p className="mt-1 text-sm text-red-600">{locationError}</p> : null}

            {listOpen && !locationSelected && (locationQuery.trim() || suggestLoading) ? (
              <div className="absolute z-30 mt-1 max-h-44 w-full touch-pan-y overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white py-1 shadow-lg [-webkit-overflow-scrolling:touch]">
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
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-slate-50 active:bg-slate-100"
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

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3">
            <input
              type="checkbox"
              name="isPrimary"
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
