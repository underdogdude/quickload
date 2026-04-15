"use client";

import type { RecipientAddress, SenderAddress } from "@quickload/shared/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function AddressBookIcon() {
  return (
    <svg viewBox="0 -0.5 25 25" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.5 7V17C7.5 18.1046 8.39543 19 9.5 19H17.5C18.6046 19 19.5 18.1046 19.5 17V7C19.5 5.89543 18.6046 5 17.5 5H9.5C8.39543 5 7.5 5.89543 7.5 7Z"
        stroke="#2726F5"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.5 10C15.5 11.1046 14.6046 12 13.5 12C12.3954 12 11.5 11.1046 11.5 10C11.5 8.89543 12.3954 8 13.5 8C14.6046 8 15.5 8.89543 15.5 10Z"
        stroke="#2726F5"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.05108 16.3992C6.71926 16.6471 6.65126 17.1171 6.89919 17.4489C7.14713 17.7807 7.61711 17.8487 7.94892 17.6008L7.05108 16.3992ZM19.0511 17.6008C19.3829 17.8487 19.8529 17.7807 20.1008 17.4489C20.3487 17.1171 20.2807 16.6471 19.9489 16.3992L19.0511 17.6008ZM5.5 8.25C5.08579 8.25 4.75 8.58579 4.75 9C4.75 9.41421 5.08579 9.75 5.5 9.75V8.25ZM7.5 9.75C7.91421 9.75 8.25 9.41421 8.25 9C8.25 8.58579 7.91421 8.25 7.5 8.25V9.75ZM5.5 11.25C5.08579 11.25 4.75 11.5858 4.75 12C4.75 12.4142 5.08579 12.75 5.5 12.75V11.25ZM7.5 12.75C7.91421 12.75 8.25 12.4142 8.25 12C8.25 11.5858 7.91421 11.25 7.5 11.25V12.75ZM5.5 14.25C5.08579 14.25 4.75 14.5858 4.75 15C4.75 15.4142 5.08579 15.75 5.5 15.75V14.25ZM7.5 15.75C7.91421 15.75 8.25 15.4142 8.25 15C8.25 14.5858 7.91421 14.25 7.5 14.25V15.75ZM7.94892 17.6008C11.2409 15.141 15.7591 15.141 19.0511 17.6008L19.9489 16.3992C16.1245 13.5416 10.8755 13.5416 7.05108 16.3992L7.94892 17.6008ZM5.5 9.75H7.5V8.25H5.5V9.75ZM5.5 12.75H7.5V11.25H5.5V12.75ZM5.5 15.75H7.5V14.25H5.5V15.75Z"
        fill="#2726F5"
      />
    </svg>
  );
}

function SendParcelInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const senderSaved = searchParams.get("senderSaved") === "1";
  const senderIdParam = searchParams.get("senderId");
  const recipientSaved = searchParams.get("recipientSaved") === "1";
  const recipientIdParam = searchParams.get("recipientId");

  const [shippingMode, setShippingMode] = useState<"branch" | "pickup">("branch");
  const [autoPrint, setAutoPrint] = useState(true);
  const [weightGram, setWeightGram] = useState("1000");
  const [widthCm, setWidthCm] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [parcelTypeOpen, setParcelTypeOpen] = useState(false);
  const parcelTypeOptions = [
    "เอกสาร",
    "เสื้อผ้าเครื่องประดับ",
    "เครื่องสำอาง/ความงาม",
    "อุปกรณ์อิเล็กทรอนิค",
    "อาหาร",
    "ผลไม้",
    "เครื่องมือช่าง",
    "สุขภาพ",
    "ต้นไม้",
    "อื่นๆ",
  ] as const;
  const [parcelType, setParcelType] = useState<(typeof parcelTypeOptions)[number]>("เครื่องสำอาง/ความงาม");
  const [addresses, setAddresses] = useState<SenderAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [recipientAddresses, setRecipientAddresses] = useState<RecipientAddress[]>([]);
  const [recipientAddressesLoading, setRecipientAddressesLoading] = useState(true);

  function onlyNumber(value: string) {
    return value.replace(/\D/g, "");
  }

  function validateAndContinue() {
    if (!activeSender) {
      setFormError("กรุณาเพิ่มหรือเลือกข้อมูลผู้ส่ง");
      return;
    }
    if (!activeRecipient) {
      setFormError("กรุณาเพิ่มหรือเลือกข้อมูลผู้รับ");
      return;
    }
    if (!weightGram || Number(weightGram) <= 0) {
      setFormError("กรุณาระบุน้ำหนักพัสดุให้ถูกต้อง");
      return;
    }
    if (!widthCm || Number(widthCm) <= 0 || !lengthCm || Number(lengthCm) <= 0 || !heightCm || Number(heightCm) <= 0) {
      setFormError("กรุณาระบุขนาดพัสดุ (กว้าง/ยาว/สูง) ให้ครบถ้วน");
      return;
    }
    if (!parcelType.trim()) {
      setFormError("กรุณาเลือกประเภทพัสดุ");
      return;
    }
    setFormError(null);
    const params = new URLSearchParams({
      senderId: activeSender.id,
      recipientId: activeRecipient.id,
      shippingMode,
      autoPrint: autoPrint ? "1" : "0",
      weightGram,
      widthCm,
      lengthCm,
      heightCm,
      parcelType,
      note: note.trim(),
    });
    router.push(`/send/review?${params.toString()}`);
  }

  function ParcelTypeIcon({ type }: { type: (typeof parcelTypeOptions)[number] }) {
    const cls = "h-4 w-4 text-[#2726F5]";
    if (type === "เอกสาร") {
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
          <path d="M7 3h7l4 4v14H7z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    }
    if (type === "เสื้อผ้าเครื่องประดับ") {
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
          <path d="M9 5 7 8l-3 1 2 4 2-1v7h8v-7l2 1 2-4-3-1-2-3H9Z" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    }
    if (type === "เครื่องสำอาง/ความงาม") {
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
          <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.8" />
          <rect x="8" y="7" width="8" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    }
    if (type === "อุปกรณ์อิเล็กทรอนิค") {
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
          <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9 18v2m6-2v2" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    }
    if (type === "อาหาร") {
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
          <path d="M6 3v8m3-8v8M6 7h3m5-4v18m4-18v8" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    }
    if (type === "ผลไม้") {
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
          <path d="M12 7c-4.4 0-8 3.1-8 7s3.6 7 8 7 8-3.1 8-7-3.6-7-8-7Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M12 7c0-2 1.5-4 4-4" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    }
    if (type === "เครื่องมือช่าง") {
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
          <path d="m14 4 6 6-2 2-6-6 2-2Zm-1 5L5 17l-1 4 4-1 8-8" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    }
    if (type === "สุขภาพ") {
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
          <path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10Z" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    }
    if (type === "ต้นไม้") {
      return (
        <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
          <path d="M12 20v-6m0 0c-2.5 0-4.5-2-4.5-4.5S9.5 5 12 5s4.5 2 4.5 4.5S14.5 14 12 14Z" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9 20h6" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" fill="none" className={cls} aria-hidden>
        <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sender-addresses");
        const json = (await res.json()) as { ok?: boolean; data?: SenderAddress[] };
        if (cancelled) return;
        if (res.ok && json.ok && Array.isArray(json.data)) {
          setAddresses(json.data);
        }
      } finally {
        if (!cancelled) setAddressesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/recipient-addresses");
        const json = (await res.json()) as { ok?: boolean; data?: RecipientAddress[] };
        if (cancelled) return;
        if (res.ok && json.ok && Array.isArray(json.data)) {
          setRecipientAddresses(json.data);
        }
      } finally {
        if (!cancelled) setRecipientAddressesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSender = useMemo(() => {
    if (!addresses.length) return null;
    if (senderIdParam) {
      return addresses.find((a) => a.id === senderIdParam) ?? null;
    }
    const primary = addresses.find((a) => a.isPrimary);
    return primary ?? addresses[0];
  }, [addresses, senderIdParam]);

  const senderComplete = Boolean(activeSender);
  const activeRecipient = useMemo(() => {
    if (!recipientAddresses.length) return null;
    if (recipientIdParam) {
      return recipientAddresses.find((a) => a.id === recipientIdParam) ?? null;
    }
    const primary = recipientAddresses.find((a) => a.isPrimary);
    return primary ?? recipientAddresses[0];
  }, [recipientAddresses, recipientIdParam]);

  const recipientComplete = Boolean(activeRecipient);

  return (
    <main className="min-h-screen bg-slate-100 pb-36">
      <section className="bg-[#2726F5] px-6 pb-20 pt-10 text-white">
        <div className="mx-auto flex w-full max-w-lg items-start justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={() => router.back()}
              className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
            >
              <span aria-hidden>←</span>
              <span>กลับ</span>
            </button>
            <h1 className="text-3xl font-bold leading-none">ลงทะเบียนพัสดุ</h1>
            <p className="mt-0 text-base text-white/80">กรอกข้อมูลพัสดุของคุณ</p>
          </div>
        </div>
      </section>

      <section className="-mt-12 px-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          {formError ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">{formError}</div>
          ) : null}
          {senderSaved ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              บันทึกข้อมูลผู้ส่งเรียบร้อยแล้ว ดำเนินการขั้นถัดไปได้เลย
            </div>
          ) : null}
          {recipientSaved ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
              บันทึกข้อมูลผู้รับเรียบร้อยแล้ว ดำเนินการขั้นถัดไปได้เลย
            </div>
          ) : null}

          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="flex gap-4">
              <div className="flex w-8 flex-col items-center pt-0.5">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                    senderComplete ? "border-[#2726F5] bg-[#2726F5]" : "border-[#2726F5]"
                  }`}
                >
                  {senderComplete ? (
                    <span className="text-xs font-bold text-white">✓</span>
                  ) : (
                    <div className="h-3 w-3 rounded-full bg-[#2726F5]" />
                  )}
                </div>
                <div className="my-1 h-[72px] border-l border-dashed border-slate-300" />
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${
                    recipientComplete ? "border-[#2726F5] bg-[#2726F5]" : "border-slate-300 bg-[#ECECEC]"
                  }`}
                >
                  {recipientComplete ? <span className="text-xs font-bold text-white">✓</span> : null}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="border-b border-slate-300 pb-4">
                  {addressesLoading ? (
                    <div className="py-1">
                      <p className="text-sm font-medium text-slate-500">กำลังโหลดข้อมูลผู้ส่ง...</p>
                    </div>
                  ) : activeSender ? (
                    <Link href={`/send/sender?id=${activeSender.id}`} className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-light text-slate-500">ผู้ส่งที่เลือก</p>
                        <p className="mt-1 truncate text-sm font-medium text-slate-900">
                          {activeSender.contactName} <span className="mx-1 text-slate-400 font-light">|</span> {activeSender.phone}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {activeSender.addressLine},{" "}
                          {activeSender.tambon}, {activeSender.amphoe}, {activeSender.province}, {activeSender.zipcode}
                        </p>
                        <p className="mt-2 text-xs font-normal text-[#2726F5]">แก้ไข</p>
                      </div>
                      <span aria-hidden>
                        <AddressBookIcon />
                      </span>
                    </Link>
                  ) : (
                    <Link href="/send/sender" className="flex items-center justify-between gap-2">
                      <p className="text-4xl font-bold text-slate-400">เพิ่มข้อมูลผู้ส่ง</p>
                      <span aria-hidden>
                        <AddressBookIcon />
                      </span>
                    </Link>
                  )}
                </div>
                <div className="pt-4">
                  {recipientAddressesLoading ? (
                    <div className="py-1">
                      <p className="text-sm font-medium text-slate-500">กำลังโหลดข้อมูลผู้รับ...</p>
                    </div>
                  ) : activeRecipient ? (
                    <Link href={`/send/recipient?id=${activeRecipient.id}`} className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-light text-slate-500">ผู้รับที่เลือก</p>
                        <p className="mt-1 truncate text-sm font-medium text-slate-900">
                          {activeRecipient.contactName} <span className="mx-1 text-slate-400 font-light">|</span> {activeRecipient.phone}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          {activeRecipient.addressLine},{" "}
                          {activeRecipient.tambon}, {activeRecipient.amphoe}, {activeRecipient.province}, {activeRecipient.zipcode}
                        </p>
                        <p className="mt-2 text-xs font-normal text-[#2726F5]">แก้ไข</p>
                      </div>
                      <span aria-hidden>
                        <AddressBookIcon />
                      </span>
                    </Link>
                  ) : (
                    <Link href="/send/recipient" className="flex items-center justify-between gap-2">
                      <p className="text-4xl font-bold text-slate-400">เพิ่มข้อมูลผู้รับ</p>
                      <span aria-hidden>
                        <AddressBookIcon />
                      </span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="rounded-full bg-slate-100 p-1">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setShippingMode("branch")}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                    shippingMode === "branch" ? "bg-[#2726F5] text-white" : "text-slate-500"
                  }`}
                >
                  ส่งที่สาขาไปรษณีย์ไทย
                </button>
                <button
                  type="button"
                  onClick={() => setShippingMode("pickup")}
                  className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                    shippingMode === "pickup" ? "bg-[#2726F5] text-white" : "text-slate-500"
                  }`}
                >
                  เรียกรถรับพัสดุ
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-slate-900">
              <label className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-4 py-3">
                <span className="text-sm font-medium">
                  น้ำหนัก<span className="text-red-500">*</span>
                </span>
                <span className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={weightGram}
                    onChange={(e) => setWeightGram(onlyNumber(e.target.value))}
                    className="w-full rounded-md px-2 py-1 text-right text-sm text-slate-700 outline-none"
                  />
                  <span className="text-sm text-slate-700">กรัม</span>
                </span>
              </label>

              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="ความกว้าง(ซม.)"
                  value={widthCm}
                  onChange={(e) => setWidthCm(onlyNumber(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-center text-sm text-slate-600 outline-none placeholder:text-slate-400"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="ความยาว(ซม.)"
                  value={lengthCm}
                  onChange={(e) => setLengthCm(onlyNumber(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-center text-sm text-slate-600 outline-none placeholder:text-slate-400"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="ความสูง(ซม.)"
                  value={heightCm}
                  onChange={(e) => setHeightCm(onlyNumber(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-3 text-center text-sm text-slate-600 outline-none placeholder:text-slate-400"
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setParcelTypeOpen((prev) => !prev)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-4 py-3"
                >
                  <span className="text-sm font-medium">ประเภทพัสดุ</span>
                  <span className="flex items-center gap-2 text-sm text-slate-700">
                    <ParcelTypeIcon type={parcelType} />
                    {parcelType}
                    <span className="text-base text-[#2726F5]">▾</span>
                  </span>
                </button>
              </div>

              <textarea
                rows={2}
                placeholder="หมายเหตุ"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="rounded-lg bg-white px-4 py-4 shadow-sm">
            <button
              type="button"
              onClick={() => setAutoPrint((prev) => !prev)}
              className="flex w-full items-center justify-between"
            >
              <span className="text-sm font-medium text-slate-900">พิมพ์ใบปะหน้าอัตโนมัติ</span>
              <span
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                  autoPrint ? "bg-[#2726F5]" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                    autoPrint ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </span>
            </button>
          </div>

          <a
            href="https://postbase.thailandpost.co.th/"
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-between rounded-lg bg-white px-4 py-4 text-left shadow-sm"
          >
            <span className="text-sm font-medium text-slate-900">
              ค้นหาจุดบริการไปรษณีย์ไทย <span className="font-normal text-xs text-slate-400">(สำหรับอ้างอิงเท่านั้น)</span>
            </span>
            <span className="text-xl text-[#2726F5]">›</span>
          </a>
        </div>
      </section>
      {parcelTypeOpen ? (
        <div className="fixed inset-0 z-40 bg-black/35 px-6 py-10" onClick={() => setParcelTypeOpen(false)}>
          <div
            className="mx-auto mt-20 w-full max-w-lg rounded-2xl bg-white p-2 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 py-2 text-xs font-medium text-slate-500">เลือกประเภทพัสดุ</p>
            <div className="max-h-[60vh] overflow-y-auto">
              {parcelTypeOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setParcelType(option);
                    setParcelTypeOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                    parcelType === option ? "bg-[#2726F5]/10 text-[#2726F5]" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <ParcelTypeIcon type={option} />
                  <span>{option}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-[#ECECEC] px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-6px_20px_rgba(15,23,42,0.08)]">
        <div className="mx-auto w-full max-w-lg">
          <button
            type="button"
            onClick={validateAndContinue}
            className="w-full rounded-full bg-[#2726F5] px-6 py-3 text-base font-semibold text-white shadow-[0_6px_14px_rgba(39,38,245,0.35)]"
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </main>
  );
}

export default function SendParcelPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#F4F4F4] p-6">
          <p className="text-sm text-slate-600">กำลังโหลด...</p>
        </main>
      }
    >
      <SendParcelInner />
    </Suspense>
  );
}
