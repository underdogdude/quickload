"use client";

import { MAX_PARCEL_NOTE_LENGTH, sanitizeParcelNote } from "@quickload/shared/parcel-note";
import type { RecipientAddress, SenderAddress } from "@quickload/shared/types";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatThaiLocation,
  ThaiLocationCombobox,
  type ThaiLocationRow,
} from "@/components/thai-location-combobox";
import { readApiJson } from "@/lib/api-json";
import {
  createParcelOrder,
  createParcelOrderAttemptId,
  type CreatedParcel,
  type ParcelOrderProgress,
} from "@/lib/parcel-order-client";
import {
  validateParcelDimensionsFromStrings,
  validateParcelSideCm,
  validateWeightGram,
} from "@/lib/parcel-dimensions";
import {
  calculateParcelInsuranceFee,
  calculateRemoteAreaSurcharge,
  PARCEL_TYPE_OPTIONS,
} from "@/lib/parcel-registration";
import {
  dimensionsFromParcelSizePreset,
  findParcelSizePreset,
  isCustomParcelSizePreset,
  PARCEL_SIZE_PRESETS,
} from "@/lib/parcel-size-presets";
import { isValidThaiPhone, normalizeThaiPhone } from "@/lib/thai-phone";

type RegistrationProps = {
  active: boolean;
  sender: SenderAddress | null;
  onCreated: (parcel: CreatedParcel) => Promise<void> | void;
};

type RecipientDraft = {
  contactName: string;
  phone: string;
  addressLine: string;
  locationQuery: string;
  location: ThaiLocationRow | null;
};

type RecipientErrors = Partial<
  Record<"contactName" | "phone" | "addressLine" | "location", string>
>;

type ParcelErrors = Partial<
  Record<"recipient" | "weight" | "size" | "dimensions" | "type" | "insuredValue", string>
>;

const EMPTY_RECIPIENT: RecipientDraft = {
  contactName: "",
  phone: "",
  addressLine: "",
  locationQuery: "",
  location: null,
};

const PICKUP_REGISTRATION_DRAFT_KEY = "quickload:pickup-registration-draft:v1";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#0802b8] focus:ring-1 focus:ring-[#0802b8] disabled:bg-slate-100";

function formatAddress(address: SenderAddress | RecipientAddress) {
  return [
    address.addressLine,
    address.tambon,
    address.amphoe,
    address.province,
    address.zipcode,
  ]
    .filter(Boolean)
    .join(", ");
}

function recipientToDraft(address: RecipientAddress): RecipientDraft {
  const location = {
    tambon: address.tambon,
    amphoe: address.amphoe,
    province: address.province,
    zipcode: address.zipcode,
  };
  return {
    contactName: address.contactName,
    phone: address.phone,
    addressLine: address.addressLine,
    location,
    locationQuery: formatThaiLocation(location),
  };
}

function insuranceLabel(extraInsurance: boolean, insuredValue: string) {
  if (!extraInsurance) return "ไม่ซื้อ";
  return `${Number(insuredValue || 0).toLocaleString("th-TH")} บาท`;
}

export function PickupParcelRegistration({
  active,
  sender,
  onCreated,
}: RegistrationProps) {
  const [reviewing, setReviewing] = useState(false);
  const [recipients, setRecipients] = useState<RecipientAddress[]>([]);
  const [recipientId, setRecipientId] = useState("");
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [recipientLoadError, setRecipientLoadError] = useState<string | null>(null);
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [recipientDraft, setRecipientDraft] = useState<RecipientDraft>(EMPTY_RECIPIENT);
  const [recipientErrors, setRecipientErrors] = useState<RecipientErrors>({});
  const [savingRecipient, setSavingRecipient] = useState(false);
  const [recipientSaveError, setRecipientSaveError] = useState<string | null>(null);

  const [weightGram, setWeightGram] = useState("");
  const [sizePresetId, setSizePresetId] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [parcelType, setParcelType] = useState<string>(PARCEL_TYPE_OPTIONS[0]);
  const [note, setNote] = useState("");
  const [extraInsurance, setExtraInsurance] = useState(false);
  const [insuredValue, setInsuredValue] = useState("");
  const [parcelErrors, setParcelErrors] = useState<ParcelErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [estimatedBasePrice, setEstimatedBasePrice] = useState<number | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState<ParcelOrderProgress | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [orderAttemptId] = useState(() => createParcelOrderAttemptId());
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);

  const activeRecipient = useMemo(
    () => recipients.find((recipient) => recipient.id === recipientId) ?? null,
    [recipientId, recipients],
  );
  const customSize = isCustomParcelSizePreset(sizePresetId);
  const insuranceFee = extraInsurance
    ? calculateParcelInsuranceFee(Number(insuredValue || 0))
    : 0;
  const remoteAreaFee = calculateRemoteAreaSurcharge(activeRecipient?.zipcode);
  const estimatedTotal =
    estimatedBasePrice == null ? null : estimatedBasePrice + insuranceFee + remoteAreaFee;

  useEffect(() => {
    if (!active || draftHydrated) return;
    try {
      const raw = window.sessionStorage.getItem(PICKUP_REGISTRATION_DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as {
          recipientId?: string;
          editingRecipientId?: string | null;
          recipientDraft?: RecipientDraft;
          weightGram?: string;
          sizePresetId?: string;
          widthCm?: string;
          lengthCm?: string;
          heightCm?: string;
          parcelType?: string;
          note?: string;
          extraInsurance?: boolean;
          insuredValue?: string;
        };
        setRecipientId(draft.recipientId ?? "");
        setEditingRecipientId(draft.editingRecipientId ?? null);
        if (draft.recipientDraft) setRecipientDraft(draft.recipientDraft);
        setWeightGram(draft.weightGram ?? "");
        setSizePresetId(draft.sizePresetId ?? "");
        setWidthCm(draft.widthCm ?? "");
        setLengthCm(draft.lengthCm ?? "");
        setHeightCm(draft.heightCm ?? "");
        setParcelType(draft.parcelType || PARCEL_TYPE_OPTIONS[0]);
        setNote(draft.note ?? "");
        setExtraInsurance(Boolean(draft.extraInsurance));
        setInsuredValue(draft.insuredValue ?? "");
      }
    } catch {
      // Keep the empty form when storage is unavailable or invalid.
    } finally {
      setDraftHydrated(true);
    }
  }, [active, draftHydrated]);

  useEffect(() => {
    if (!active || !draftHydrated) return;
    try {
      window.sessionStorage.setItem(
        PICKUP_REGISTRATION_DRAFT_KEY,
        JSON.stringify({
          recipientId,
          editingRecipientId,
          recipientDraft,
          weightGram,
          sizePresetId,
          widthCm,
          lengthCm,
          heightCm,
          parcelType,
          note,
          extraInsurance,
          insuredValue,
        }),
      );
    } catch {
      // The form remains usable even when draft persistence is unavailable.
    }
  }, [
    active,
    draftHydrated,
    editingRecipientId,
    extraInsurance,
    heightCm,
    insuredValue,
    lengthCm,
    note,
    parcelType,
    recipientDraft,
    recipientId,
    sizePresetId,
    weightGram,
    widthCm,
  ]);

  useEffect(() => {
    if (!active || recipients.length) return;
    let cancelled = false;
    setLoadingRecipients(true);
    setRecipientLoadError(null);
    void (async () => {
      try {
        const response = await fetch("/api/recipient-addresses", { cache: "no-store" });
        const json = await readApiJson<{
          ok?: boolean;
          data?: RecipientAddress[];
          error?: string;
        }>(response, "โหลดข้อมูลผู้รับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        if (cancelled) return;
        if (!response.ok || !json.ok) {
          throw new Error(json.error || "โหลดข้อมูลผู้รับไม่สำเร็จ");
        }
        const items = json.data ?? [];
        setRecipients(items);
        setRecipientId((current) => current || items[0]?.id || "");
      } catch (cause) {
        if (!cancelled) {
          setRecipientLoadError(
            cause instanceof Error ? cause.message : "โหลดข้อมูลผู้รับไม่สำเร็จ",
          );
        }
      } finally {
        if (!cancelled) setLoadingRecipients(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, recipients.length]);

  useEffect(() => {
    if (!reviewing) return;
    window.requestAnimationFrame(() => reviewHeadingRef.current?.focus());
  }, [reviewing]);

  function beginNewRecipient() {
    setEditingRecipientId("new");
    setRecipientDraft(EMPTY_RECIPIENT);
    setRecipientErrors({});
    setRecipientSaveError(null);
  }

  function beginEditRecipient() {
    if (!activeRecipient) return;
    setEditingRecipientId(activeRecipient.id);
    setRecipientDraft(recipientToDraft(activeRecipient));
    setRecipientErrors({});
    setRecipientSaveError(null);
  }

  async function saveRecipient(event: React.FormEvent) {
    event.preventDefault();
    if (savingRecipient || !editingRecipientId) return;
    const normalizedPhone = normalizeThaiPhone(recipientDraft.phone);
    const errors: RecipientErrors = {
      contactName: recipientDraft.contactName.trim() ? undefined : "กรุณากรอกชื่อผู้รับ",
      phone: !normalizedPhone
        ? "กรุณากรอกเบอร์โทรผู้รับ"
        : !isValidThaiPhone(recipientDraft.phone)
          ? "กรุณากรอกเบอร์โทรศัพท์มือถือ 10 หลัก"
          : undefined,
      addressLine: recipientDraft.addressLine.trim() ? undefined : "กรุณากรอกที่อยู่ผู้รับ",
      location: recipientDraft.location ? undefined : "กรุณาเลือกตำบล/แขวงจากรายการ",
    };
    setRecipientErrors(errors);
    if (Object.values(errors).some(Boolean) || !recipientDraft.location) return;

    setSavingRecipient(true);
    setRecipientSaveError(null);
    try {
      const isNew = editingRecipientId === "new";
      const response = await fetch(
        isNew
          ? "/api/recipient-addresses"
          : `/api/recipient-addresses/${encodeURIComponent(editingRecipientId)}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contactName: recipientDraft.contactName.trim(),
            phone: normalizedPhone,
            addressLine: recipientDraft.addressLine.trim(),
            ...recipientDraft.location,
            isPrimary: false,
          }),
        },
      );
      const json = await readApiJson<{
        ok?: boolean;
        data?: RecipientAddress;
        error?: string;
      }>(response, "บันทึกข้อมูลผู้รับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      if (!response.ok || !json.ok || !json.data) {
        throw new Error(json.error || "บันทึกข้อมูลผู้รับไม่สำเร็จ");
      }
      setRecipients((current) => {
        const exists = current.some((item) => item.id === json.data!.id);
        return exists
          ? current.map((item) => (item.id === json.data!.id ? json.data! : item))
          : [json.data!, ...current];
      });
      setRecipientId(json.data.id);
      setEditingRecipientId(null);
      setParcelErrors((current) => ({ ...current, recipient: undefined }));
    } catch (cause) {
      setRecipientSaveError(
        cause instanceof Error ? cause.message : "บันทึกข้อมูลผู้รับไม่สำเร็จ",
      );
    } finally {
      setSavingRecipient(false);
    }
  }

  function selectSize(id: string) {
    setSizePresetId(id);
    setParcelErrors((current) => ({
      ...current,
      size: undefined,
      dimensions: undefined,
    }));
    if (isCustomParcelSizePreset(id)) {
      setWidthCm("");
      setLengthCm("");
      setHeightCm("");
      return;
    }
    const preset = findParcelSizePreset(id);
    const dimensions = preset ? dimensionsFromParcelSizePreset(preset) : null;
    if (!dimensions) return;
    setWidthCm(dimensions.widthCm);
    setLengthCm(dimensions.lengthCm);
    setHeightCm(dimensions.heightCm);
  }

  function validateParcel(): boolean {
    const dimensionError = sizePresetId
      ? validateParcelDimensionsFromStrings(widthCm, lengthCm, heightCm)
      : null;
    const errors: ParcelErrors = {
      recipient: activeRecipient ? undefined : "กรุณาเลือกหรือเพิ่มข้อมูลผู้รับ",
      weight: validateWeightGram(weightGram) ?? undefined,
      size: sizePresetId ? undefined : "กรุณาเลือกขนาดพัสดุ",
      dimensions:
        customSize &&
        ([widthCm, lengthCm, heightCm].some((value) => validateParcelSideCm(value)) ||
          dimensionError)
          ? dimensionError || "ขนาดแต่ละด้านต้องไม่เกิน 60 ซม."
          : undefined,
      type: parcelType.trim() ? undefined : "กรุณาเลือกประเภทพัสดุ",
      insuredValue:
        extraInsurance && (!insuredValue || Number(insuredValue) <= 0)
          ? "กรุณากรอกมูลค่าพัสดุ"
          : undefined,
    };
    setParcelErrors(errors);
    return !Object.values(errors).some(Boolean);
  }

  async function showReview() {
    setFormError(null);
    if (!sender) {
      setFormError("กรุณาเพิ่มหรือเลือกที่อยู่เข้ารับพัสดุก่อน");
      return;
    }
    if (!validateParcel() || !activeRecipient) return;
    setReviewing(true);
    setPricingLoading(true);
    setPricingError(null);
    setEstimatedBasePrice(null);
    try {
      const params = new URLSearchParams({
        productWeight: weightGram,
        cusZipcode: activeRecipient.zipcode,
        productPrice: extraInsurance ? insuredValue || "0" : "0",
        insurancePrice: extraInsurance ? insuredValue || "0" : "0",
      });
      const response = await fetch(`/api/pricing/estimate?${params.toString()}`);
      const json = await readApiJson<{
        ok?: boolean;
        data?: { estimatedTotal?: number };
        error?: string;
      }>(response, "ตรวจสอบราคาไม่สำเร็จ");
      if (
        !response.ok ||
        !json.ok ||
        !Number.isFinite(json.data?.estimatedTotal)
      ) {
        throw new Error(json.error || "ตรวจสอบราคาไม่สำเร็จ");
      }
      setEstimatedBasePrice(Number(json.data?.estimatedTotal));
    } catch (cause) {
      setPricingError(cause instanceof Error ? cause.message : "ตรวจสอบราคาไม่สำเร็จ");
    } finally {
      setPricingLoading(false);
    }
  }

  async function createParcel() {
    if (!sender || !activeRecipient || submitting) return;
    setSubmitting(true);
    setSubmitProgress(null);
    setFormError(null);
    try {
      const created = await createParcelOrder(
        {
          senderId: sender.id,
          recipientId: activeRecipient.id,
          shippingMode: "pickup",
          autoPrint: true,
          weightGram,
          widthCm,
          lengthCm,
          heightCm,
          parcelType,
          note: sanitizeParcelNote(note) ?? "",
          insuredValue,
          extraInsurance,
        },
        {
          onProgress: setSubmitProgress,
          attemptId: orderAttemptId,
        },
      );
      await onCreated(created);
      try {
        window.sessionStorage.removeItem(PICKUP_REGISTRATION_DRAFT_KEY);
      } catch {
        // Ignore unavailable storage after a successful creation.
      }
      setReviewing(false);
      setWeightGram("");
      setSizePresetId("");
      setWidthCm("");
      setLengthCm("");
      setHeightCm("");
      setParcelType(PARCEL_TYPE_OPTIONS[0]);
      setNote("");
      setExtraInsurance(false);
      setInsuredValue("");
      setParcelErrors({});
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "สร้างพัสดุไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      );
    } finally {
      setSubmitting(false);
      setSubmitProgress(null);
    }
  }

  return (
    <div id="pickup-new-parcel-content">
          {reviewing && activeRecipient && sender ? (
            <div aria-labelledby="pickup-registration-review-heading">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3
                    ref={reviewHeadingRef}
                    id="pickup-registration-review-heading"
                    tabIndex={-1}
                    className="font-semibold text-slate-950 focus:outline-none"
                  >
                    ตรวจสอบพัสดุ
                  </h3>
                  <p className="mt-0.5 text-sm text-slate-600">ตรวจสอบข้อมูลก่อนลงทะเบียน</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewing(false)}
                  disabled={submitting}
                  className="min-h-11 rounded-lg px-3 text-sm font-medium text-[#0802b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8]"
                >
                  แก้ไข
                </button>
              </div>

              <dl className="mt-4 divide-y divide-slate-200 border-y border-slate-200 text-sm">
                <div className="py-3">
                  <dt className="text-xs font-medium text-slate-500">ผู้ส่ง / ที่อยู่เข้ารับ</dt>
                  <dd className="mt-1 font-medium text-slate-900">{sender.contactName} · {sender.phone}</dd>
                  <dd className="mt-1 text-xs leading-5 text-slate-600">{formatAddress(sender)}</dd>
                </div>
                <div className="py-3">
                  <dt className="text-xs font-medium text-slate-500">ผู้รับ</dt>
                  <dd className="mt-1 font-medium text-slate-900">{activeRecipient.contactName} · {activeRecipient.phone}</dd>
                  <dd className="mt-1 text-xs leading-5 text-slate-600">{formatAddress(activeRecipient)}</dd>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 py-3">
                  <dt className="text-slate-500">น้ำหนัก</dt>
                  <dd className="text-right font-medium">{Number(weightGram).toLocaleString("th-TH")} กรัม</dd>
                  <dt className="text-slate-500">ขนาด</dt>
                  <dd className="text-right font-medium">{widthCm} × {lengthCm} × {heightCm} ซม.</dd>
                  <dt className="text-slate-500">ประเภท</dt>
                  <dd className="text-right font-medium">{parcelType}</dd>
                  <dt className="text-slate-500">ประกันเพิ่ม</dt>
                  <dd className="text-right font-medium">{insuranceLabel(extraInsurance, insuredValue)}</dd>
                  {note ? (
                    <>
                      <dt className="text-slate-500">หมายเหตุ</dt>
                      <dd className="break-words text-right font-medium">{note}</dd>
                    </>
                  ) : null}
                </div>
                <div className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-600">ราคาโดยประมาณ</dt>
                    <dd className="text-lg font-semibold text-slate-950">
                      {pricingLoading
                        ? "กำลังคำนวณ…"
                        : estimatedTotal == null
                          ? "-"
                          : `${estimatedTotal.toLocaleString("th-TH")} บาท`}
                    </dd>
                  </div>
                  {pricingError ? (
                    <p className="mt-2 text-sm text-amber-800" role="status">{pricingError}</p>
                  ) : null}
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    ราคาจริงอาจเปลี่ยนหลังตรวจน้ำหนักและขนาดที่สาขา
                  </p>
                </div>
              </dl>

              {formError ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">{formError}</p> : null}
              <button
                type="button"
                onClick={() => void createParcel()}
                disabled={submitting || pricingLoading}
                className="mt-4 min-h-12 w-full rounded-lg bg-[#0802b8] px-4 py-3 font-medium text-white transition hover:bg-[#060190] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitProgress === "registering"
                  ? "กำลังลงทะเบียนพัสดุ…"
                  : submitProgress === "saving"
                    ? "กำลังบันทึกพัสดุ…"
                    : "ยืนยันสร้างพัสดุ"}
              </button>
            </div>
          ) : (
            <div>
              <div className="border-b border-slate-200 pb-4">
                <p className="text-xs font-medium text-slate-500">ผู้ส่ง / ที่อยู่เข้ารับ</p>
                {sender ? (
                  <>
                    <p className="mt-1 text-sm font-medium text-slate-900">{sender.contactName} · {sender.phone}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{formatAddress(sender)}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-rose-700">กรุณาเพิ่มหรือเลือกที่อยู่เข้ารับพัสดุก่อน</p>
                )}
              </div>

              <fieldset className="mt-4">
                <legend className="text-sm font-semibold text-slate-800">ผู้รับ</legend>
                {loadingRecipients ? (
                  <p className="mt-2 text-sm text-slate-600" role="status">กำลังโหลดข้อมูลผู้รับ…</p>
                ) : recipientLoadError ? (
                  <p className="mt-2 text-sm text-rose-700" role="alert">{recipientLoadError}</p>
                ) : (
                  <>
                    {recipients.length ? (
                      <select
                        value={recipientId}
                        onChange={(event) => {
                          setRecipientId(event.target.value);
                          setParcelErrors((current) => ({ ...current, recipient: undefined }));
                        }}
                        className={inputClass}
                        aria-label="เลือกผู้รับ"
                      >
                        {recipients.map((recipient) => (
                          <option key={recipient.id} value={recipient.id}>
                            {recipient.contactName} · {recipient.phone}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="mt-2 text-sm text-slate-600">ยังไม่มีข้อมูลผู้รับ</p>
                    )}
                    {activeRecipient ? (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                        {formatAddress(activeRecipient)}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={beginNewRecipient}
                        className="min-h-11 rounded-lg border border-[#0802b8] px-3 py-2 text-sm font-medium text-[#0802b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8]"
                      >
                        เพิ่มผู้รับใหม่
                      </button>
                      {activeRecipient ? (
                        <button
                          type="button"
                          onClick={beginEditRecipient}
                          className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8]"
                        >
                          แก้ไขผู้รับนี้
                        </button>
                      ) : null}
                    </div>
                  </>
                )}
                {parcelErrors.recipient ? <p className="mt-1 text-sm text-rose-700" role="alert">{parcelErrors.recipient}</p> : null}
              </fieldset>

              {editingRecipientId ? (
                <div className="mt-4 border-t border-indigo-200 pt-4">
                  <form onSubmit={(event) => void saveRecipient(event)} noValidate>
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="font-medium text-slate-900">
                        {editingRecipientId === "new" ? "เพิ่มผู้รับ" : "แก้ไขผู้รับ"}
                      </h4>
                      <button
                        type="button"
                        onClick={() => setEditingRecipientId(null)}
                        className="min-h-11 px-2 text-sm text-slate-600"
                      >
                        ปิด
                      </button>
                    </div>
                    <div className="mt-2 grid gap-3">
                      <div>
                        <label htmlFor="pickup-recipient-name" className="text-sm font-medium text-slate-800">ชื่อผู้รับ</label>
                        <input
                          id="pickup-recipient-name"
                          value={recipientDraft.contactName}
                          onChange={(event) => setRecipientDraft((current) => ({ ...current, contactName: event.target.value }))}
                          className={inputClass}
                          autoComplete="name"
                        />
                        {recipientErrors.contactName ? <p className="mt-1 text-sm text-rose-700">{recipientErrors.contactName}</p> : null}
                      </div>
                      <div>
                        <label htmlFor="pickup-recipient-phone" className="text-sm font-medium text-slate-800">เบอร์โทร</label>
                        <input
                          id="pickup-recipient-phone"
                          value={recipientDraft.phone}
                          onChange={(event) => setRecipientDraft((current) => ({ ...current, phone: event.target.value }))}
                          className={inputClass}
                          inputMode="tel"
                          autoComplete="tel"
                        />
                        {recipientErrors.phone ? <p className="mt-1 text-sm text-rose-700">{recipientErrors.phone}</p> : null}
                      </div>
                      <div>
                        <label htmlFor="pickup-recipient-address" className="text-sm font-medium text-slate-800">บ้านเลขที่ / ถนน / ซอย</label>
                        <textarea
                          id="pickup-recipient-address"
                          rows={2}
                          value={recipientDraft.addressLine}
                          onChange={(event) => setRecipientDraft((current) => ({ ...current, addressLine: event.target.value }))}
                          className={`${inputClass} resize-y`}
                        />
                        {recipientErrors.addressLine ? <p className="mt-1 text-sm text-rose-700">{recipientErrors.addressLine}</p> : null}
                      </div>
                      <ThaiLocationCombobox
                        id="pickup-recipient-location"
                        label="ตำบล / อำเภอ / จังหวัด / รหัสไปรษณีย์"
                        placeholder="พิมพ์ตำบลหรือรหัสไปรษณีย์"
                        query={recipientDraft.locationQuery}
                        selected={recipientDraft.location}
                        onQueryChange={(value) => setRecipientDraft((current) => ({ ...current, locationQuery: value, location: null }))}
                        onSelect={(location) => setRecipientDraft((current) => ({ ...current, location, locationQuery: formatThaiLocation(location) }))}
                        onClear={() => setRecipientDraft((current) => ({ ...current, location: null, locationQuery: "" }))}
                        copy={{ searching: "กำลังค้นหา…", noResults: "ไม่พบพื้นที่", selected: "เลือกแล้ว", change: "เปลี่ยน" }}
                        error={recipientErrors.location}
                        required
                        inputClassName={inputClass}
                      />
                    </div>
                    {recipientSaveError ? <p className="mt-2 text-sm text-rose-700" role="alert">{recipientSaveError}</p> : null}
                    <button
                      type="submit"
                      disabled={savingRecipient}
                      className="mt-3 min-h-11 rounded-lg bg-[#0802b8] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {savingRecipient ? "กำลังบันทึก…" : "บันทึกผู้รับ"}
                    </button>
                  </form>
                </div>
              ) : null}

              <div className="mt-5 grid gap-4">
                <div>
                  <label htmlFor="pickup-new-weight" className="text-sm font-semibold text-slate-800">น้ำหนัก (กรัม)</label>
                  <input
                    id="pickup-new-weight"
                    type="number"
                    inputMode="numeric"
                    min={10}
                    max={30000}
                    value={weightGram}
                    onChange={(event) => {
                      setWeightGram(event.target.value);
                      setParcelErrors((current) => ({ ...current, weight: undefined }));
                    }}
                    className={inputClass}
                    placeholder="10–30,000"
                  />
                  {parcelErrors.weight ? <p className="mt-1 text-sm text-rose-700" role="alert">{parcelErrors.weight}</p> : null}
                </div>
                <div>
                  <label htmlFor="pickup-new-size" className="text-sm font-semibold text-slate-800">ขนาดพัสดุ</label>
                  <select
                    id="pickup-new-size"
                    value={sizePresetId}
                    onChange={(event) => selectSize(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">เลือกขนาด</option>
                    {PARCEL_SIZE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.label}</option>
                    ))}
                  </select>
                  {parcelErrors.size ? <p className="mt-1 text-sm text-rose-700" role="alert">{parcelErrors.size}</p> : null}
                </div>
                {customSize ? (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["กว้าง", widthCm, setWidthCm],
                      ["ยาว", lengthCm, setLengthCm],
                      ["สูง", heightCm, setHeightCm],
                    ].map(([label, value, setter]) => (
                      <label key={String(label)} className="text-xs font-medium text-slate-700">
                        {String(label)} (ซม.)
                        <input
                          type="number"
                          inputMode="decimal"
                          value={String(value)}
                          onChange={(event) => {
                            (setter as (value: string) => void)(event.target.value);
                            setParcelErrors((current) => ({ ...current, dimensions: undefined }));
                          }}
                          className={inputClass}
                        />
                      </label>
                    ))}
                  </div>
                ) : null}
                {parcelErrors.dimensions ? <p className="-mt-3 text-sm text-rose-700" role="alert">{parcelErrors.dimensions}</p> : null}
                <div>
                  <label htmlFor="pickup-new-type" className="text-sm font-semibold text-slate-800">ประเภทพัสดุ</label>
                  <select
                    id="pickup-new-type"
                    value={parcelType}
                    onChange={(event) => setParcelType(event.target.value)}
                    className={inputClass}
                  >
                    {PARCEL_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                  {parcelErrors.type ? <p className="mt-1 text-sm text-rose-700">{parcelErrors.type}</p> : null}
                </div>
                <div>
                  <label htmlFor="pickup-new-note" className="text-sm font-semibold text-slate-800">หมายเหตุ <span className="font-normal text-slate-500">(ไม่บังคับ)</span></label>
                  <textarea
                    id="pickup-new-note"
                    rows={2}
                    maxLength={MAX_PARCEL_NOTE_LENGTH}
                    value={note}
                    onChange={(event) => setNote(event.target.value.slice(0, MAX_PARCEL_NOTE_LENGTH))}
                    className={`${inputClass} resize-y`}
                  />
                  <p className="mt-1 text-right text-xs text-slate-500">{note.length}/{MAX_PARCEL_NOTE_LENGTH}</p>
                </div>
                <div className="border-y border-slate-200 py-3">
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-800">ซื้อประกันเพิ่ม</span>
                    <input
                      type="checkbox"
                      checked={extraInsurance}
                      onChange={(event) => {
                        setExtraInsurance(event.target.checked);
                        setParcelErrors((current) => ({ ...current, insuredValue: undefined }));
                      }}
                      className="h-5 w-5 rounded border-slate-300 text-[#0802b8] focus:ring-[#0802b8]"
                    />
                  </label>
                  {extraInsurance ? (
                    <div className="mt-2">
                      <label htmlFor="pickup-new-insured-value" className="text-sm font-medium text-slate-800">มูลค่าพัสดุ (บาท)</label>
                      <input
                        id="pickup-new-insured-value"
                        type="number"
                        min={1}
                        inputMode="decimal"
                        value={insuredValue}
                        onChange={(event) => setInsuredValue(event.target.value)}
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-slate-500">ค่าประกันเพิ่มโดยประมาณ {insuranceFee.toLocaleString("th-TH")} บาท</p>
                      {parcelErrors.insuredValue ? <p className="mt-1 text-sm text-rose-700">{parcelErrors.insuredValue}</p> : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {formError ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert">{formError}</p> : null}
              <button
                type="button"
                onClick={() => void showReview()}
                disabled={Boolean(editingRecipientId)}
                className="mt-5 min-h-12 w-full rounded-lg bg-[#0802b8] px-4 py-3 font-medium text-white transition hover:bg-[#060190] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ตรวจสอบข้อมูลและราคา
              </button>
            </div>
          )}
    </div>
  );
}
