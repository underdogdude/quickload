"use client";

import type { SenderAddress } from "@quickload/shared/types";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readApiJson } from "@/lib/api-json";
import type { PickupRequestDto } from "@/lib/iship-pickup";
import { MAX_PICKUP_WEIGHT_KG } from "@/lib/iship-pickup";
import {
  clearPickupDraft,
  readPickupDraft,
  writePickupDraft,
} from "@/lib/pickup-draft-client";

type EligibleParcel = {
  id: string;
  trackingId: string;
  barcode: string | null;
  displayCode: string;
  weightKg: number;
  recipient: {
    contactName: string;
    phone: string;
    addressShort: string;
  };
  createdAt: string;
};

type FieldErrors = Partial<Record<"pickupAddress" | "parcels", string>>;

function requestKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `pickup_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function AddressBookIcon({ muted = false }: { muted?: boolean }) {
  const color = muted ? "#CBD5E1" : "#0802b8";
  return (
    <svg
      viewBox="0 -0.5 25 25"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.5 7V17C7.5 18.1046 8.39543 19 9.5 19H17.5C18.6046 19 19.5 18.1046 19.5 17V7C19.5 5.89543 18.6046 5 17.5 5H9.5C8.39543 5 7.5 5.89543 7.5 7Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.5 10C15.5 11.1046 14.6046 12 13.5 12C12.3954 12 11.5 11.1046 11.5 10C11.5 8.89543 12.3954 8 13.5 8C14.6046 8 15.5 8.89543 15.5 10Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.05108 16.3992C6.71926 16.6471 6.65126 17.1171 6.89919 17.4489C7.14713 17.7807 7.61711 17.8487 7.94892 17.6008L7.05108 16.3992ZM19.0511 17.6008C19.3829 17.8487 19.8529 17.7807 20.1008 17.4489C20.3487 17.1171 20.2807 16.6471 19.9489 16.3992L19.0511 17.6008ZM5.5 8.25C5.08579 8.25 4.75 8.58579 4.75 9C4.75 9.41421 5.08579 9.75 5.5 9.75V8.25ZM7.5 9.75C7.91421 9.75 8.25 9.41421 8.25 9C8.25 8.58579 7.91421 8.25 7.5 8.25V9.75ZM5.5 11.25C5.08579 11.25 4.75 11.5858 4.75 12C4.75 12.4142 5.08579 12.75 5.5 12.75V11.25ZM7.5 12.75C7.91421 12.75 8.25 12.4142 8.25 12C8.25 11.5858 7.91421 11.25 7.5 11.25V12.75ZM5.5 14.25C5.08579 14.25 4.75 14.5858 4.75 15C4.75 15.4142 5.08579 15.75 5.5 15.75V14.25ZM7.5 15.75C7.91421 15.75 8.25 15.4142 8.25 15C8.25 14.5858 7.91421 14.25 7.5 14.25V15.75ZM7.94892 17.6008C11.2409 15.141 15.7591 15.141 19.0511 17.6008L19.9489 16.3992C16.1245 13.5416 10.8755 13.5416 7.05108 16.3992L7.94892 17.6008ZM5.5 9.75H7.5V8.25H5.5V9.75ZM5.5 12.75H7.5V11.25H5.5V12.75ZM5.5 15.75H7.5V14.25H5.5V15.75Z"
        fill={color}
      />
    </svg>
  );
}

function PickupAddressField({
  address,
  loading,
  error,
}: {
  address: SenderAddress | null;
  loading: boolean;
  error?: string;
}) {
  const addressBookParams = new URLSearchParams({ tab: "sender", from: "pickup" });
  if (address?.id) addressBookParams.set("senderId", address.id);
  const addressBookHref = `/addresses?${addressBookParams.toString()}`;
  const editHref = address
    ? `/send/sender?id=${encodeURIComponent(address.id)}&from=pickup`
    : "/send/sender?from=pickup";

  return (
    <div>
      <p className="text-sm font-medium text-slate-800">ที่อยู่เข้ารับพัสดุ</p>
      <div
        className={`mt-3 flex items-center gap-3 ${
          error
            ? "rounded-lg border border-rose-500 bg-rose-50/40 p-2 ring-1 ring-rose-500/20"
            : ""
        }`}
      >
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
            error
              ? "border-rose-500 bg-rose-50"
              : address
                ? "border-[#0802b8] bg-[#0802b8]"
                : "border-[#0802b8] bg-white"
          }`}
        >
          {address ? (
            <span className="text-xs font-bold text-white" aria-hidden>
              ✓
            </span>
          ) : (
            <span className="h-3 w-3 rounded-full bg-[#0802b8]" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {loading ? (
            <div
              className="flex min-h-7 items-center justify-between gap-3"
              role="status"
              aria-live="polite"
              aria-label="กำลังโหลดที่อยู่เข้ารับพัสดุ"
            >
              <div className="h-4 min-w-0 max-w-[14rem] flex-1 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
              <AddressBookIcon muted />
            </div>
          ) : (
            <>
              <div className="flex min-h-7 items-center justify-between gap-3">
                <Link
                  href={editHref}
                  className={`min-w-0 flex-1 truncate text-sm leading-5 ${
                    address
                      ? "font-medium text-slate-900"
                      : "font-bold text-slate-400"
                  }`}
                >
                  {address ? (
                    <>
                      {address.contactName}{" "}
                      <span className="mx-1 font-light text-slate-400">|</span>{" "}
                      {address.phone}
                    </>
                  ) : (
                    "เพิ่มข้อมูลผู้ส่ง"
                  )}
                </Link>
                <Link
                  href={addressBookHref}
                  className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8]"
                  aria-label="เปิดสมุดที่อยู่เพื่อเลือกที่อยู่เข้ารับพัสดุ"
                >
                  <AddressBookIcon muted={!address} />
                </Link>
              </div>
              {address ? (
                <div className="space-y-1">
                  <p className="truncate text-xs leading-4 text-slate-500">
                    {address.addressLine}, {address.tambon}, {address.amphoe},{" "}
                    {address.province}, {address.zipcode}
                  </p>
                  <Link
                    href={editHref}
                    className="inline-block text-xs font-medium text-[#0802b8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8]"
                  >
                    แก้ไข
                  </Link>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
      {error ? (
        <p className="mt-2 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-3" aria-label="กำลังโหลดข้อมูล">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-16 animate-pulse rounded-lg bg-slate-200 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

function RequestsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
      <path
        d="M8 5h8M8 9h8M8 13h5M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function activePickupHeadline(status: PickupRequestDto["status"]) {
  if (status === "assigned") return "พนักงานกำลังเข้ารับพัสดุ";
  if (status === "requested") return "รอไปรษณีย์เข้ารับพัสดุ";
  if (status === "submitting") return "กำลังส่งคำขอเข้ารับ";
  if (status === "unknown") return "กำลังตรวจสอบคำขอเข้ารับ";
  return "ติดตามการเข้ารับพัสดุ";
}

function confirmationStatus(status: PickupRequestDto["status"]) {
  if (status === "assigned") return "พนักงานรับงานแล้ว";
  if (status === "unknown") return "กำลังตรวจสอบคำขอ";
  return "รอไปรษณีย์เข้ารับ";
}

function formatConfirmationDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function PickupConfirmation({
  request,
  headingRef,
  warning,
}: {
  request: PickupRequestDto;
  headingRef: React.Ref<HTMLHeadingElement>;
  warning?: string | null;
}) {
  const providerMessage = request.providerMessage?.trim();
  const showProviderMessage =
    providerMessage &&
    !/^(เรียก|ส่ง)?รถ?เข้ารับสำเร็จ$/i.test(providerMessage);
  const additionalMessages = [
    showProviderMessage ? providerMessage : null,
    request.timeoutAtText,
    request.ticketMessage,
  ].filter((message): message is string => Boolean(message));

  return (
    <section
      className="overflow-hidden rounded-xl bg-white shadow-sm"
      role="status"
      aria-live="polite"
      data-testid="pickup-confirmation"
    >
      <div className="relative px-5 pb-7 pt-7 text-center">
        <span
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-8 w-8 text-emerald-700"
          >
            <path
              d="m6.5 12.5 3.5 3.5 7.5-8"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-6 text-2xl font-bold leading-tight text-slate-950 outline-none text-balance"
        >
          ส่งคำขอเรียกรถแล้ว
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600 text-pretty">
          ไปรษณีย์ได้รับคำขอแล้ว กรุณาเตรียมพัสดุให้พร้อมสำหรับการเข้ารับ
        </p>
        <span className="mt-4 inline-flex min-h-7 items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">
          <span
            className="h-2 w-2 rounded-full bg-emerald-600"
            aria-hidden="true"
          />
          {confirmationStatus(request.status)}
        </span>
        <span
          className="absolute inset-x-5 bottom-0 border-t border-dashed border-slate-300"
          aria-hidden="true"
          data-testid="pickup-ticket-perforation"
        />
        <span
          className="absolute -bottom-3 -left-3 h-6 w-6 rounded-full bg-slate-100"
          aria-hidden="true"
        />
        <span
          className="absolute -bottom-3 -right-3 h-6 w-6 rounded-full bg-slate-100"
          aria-hidden="true"
        />
      </div>

      <div className="px-5 pb-5 pt-6 text-left">
        <p className="text-xs font-medium text-slate-500 text-center">เลขที่คำขอ</p>
        <p
          className="mt-1 break-all text-2xl font-bold leading-tight text-[#0802b8] tabular-nums text-center"
          data-testid="pickup-confirmation-ticket"
        >
          {request.ticketPickupId || "กำลังออกเลขที่คำขอ"}
        </p>
        {warning ? (
          <p
            className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900"
            role="alert"
          >
            {warning}
          </p>
        ) : null}

        <dl className="mt-5 grid grid-cols-2 divide-x divide-slate-200 border-y border-slate-200 py-4">
          <div className="pr-4">
            <dt className="text-xs font-medium text-slate-500">จำนวนพัสดุ</dt>
            <dd className="mt-1 text-base font-medium text-slate-900 tabular-nums">
              {request.parcelCount.toLocaleString("th-TH")} ชิ้น
            </dd>
          </div>
          <div className="pl-4">
            <dt className="text-xs font-medium text-slate-500">ส่งคำขอเมื่อ</dt>
            <dd className="mt-1 text-sm font-medium leading-6 text-slate-900">
              {formatConfirmationDate(request.createdAt)}
            </dd>
          </div>
        </dl>

        <dl className="mt-5 space-y-4">
          <div>
            <dt className="text-xs font-medium text-slate-500">
              ที่อยู่เข้ารับพัสดุ
            </dt>
            <dd className="mt-1 text-sm leading-6 text-slate-800">
              {request.pickupAddressFull}
            </dd>
          </div>
          {request.staffInfoName || request.staffInfoPhone ? (
            <div>
              <dt className="text-xs font-medium text-slate-500">
                พนักงานเข้ารับ
              </dt>
              <dd className="mt-1 text-sm leading-6 text-slate-800">
                {[request.staffInfoName, request.staffInfoPhone]
                  .filter(Boolean)
                  .join(" · ")}
              </dd>
            </div>
          ) : null}
        </dl>

        {additionalMessages.length ? (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-xs font-medium text-slate-500">
              ข้อมูลการเข้ารับ
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-700">
              {additionalMessages.join(" · ")}
            </p>
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-100 px-5 pb-5 pt-4">
        <Link
          href="/pickup/requests"
          className="flex min-h-12 w-full items-center justify-center rounded-lg bg-[#0802b8] px-5 py-3 text-base font-medium text-white transition hover:bg-[#060190] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8] focus-visible:ring-offset-2 active:scale-[0.99]"
        >
          ดูสถานะการเข้ารับ
        </Link>
        <Link
          href="/"
          className="mt-2 flex min-h-11 w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8]"
        >
          กลับหน้าแรก
        </Link>
      </div>
    </section>
  );
}

export function PickupClient({ senderAddressId }: { senderAddressId: string | null }) {
  const router = useRouter();
  const [eligibleParcels, setEligibleParcels] = useState<EligibleParcel[]>([]);
  const [activePickupParcelCount, setActivePickupParcelCount] = useState(0);
  const [unavailablePickupParcelCount, setUnavailablePickupParcelCount] =
    useState(0);
  const [senderAddresses, setSenderAddresses] = useState<SenderAddress[]>([]);
  const [selectedParcelIds, setSelectedParcelIds] = useState<string[]>([]);
  const [remark, setRemark] = useState("");
  const [draftSenderAddressId, setDraftSenderAddressId] = useState<string | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [activeRequests, setActiveRequests] = useState<PickupRequestDto[]>([]);
  const [activeHasMore, setActiveHasMore] = useState(false);
  const [loadingForm, setLoadingForm] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<PickupRequestDto | null>(null);
  const [successWarning, setSuccessWarning] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => requestKey());
  const [registrationAnnouncement, setRegistrationAnnouncement] = useState("");
  const pickupAddressSectionRef = useRef<HTMLElement>(null);
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);

  const loadFormData = useCallback(async () => {
    setLoadingForm(true);
    setPageError(null);
    try {
      const [parcelsResponse, addressesResponse] = await Promise.all([
        fetch("/api/pickup/eligible-parcels", { cache: "no-store" }),
        fetch("/api/sender-addresses", { cache: "no-store" }),
      ]);
      const parcelsJson = await readApiJson<{
        ok?: boolean;
        data?: {
          items?: EligibleParcel[];
          activePickupParcelCount?: number;
          unavailablePickupParcelCount?: number;
        };
        error?: string;
      }>(parcelsResponse, "โหลดข้อมูลพัสดุไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      if (!parcelsResponse.ok || !parcelsJson.ok) {
        throw new Error(parcelsJson.error || "โหลดพัสดุไม่สำเร็จ");
      }
      const addressesJson = await readApiJson<{
        ok?: boolean;
        data?: SenderAddress[];
        error?: string;
      }>(
        addressesResponse,
        "โหลดที่อยู่เข้ารับพัสดุไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
      );
      if (!addressesResponse.ok || !addressesJson.ok) {
        throw new Error(
          addressesJson.error || "โหลดที่อยู่เข้ารับพัสดุไม่สำเร็จ",
        );
      }
      const items = parcelsJson.data?.items ?? [];
      setEligibleParcels(items);
      setActivePickupParcelCount(
        Math.max(0, parcelsJson.data?.activePickupParcelCount ?? 0),
      );
      setUnavailablePickupParcelCount(
        Math.max(0, parcelsJson.data?.unavailablePickupParcelCount ?? 0),
      );
      setSelectedParcelIds((current) =>
        current.filter((id) => items.some((item) => item.id === id)),
      );
      setSenderAddresses(addressesJson.data ?? []);
    } catch (cause) {
      setPageError(
        cause instanceof Error
          ? cause.message
          : "โหลดข้อมูลเรียกรถเข้ารับไม่สำเร็จ",
      );
    } finally {
      setLoadingForm(false);
    }
  }, []);

  const loadActiveRequests = useCallback(async () => {
    try {
      const response = await fetch("/api/pickup?scope=active&page=1", {
        cache: "no-store",
      });
      const json = await readApiJson<{
        ok?: boolean;
        data?: { items?: PickupRequestDto[]; hasMore?: boolean };
      }>(response, "โหลดรายการเข้ารับไม่สำเร็จ");
      if (!response.ok || !json.ok) return;
      setActiveRequests(json.data?.items ?? []);
      setActiveHasMore(Boolean(json.data?.hasMore));
    } catch {
      // The main booking flow remains usable when the status summary is unavailable.
    }
  }, []);

  useEffect(() => {
    const draft = readPickupDraft();
    setDraftSenderAddressId(draft.senderAddressId);
    setSelectedParcelIds(draft.selectedParcelIds);
    setRemark(draft.remark);
    setRegistrationAnnouncement(draft.announcement ?? "");
    writePickupDraft({ ...draft, announcement: undefined });
    setDraftHydrated(true);
  }, []);

  useEffect(() => {
    void loadFormData();
    void loadActiveRequests();
  }, [loadActiveRequests, loadFormData]);

  useEffect(() => {
    if (success) confirmationHeadingRef.current?.focus();
  }, [success]);

  const effectiveSenderAddressId = senderAddressId ?? draftSenderAddressId;
  const activePickupAddress = useMemo(
    () =>
      (effectiveSenderAddressId
        ? senderAddresses.find(
            (address) => address.id === effectiveSenderAddressId,
          )
        : null) ??
      senderAddresses[0] ??
      null,
    [effectiveSenderAddressId, senderAddresses],
  );

  useEffect(() => {
    if (!draftHydrated) return;
    writePickupDraft({
      senderAddressId: activePickupAddress?.id ?? effectiveSenderAddressId,
      selectedParcelIds,
      remark,
    });
  }, [
    activePickupAddress?.id,
    draftHydrated,
    effectiveSenderAddressId,
    remark,
    selectedParcelIds,
  ]);

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!activePickupAddress) {
      errors.pickupAddress = "กรุณาเพิ่มหรือเลือกที่อยู่เข้ารับพัสดุ";
    }
    if (!selectedParcelIds.length) {
      errors.parcels = "กรุณาเลือกพัสดุอย่างน้อย 1 ชิ้น";
    }
    if (selectedParcelIds.length > 100) {
      errors.parcels = "เลือกพัสดุได้สูงสุด 100 ชิ้นต่อครั้ง";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitPickup() {
    if (!validate() || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setSuccessWarning(null);
    setSuccess(null);
    try {
      type SubmitPickupResponse = {
        ok?: boolean;
        data?: PickupRequestDto;
        error?: string;
        code?: string;
        ambiguous?: boolean;
        persistencePending?: boolean;
        warning?: string;
      };
      const requestBody = JSON.stringify({
        senderAddressId: activePickupAddress!.id,
        parcelIds: selectedParcelIds,
        remark,
        idempotencyKey,
      });
      // request_courier has no provider-side idempotency contract. Never
      // automatically replay this POST: a lost response may still mean that
      // the courier request was created successfully.
      const response = await fetch("/api/pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
      });
      const json = await readApiJson<SubmitPickupResponse>(
        response,
        "ระบบเรียกรถเข้ารับยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง",
      );
      if (!response.ok || !json.ok || !json.data) {
        if (!json.ambiguous && response.status < 500) {
          setIdempotencyKey(requestKey());
        }
        if (json.code === "PICKUP_PARCEL_CONFLICT") {
          const message =
            "พัสดุที่เลือกบางรายการอยู่ในคำขอเข้ารับแล้ว ระบบอัปเดตรายการให้เรียบร้อย";
          setRegistrationAnnouncement(message);
          await Promise.all([loadFormData(), loadActiveRequests()]);
          throw new Error(message);
        }
        throw new Error(json.error || "ส่งคำขอเรียกรถเข้ารับไม่สำเร็จ");
      }
      setSuccessWarning(
        json.persistencePending
          ? json.warning ||
              "ส่งคำขอเรียกรถสำเร็จแล้ว ระบบกำลังซิงก์ข้อมูล กรุณาอย่าส่งคำขอซ้ำ"
          : null,
      );
      setSuccess(json.data);
      setRemark("");
      setSelectedParcelIds([]);
      clearPickupDraft();
      setIdempotencyKey(requestKey());
      await Promise.all([loadFormData(), loadActiveRequests()]);
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    } catch (cause) {
      setSubmitError(
        cause instanceof Error
          ? cause.message
          : "ส่งคำขอเรียกรถเข้ารับไม่สำเร็จ",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function showRegistration() {
    if (!activePickupAddress) {
      setFieldErrors((current) => ({
        ...current,
        pickupAddress: "กรุณาเพิ่มหรือเลือกที่อยู่เข้ารับพัสดุก่อนลงทะเบียนพัสดุ",
      }));
      pickupAddressSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      return;
    }
    writePickupDraft({
      senderAddressId: activePickupAddress.id,
      selectedParcelIds,
      remark,
    });
    router.push(
      `/pickup/register?senderId=${encodeURIComponent(activePickupAddress.id)}`,
    );
  }

  const activeRequestCountLabel = activeHasMore
    ? "9+"
    : String(activeRequests.length);
  const latestActiveRequest = activeRequests[0] ?? null;
  const displayedActivePickupParcelCount =
    activePickupParcelCount ||
    activeRequests.reduce((total, request) => total + request.parcelCount, 0);
  const hasSelectableParcels = eligibleParcels.some(
    (parcel) => parcel.weightKg <= MAX_PICKUP_WEIGHT_KG,
  );

  return (
    <main className="pickup-surface min-h-screen bg-slate-100 pb-36">
      <section className="bg-[#0802b8] px-6 pb-16 pt-8 text-white">
        <div className="mx-auto w-full max-w-lg">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#0802b8]"
            aria-label="กลับไปหน้าแรก"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </Link>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold leading-tight text-balance">
                เรียกรถเข้ารับ
              </h1>
              <p className="mt-1 max-w-[65ch] text-base leading-6 text-white/90">
                ให้ไปรษณีย์ไทยเข้ารับพัสดุตามที่อยู่ของคุณ
              </p>
            </div>
            <Link
              href="/pickup/requests"
              aria-label="รายการเข้ารับ"
              title="รายการเข้ารับ"
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/40 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <RequestsIcon />
              {activeRequests.length ? (
                <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#0802b8] tabular-nums">
                  {activeRequestCountLabel}
                </span>
              ) : null}
            </Link>
          </div>
        </div>
      </section>

      <div className="-mt-9 px-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          {success ? (
            <PickupConfirmation
              request={success}
              headingRef={confirmationHeadingRef}
              warning={successWarning}
            />
          ) : (
            <>
              {latestActiveRequest || displayedActivePickupParcelCount > 0 ? (
                <Link
                  href="/pickup/requests"
                  className="flex items-center gap-3 rounded-lg bg-white p-4 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8]"
                >
                  <span
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-indigo-50 p-1"
                    data-testid="active-pickup-truck-frame"
                    aria-hidden="true"
                  >
                    <Image
                      src="/truck-pickup-active.png"
                      alt=""
                      width={56}
                      height={56}
                      data-testid="active-pickup-truck"
                      className="h-full w-full object-contain"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-900">
                      มีพัสดุ{" "}
                      {displayedActivePickupParcelCount.toLocaleString("th-TH")} ชิ้น
                      อยู่ในรายการเข้ารับ
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-slate-600">
                      {latestActiveRequest
                        ? activePickupHeadline(latestActiveRequest.status)
                        : "แตะเพื่อติดตามสถานะ"}
                      {latestActiveRequest?.ticketPickupId
                        ? ` · ${latestActiveRequest.ticketPickupId}`
                        : ""}
                    </span>
                  </span>
                  <span className="text-xl text-slate-400" aria-hidden="true">
                    ›
                  </span>
                </Link>
              ) : null}

              <section
                ref={pickupAddressSectionRef}
                className="rounded-lg bg-white p-4 shadow-sm"
              >
                <PickupAddressField
                  address={activePickupAddress}
                  loading={loadingForm}
                  error={fieldErrors.pickupAddress}
                />
              </section>

              <section
                className="rounded-lg bg-white p-4 shadow-sm"
                aria-labelledby="pickup-parcels-heading"
              >
            <div>
              <h2
                id="pickup-parcels-heading"
                className="text-xl font-medium text-slate-900"
              >
                เลือกพัสดุที่รอนำส่งไปรษณีย์
              </h2>
              <div className="mt-1 flex items-center justify-between gap-3">
                <p className="text-sm leading-5 text-slate-600">
                  เลือกได้หลายชิ้น สูงสุด 100 ชิ้นต่อครั้ง
                </p>
                {selectedParcelIds.length ? (
                  <span
                    className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-[#0802b8] tabular-nums"
                    aria-live="polite"
                  >
                    เลือกแล้ว {selectedParcelIds.length} ชิ้น
                  </span>
                ) : null}
              </div>
            </div>
            <p className="sr-only" aria-live="polite">
              {registrationAnnouncement}
            </p>
            {loadingForm ? (
              <div className="mt-5">
                <LoadingRows />
              </div>
            ) : pageError ? (
              <div className="mt-5 rounded-lg bg-rose-50 p-4" role="alert">
                <p className="text-sm text-rose-800">{pageError}</p>
                <button
                  type="button"
                  onClick={() => void loadFormData()}
                  className="mt-3 min-h-11 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white"
                >
                  ลองโหลดอีกครั้ง
                </button>
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <fieldset className="min-w-0">
                  <legend className="sr-only">
                    เลือกพัสดุที่รอนำส่งไปรษณีย์
                  </legend>
                  {eligibleParcels.length ? (
                    <>
                      <div
                        data-testid="eligible-parcel-list"
                        role={eligibleParcels.length > 4 ? "region" : undefined}
                        aria-label={
                          eligibleParcels.length > 4
                            ? "รายการพัสดุที่เลือกได้"
                            : undefined
                        }
                        tabIndex={eligibleParcels.length > 4 ? 0 : undefined}
                        className="max-h-[50dvh] w-full min-w-0 touch-pan-y divide-y divide-slate-200 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-slate-200 [scrollbar-gutter:stable] sm:max-h-[32rem]"
                      >
                        {eligibleParcels.map((parcel) => {
                          const checked = selectedParcelIds.includes(parcel.id);
                          const overweight =
                            parcel.weightKg > MAX_PICKUP_WEIGHT_KG;
                          const selectionLimitReached =
                            !checked && selectedParcelIds.length >= 100;
                          const disabled = overweight || selectionLimitReached;
                          return (
                            <label
                              key={parcel.id}
                              className={`flex min-h-16 items-start gap-3 p-3 ${
                                overweight
                                  ? "cursor-not-allowed bg-rose-50/60"
                                  : "cursor-pointer hover:bg-slate-50"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={disabled}
                                onChange={(event) => {
                                  setFieldErrors((current) => ({
                                    ...current,
                                    parcels: undefined,
                                  }));
                                  setSelectedParcelIds((current) =>
                                    event.target.checked
                                      ? [...current, parcel.id]
                                      : current.filter((id) => id !== parcel.id),
                                  );
                                }}
                                className="mt-1 h-5 w-5 rounded border-slate-300 text-[#0802b8] focus:ring-[#0802b8]"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block break-all text-base font-semibold text-slate-950 tabular-nums">
                                  {parcel.displayCode}
                                </span>
                                <span className="mt-1 block truncate text-sm text-slate-700">
                                  {parcel.recipient.contactName} ·{" "}
                                  {parcel.recipient.phone}
                                </span>
                                <span
                                  className="mt-0.5 block truncate text-xs leading-5 text-slate-500"
                                  title={parcel.recipient.addressShort}
                                >
                                  {parcel.recipient.addressShort}
                                </span>
                                {overweight ? (
                                  <span className="mt-1 block text-xs font-medium text-rose-700">
                                    พัสดุมีน้ำหนักเกิน {MAX_PICKUP_WEIGHT_KG} กก.
                                    ไม่สามารถเรียกรถได้
                                  </span>
                                ) : null}
                                {selectionLimitReached ? (
                                  <span className="mt-1 block text-xs font-medium text-amber-800">
                                    เลือกพัสดุครบ 100 ชิ้นแล้ว
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={showRegistration}
                        className="mt-3 flex min-h-11 w-full items-center justify-center gap-1 rounded-lg text-sm font-medium text-[#0802b8] transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8]"
                      >
                        <span className="text-lg leading-none" aria-hidden>
                          +
                        </span>
                        ลงทะเบียนพัสดุใหม่
                      </button>
                    </>
                  ) : unavailablePickupParcelCount > 0 ? (
                    <div className="rounded-lg bg-slate-50 px-4 py-6 text-center">
                      <span
                        className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-indigo-50 text-[#0802b8]"
                        aria-hidden="true"
                      >
                        <RequestsIcon />
                      </span>
                      <p className="mt-3 font-medium text-slate-900">
                        พัสดุทั้งหมดอยู่ในรายการเข้ารับแล้ว
                      </p>
                      <p className="mt-1 text-sm leading-5 text-slate-600">
                        ติดตามสถานะรายการเดิม หรือลงทะเบียนพัสดุใหม่
                      </p>
                      <Link
                        href="/pickup/requests"
                        className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg bg-[#0802b8] px-4 py-2.5 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8] focus-visible:ring-offset-2"
                      >
                        ดูสถานะการเข้ารับ
                      </Link>
                      <button
                        type="button"
                        onClick={showRegistration}
                        className="mt-2 min-h-11 w-full rounded-lg px-4 py-2.5 text-sm font-medium text-[#0802b8] transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8]"
                      >
                        ลงทะเบียนพัสดุใหม่
                      </button>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-700">
                      <p className="font-medium text-slate-900">
                        ยังไม่มีพัสดุที่เรียกรถเข้ารับได้
                      </p>
                      <p className="mt-1 leading-5">
                        ลงทะเบียนพัสดุชิ้นแรก แล้วระบบจะเลือกให้ทันที
                      </p>
                      <button
                        type="button"
                        onClick={showRegistration}
                        className="mt-4 min-h-11 rounded-lg bg-[#0802b8] px-4 py-2.5 font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8] focus-visible:ring-offset-2"
                      >
                        ลงทะเบียนพัสดุใหม่
                      </button>
                    </div>
                  )}
                  {fieldErrors.parcels ? (
                    <p className="mt-2 text-sm text-rose-700" role="alert">
                      {fieldErrors.parcels}
                    </p>
                  ) : null}
                </fieldset>

                {selectedParcelIds.length ? (
                  <div>
                    <label
                      htmlFor="pickup-remark"
                      className="text-sm font-medium text-slate-800"
                    >
                      หมายเหตุถึงพนักงาน{" "}
                      <span className="font-normal text-slate-500">
                        (ไม่บังคับ)
                      </span>
                    </label>
                    <textarea
                      id="pickup-remark"
                      value={remark}
                      onChange={(event) =>
                        setRemark(event.target.value.slice(0, 500))
                      }
                      maxLength={500}
                      rows={3}
                      placeholder="เช่น พัสดุขนาดใหญ่ กรุณาโทรก่อนถึง"
                      className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none placeholder:text-slate-500 focus:ring-2 focus:ring-[#0802b8]"
                    />
                    <p className="mt-1 text-right text-xs text-slate-500 tabular-nums">
                      {remark.length}/500
                    </p>
                  </div>
                ) : null}

                {submitError ? (
                  <p
                    className="rounded-lg bg-rose-50 p-3 text-sm leading-5 text-rose-800"
                    role="alert"
                  >
                    {submitError}
                  </p>
                ) : null}

              </div>
            )}
              </section>
            </>
          )}
        </div>
      </div>
      {!success && !loadingForm && !pageError && hasSelectableParcels ? (
        <div
          data-testid="pickup-submit-bar"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white px-6 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3"
        >
          <div className="mx-auto w-full max-w-lg">
            <button
              type="button"
              onClick={() => void submitPickup()}
              disabled={
                submitting ||
                !eligibleParcels.length ||
                !activePickupAddress
              }
              className="min-h-12 w-full rounded-lg bg-[#0802b8] px-5 py-3 text-base font-medium text-white transition hover:bg-[#060190] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0802b8] focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? "กำลังเรียกรถเข้ารับ…"
                : "ยืนยันเรียกรถเข้ารับ"}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
