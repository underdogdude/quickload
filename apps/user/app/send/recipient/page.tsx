"use client";

import type { RecipientAddress } from "@quickload/shared/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import {
  formatThaiLocation,
  ThaiLocationCombobox,
  type ThaiLocationRow,
} from "@/components/thai-location-combobox";
import { normalizeThaiPhone, isValidThaiPhone } from "@/lib/thai-phone";
import {
  buildAddressFormAfterSaveHref,
  buildAddressFormBackHref,
  isAddressFormFromAddresses,
} from "@/lib/address-form-return";
import { readAddressHandoff, saveAddressHandoff } from "@/lib/address-handoff-cache";
import { pickFreshAddressForSend } from "@/lib/send-address-loader";
import { recipientCopy } from "./strings";

function RecipientFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");
  const backHref = buildAddressFormBackHref("recipient", searchParams);
  const fromAddresses = isAddressFormFromAddresses(searchParams);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine, setAddressLine] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [locationSelected, setLocationSelected] = useState<ThaiLocationRow | null>(null);

  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);

  const normalizedPhone = normalizeThaiPhone(phone);

  const hydrateAddressForm = useCallback((d: RecipientAddress) => {
    setName(d.contactName);
    setPhone(d.phone);
    setAddressLine(d.addressLine);
    setLocationSelected({
      tambon: d.tambon,
      amphoe: d.amphoe,
      province: d.province,
      zipcode: d.zipcode,
    });
    setLocationQuery(
      formatThaiLocation({
        tambon: d.tambon,
        amphoe: d.amphoe,
        province: d.province,
        zipcode: d.zipcode,
      }),
    );
  }, []);

  useEffect(() => {
    if (!editId) {
      setLoadingRecord(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const cached = readAddressHandoff("recipient", editId);
      if (cached) {
        hydrateAddressForm(cached);
        setLoadingRecord(false);
      }

      try {
        const res = await fetch(`/api/recipient-addresses/${editId}`, { cache: "no-store" });
        if (res.status === 401) {
          router.replace("/entry");
          return;
        }
        const json = (await res.json()) as { ok?: boolean; data?: RecipientAddress; error?: string };
        if (cancelled) return;
        if (!res.ok || !json.ok || !json.data) {
          if (!cached) {
            setFormError(json.error ?? recipientCopy.errLoad);
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
          setFormError(recipientCopy.errLoad);
          setLoadingRecord(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, hydrateAddressForm, router]);

  function onLocationChange(value: string) {
    setLocationQuery(value);
    setLocationSelected(null);
    setLocationError(null);
  }

  function onPickLocation(row: ThaiLocationRow) {
    setLocationSelected(row);
    setLocationQuery(formatThaiLocation(row));
    setLocationError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setNameError(null);
    setPhoneError(null);
    setAddressError(null);
    setLocationError(null);

    const nextNameError = !name.trim() ? recipientCopy.errName : null;
    const nextPhoneError = !normalizedPhone
      ? recipientCopy.errPhoneRequired
      : /^(?:\+66|66)/.test(phone.trim())
        ? recipientCopy.errPhoneFormat
        : !isValidThaiPhone(phone)
          ? recipientCopy.errPhoneFormat
          : null;
    const nextAddressError = !addressLine.trim() ? recipientCopy.errAddress : null;
    const nextLocationError = !locationSelected ? recipientCopy.errLocation : null;

    setNameError(nextNameError);
    setPhoneError(nextPhoneError);
    setAddressError(nextAddressError);
    setLocationError(nextLocationError);

    if (nextNameError || nextPhoneError || nextAddressError || nextLocationError) {
      const firstErrorId = nextNameError
        ? "recipient-name"
        : nextPhoneError
          ? "recipient-phone"
          : nextAddressError
            ? "recipient-address"
            : "recipient-location-search";
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
      isPrimary: false,
    };

    try {
      const url = editId ? `/api/recipient-addresses/${editId}` : "/api/recipient-addresses";
      const method = editId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as { ok?: boolean; data?: RecipientAddress; error?: string };
      if (res.status === 401) {
        router.replace("/entry");
        return;
      }
      if (!res.ok || !json.ok || !json.data?.id) {
        setFormError(json.error ?? recipientCopy.errSave);
        return;
      }
      if (!fromAddresses) {
        saveAddressHandoff("recipient", json.data);
      }
      const nextHref = buildAddressFormAfterSaveHref("recipient", json.data.id, searchParams);
      window.location.replace(nextHref);
    } catch {
      setFormError(recipientCopy.errSave);
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#2726F5] focus:ring-1 focus:ring-[#2726F5]";
  const title = editId ? recipientCopy.titleEdit : recipientCopy.title;

  if (loadingRecord) {
    return (
      <main className="min-h-screen bg-slate-100 pb-8">
        <section className="bg-[#2726F5] px-6 pb-16 pt-10 text-white">
          <div className="mx-auto w-full max-w-lg">
            <h1 className="text-3xl font-bold">{title}</h1>
          </div>
        </section>
        <section className="-mt-8 px-6">
          <p className="mx-auto max-w-lg rounded-lg bg-white p-5 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">{recipientCopy.loadingForm}</p>
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
          <p className="mt-0 text-base text-white/80">{recipientCopy.subtitle}</p>
        </div>
      </section>

      <section className="-mt-12 px-6">
        <form
          onSubmit={(e) => void onSubmit(e)}
          className="mx-auto w-full max-w-lg space-y-4 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200"
        >
          {formError ? <p className="text-sm font-medium text-red-600">{formError}</p> : null}

          <div>
            <label htmlFor="recipient-name" className="text-sm font-semibold text-slate-800">
              {recipientCopy.labelName}
            </label>
            <input
              id="recipient-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
              autoComplete="name"
              className={inputClass}
              placeholder={recipientCopy.placeholderName}
              disabled={saving}
            />
            {nameError ? <p className="mt-1 text-sm text-red-600">{nameError}</p> : null}
          </div>

          <div>
            <label htmlFor="recipient-phone" className="text-sm font-semibold text-slate-800">
              {recipientCopy.labelPhone}
            </label>
            <input
              id="recipient-phone"
              inputMode="tel"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneError(null);
              }}
              autoComplete="tel"
              className={inputClass}
              placeholder={recipientCopy.placeholderPhone}
              disabled={saving}
            />
            {phoneError ? <p className="mt-1 text-sm text-red-600">{phoneError}</p> : null}
          </div>

          <div>
            <label htmlFor="recipient-address" className="text-sm font-semibold text-slate-800">
              {recipientCopy.labelAddress}
            </label>
            <textarea
              id="recipient-address"
              rows={3}
              value={addressLine}
              onChange={(e) => {
                setAddressLine(e.target.value);
                setAddressError(null);
              }}
              className={`${inputClass} resize-y`}
              placeholder={recipientCopy.placeholderAddress}
              disabled={saving}
            />
            {addressError ? <p className="mt-1 text-sm text-red-600">{addressError}</p> : null}
          </div>

          <ThaiLocationCombobox
            id="recipient-location-search"
            label={recipientCopy.labelLocation}
            hint={recipientCopy.hintLocation}
            placeholder={recipientCopy.placeholderLocation}
            query={locationQuery}
            selected={locationSelected}
            onQueryChange={onLocationChange}
            onSelect={onPickLocation}
            onClear={() => {
              setLocationSelected(null);
              setLocationQuery("");
              setLocationError(null);
            }}
            copy={{ searching: recipientCopy.searching, noResults: recipientCopy.noResults }}
            disabled={saving}
            error={locationError}
            inputClassName={inputClass}
          />

          <div className="flex flex-wrap gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center rounded-full bg-[#2726F5] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f1ed0] disabled:opacity-60 sm:flex-none"
            >
              {saving ? recipientCopy.saving : recipientCopy.save}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

export default function RecipientInfoPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-100 p-6">
          <p className="text-sm text-slate-600">{recipientCopy.loadingForm}</p>
        </main>
      }
    >
      <RecipientFormInner />
    </Suspense>
  );
}
