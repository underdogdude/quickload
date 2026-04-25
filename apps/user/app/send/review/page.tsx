"use client";

import type { RecipientAddress, SenderAddress } from "@quickload/shared/types";
import { ReviewOrderSummarySkeleton } from "@/components/skeleton";
import { isValidThaiPhone } from "@/lib/thai-phone";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";

const ZIPCODE_SURCHARGE_LIST = new Set([
  "20120",
  "23170",
  "81150",
  "81210",
  "82160",
  "83000",
  "83100",
  "83110",
  "83120",
  "83130",
  "83150",
  "84140",
  "84280",
  "84310",
  "84320",
  "84330",
  "84360",
  "57170",
  "57180",
  "57260",
  "58000",
  "58110",
  "58120",
  "58130",
  "58140",
  "58150",
  "63150",
  "63170",
  "71180",
  "71240",
  "94000",
  "94110",
  "94120",
  "94130",
  "94140",
  "94150",
  "94160",
  "94170",
  "94180",
  "94190",
  "94220",
  "94230",
  "95000",
  "95110",
  "95120",
  "95130",
  "95140",
  "95150",
  "95160",
  "95170",
  "96000",
  "96110",
  "96120",
  "96130",
  "96140",
  "96150",
  "96160",
  "96170",
  "96180",
  "96190",
  "96210",
  "96220",
  "83001",
  "94001",
  "95001",
  "50250",
  "50310",
  "50350",
  "55130",
  "55220",
  "57310",
  "57340",
  "83111",
]);

function formatAddress(address: SenderAddress | RecipientAddress) {
  return `${address.addressLine}, ${address.tambon}, ${address.amphoe}, ${address.province}, ${address.zipcode}`;
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ReviewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const senderId = searchParams.get("senderId") ?? "";
  const recipientId = searchParams.get("recipientId") ?? "";
  const shippingMode = searchParams.get("shippingMode") === "pickup" ? "pickup" : "branch";
  const autoPrint = searchParams.get("autoPrint") === "1";
  const extraInsurance = searchParams.get("extraInsurance") === "1";
  const insuredValue = searchParams.get("insuredValue") ?? "";
  const weightGram = searchParams.get("weightGram") ?? "";
  const widthCm = searchParams.get("widthCm") ?? "";
  const lengthCm = searchParams.get("lengthCm") ?? "";
  const heightCm = searchParams.get("heightCm") ?? "";
  const parcelType = searchParams.get("parcelType") ?? "";
  const note = searchParams.get("note") ?? "";

  const [sender, setSender] = useState<SenderAddress | null>(null);
  const [recipient, setRecipient] = useState<RecipientAddress | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [estimatedPrice, setEstimatedPrice] = useState(0);
  const [baseEstimatedPrice, setBaseEstimatedPrice] = useState(0);
  const [orderCreatedAt] = useState(() => new Date());

  function calculateInsuranceFee(productPrice: number) {
    if (productPrice <= 2000) return 0;
    return Math.ceil(productPrice / 5000) * 10 + 25;
  }

  const insuranceFee = useMemo(() => {
    if (!extraInsurance) return 0;
    const price = Number(insuredValue || 0);
    if (!Number.isFinite(price) || price <= 0) return 0;
    return calculateInsuranceFee(price);
  }, [extraInsurance, insuredValue]);
  const zipcodeSurcharge = useMemo(() => {
    const zip = recipient?.zipcode?.trim();
    if (!zip) return 0;
    return ZIPCODE_SURCHARGE_LIST.has(zip) ? 20 : 0;
  }, [recipient?.zipcode]);

  const phoneBlockMessage = useMemo(() => {
    if (loading || !sender || !recipient) return null;
    if (!isValidThaiPhone(sender.phone ?? "")) {
      return "เบอร์โทรผู้ส่งไม่ถูกต้อง กรุณากลับไปแก้ไขที่อยู่ผู้ส่ง";
    }
    if (!isValidThaiPhone(recipient.phone ?? "")) {
      return "เบอร์โทรผู้รับไม่ถูกต้อง กรุณากลับไปแก้ไขที่อยู่ผู้รับ";
    }
    return null;
  }, [loading, recipient, sender]);

  const isValidInput = useMemo(() => {
    const toPositive = (v: string) => Number(v) > 0;
    return Boolean(
      senderId &&
        recipientId &&
        parcelType.trim() &&
        toPositive(weightGram) &&
        toPositive(widthCm) &&
        toPositive(lengthCm) &&
        toPositive(heightCm) &&
        (!extraInsurance || toPositive(insuredValue)),
    );
  }, [extraInsurance, heightCm, insuredValue, lengthCm, parcelType, recipientId, senderId, weightGram, widthCm]);

  useEffect(() => {
    if (!isValidInput) {
      router.replace("/send");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [senderRes, recipientRes] = await Promise.all([
          fetch(`/api/sender-addresses/${encodeURIComponent(senderId)}`),
          fetch(`/api/recipient-addresses/${encodeURIComponent(recipientId)}`),
        ]);
        const senderJson = (await senderRes.json()) as { ok?: boolean; data?: SenderAddress; error?: string };
        const recipientJson = (await recipientRes.json()) as { ok?: boolean; data?: RecipientAddress; error?: string };
        if (cancelled) return;
        if (!senderRes.ok || !senderJson.ok || !senderJson.data) {
          setError(senderJson.error ?? "ไม่พบข้อมูลผู้ส่ง");
          return;
        }
        if (!recipientRes.ok || !recipientJson.ok || !recipientJson.data) {
          setError(recipientJson.error ?? "ไม่พบข้อมูลผู้รับ");
          return;
        }
        setSender(senderJson.data);
        setRecipient(recipientJson.data);
      } catch {
        if (!cancelled) setError("โหลดข้อมูลสรุปไม่สำเร็จ");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isValidInput, recipientId, router, senderId]);

  useEffect(() => {
    if (!recipient?.zipcode) return;
    const weight = Number(weightGram);
    if (!Number.isFinite(weight) || weight <= 0) return;

    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({
          productWeight: String(weight),
          cusZipcode: recipient.zipcode,
          productPrice: insuredValue && Number(insuredValue) > 0 ? insuredValue : "0",
          insurancePrice: extraInsurance && insuredValue && Number(insuredValue) > 0 ? insuredValue : "0",
        });
        let json: { ok?: boolean; data?: { estimatedTotal?: number } };
        let resOk = true;
        if (process.env.NEXT_PUBLIC_SMARTPOST_MOCK === "1") {
          const mockTotal = 50 + (Date.now() % 100);
          json = { ok: true, data: { estimatedTotal: mockTotal } };
        } else {
          const res = await fetch(`/api/pricing/estimate?${params.toString()}`);
          resOk = res.ok;
          json = (await res.json()) as { ok?: boolean; data?: { estimatedTotal?: number } };
        }
        if (!cancelled && resOk && json.ok && Number.isFinite(json.data?.estimatedTotal)) {
          const total = Number(json.data?.estimatedTotal);
          setBaseEstimatedPrice(total);
          setEstimatedPrice(total + zipcodeSurcharge);
        }
      } catch {
        // Keep fallback value when pricing API is unavailable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [extraInsurance, insuredValue, recipient?.zipcode, weightGram, zipcodeSurcharge]);

  async function onConfirmCreateOrder() {
    if (!sender || !recipient || submitting) return;
    if (phoneBlockMessage) return;
    setError(null);
    setSubmitting(true);
    try {
      let addItemJson: { ok?: boolean; error?: string; data?: unknown };
      if (process.env.NEXT_PUBLIC_SMARTPOST_MOCK === "1") {
        const ts = Date.now();
        addItemJson = {
          ok: true,
          data: {
            statuscode: "201",
            message: "OK (mock)",
            data: {
              smartpost_trackingcode: `MOCK${ts}`,
              barcode: `MOCKBC${ts}TH`,
              service_type: "EMS",
              product_inbox: parcelType,
              product_weight: String(weightGram),
              product_price: insuredValue || "0",
              shipper_name: sender.contactName,
              shipper_address: sender.addressLine,
              shipper_subdistrict: sender.tambon,
              shipper_district: sender.amphoe,
              shipper_province: sender.province,
              shipper_zipcode: sender.zipcode,
              shipper_email: "",
              shipper_mobile: sender.phone,
              cus_name: recipient.contactName,
              cus_add: recipient.addressLine,
              cus_sub: recipient.tambon,
              cus_amp: recipient.amphoe,
              cus_prov: recipient.province,
              cus_zipcode: recipient.zipcode,
              cus_tel: recipient.phone,
              cus_email: "",
              customer_code: "MOCK",
              cost: String(baseEstimatedPrice || 0),
              finalcost: String(baseEstimatedPrice || 0),
              order_status: "ACCEPTED",
              items: parcelType,
              insurance_rate_price: extraInsurance && insuredValue ? insuredValue : "0",
              reference_id: `mock-${ts}`,
            },
          },
        };
      } else {
        const addItemRes = await fetch("/api/smartpost/add-item", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderId,
            recipientId,
            parcelType,
            weightGram,
            insuredValue,
            extraInsurance,
          }),
        });
        addItemJson = (await addItemRes.json()) as { ok?: boolean; error?: string; data?: unknown };
        if (!addItemRes.ok || !addItemJson.ok) {
          setError(addItemJson.error ?? "ส่งคำสั่งซื้อไป Smartpost ไม่สำเร็จ");
          return;
        }
      }

      const res = await fetch("/api/parcels/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderId,
          recipientId,
          shippingMode,
          autoPrint,
          weightGram,
          widthCm,
          lengthCm,
          heightCm,
          parcelType,
          note,
          estimatedPrice: baseEstimatedPrice > 0 ? baseEstimatedPrice.toFixed(2) : undefined,
          smartpostAddItemResponse: addItemJson.data,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; data?: { id?: string; trackingId?: string }; error?: string };
      if (!res.ok || !json.ok || !json.data?.id) {
        setError(json.error ?? "สร้างออเดอร์ไม่สำเร็จ");
        return;
      }
      router.replace(`/pay/${json.data.id}`);
    } catch {
      setError("สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-36">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <Link
            href={`/send?${searchParams.toString()}`}
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
            aria-label="กลับไปแก้ไขรายละเอียดพัสดุ"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </Link>
          <h1 className="text-3xl font-bold leading-none">สรุปคำสั่งซื้อ</h1>
          <p className="mt-1 text-sm text-white/80">ตรวจสอบข้อมูลก่อนสร้างออเดอร์</p>
        </div>
      </section>

      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          {phoneBlockMessage || error ? (
            <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {phoneBlockMessage ? <p>{phoneBlockMessage}</p> : null}
              {error ? <p>{error}</p> : null}
            </div>
          ) : null}
          <div className="rounded-lg bg-white p-4 shadow-sm">
            {loading ? (
              <ReviewOrderSummarySkeleton />
            ) : (
              <div className="space-y-4 text-sm text-slate-800">
                <div className="grid grid-cols-2 gap-3">
                  <div className="min-w-0 rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">ผู้ส่ง</p>
                    <p className="mt-1 break-words font-medium">{sender?.contactName} | {sender?.phone}</p>
                    <p className="mt-1 break-words text-xs text-slate-500">{sender ? formatAddress(sender) : "-"}</p>
                  </div>
                  <div className="min-w-0 rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-medium text-slate-500">ผู้รับ</p>
                    <p className="mt-1 break-words font-medium">{recipient?.contactName} | {recipient?.phone}</p>
                    <p className="mt-1 break-words text-xs text-slate-500">{recipient ? formatAddress(recipient) : "-"}</p>
                  </div>
                </div>

                <div className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
                  <p className="shrink-0 text-xs font-medium text-slate-500">วันที่สร้างคำสั่งซื้อ</p>
                  <p className="min-w-0 flex-1 text-right font-medium leading-snug text-slate-900">{formatDateTime(orderCreatedAt)}</p>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-xs font-medium text-slate-500">รายละเอียดพัสดุ</p>
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <p className="text-slate-500">รูปแบบการส่ง</p>
                    <p className="text-right font-medium">{shippingMode === "pickup" ? "เรียกรถรับพัสดุ" : "ส่งที่สาขาไปรษณีย์ไทย"}</p>
                    <p className="text-slate-500">พิมพ์ใบปะหน้า</p>
                    <p className="text-right font-medium">{autoPrint ? "อัตโนมัติ" : "ปิด"}</p>
                    <p className="text-slate-500">ซื้อประกันเพิ่ม</p>
                    <p className="text-right font-medium">{extraInsurance ? "ซื้อ" : "ไม่ซื้อ"}</p>
                    {extraInsurance ? (
                      <>
                        <p className="text-slate-500">มูลค่าพัสดุ</p>
                        <p className="text-right font-medium">{Number(insuredValue || 0).toLocaleString("th-TH")} บาท</p>
                        <p className="text-slate-500">ค่าประกันเพิ่ม</p>
                        <p className="text-right font-medium">{insuranceFee.toLocaleString("th-TH")} บาท</p>
                      </>
                    ) : null}
                    <p className="text-slate-500">น้ำหนัก</p>
                    <p className="text-right font-medium">{weightGram} กรัม</p>
                    <p className="text-slate-500">ขนาด</p>
                    <p className="text-right font-medium">
                      {widthCm} x {lengthCm} x {heightCm} ซม.
                    </p>
                    <p className="text-slate-500">ประเภทพัสดุ</p>
                    <p className="text-right font-medium">{parcelType}</p>
                    {note ? (
                      <>
                        <p className="text-slate-500">หมายเหตุ</p>
                        <p className="text-right font-medium">{note}</p>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-500">ราคา</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-slate-600">ราคาพื้นฐาน</p>
                      <p className="font-medium text-slate-800">{baseEstimatedPrice.toLocaleString("th-TH")} บาท</p>
                    </div>
                    {zipcodeSurcharge > 0 ? (
                      <div className="flex items-center justify-between">
                        <p className="text-slate-600">ค่าบริการพื้นที่ห่างไกล</p>
                        <p className="font-medium text-slate-800">{zipcodeSurcharge.toLocaleString("th-TH")} บาท</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                    <p className="text-sm text-slate-600">ราคารวมโดยประมาณ</p>
                    <p className="text-lg font-semibold text-slate-900">{estimatedPrice.toLocaleString("th-TH")} บาท</p>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">*ราคานี้เป็นราคาประมาณ ราคาจริงจะแสดงเมื่อลูกค้าอัปเดตน้ำหนักที่แท้จริง ณ สาขาไปรษณีย์</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 bg-slate-100 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-6px_20px_rgba(15,23,42,0.08)]">
        <div className="mx-auto w-full max-w-lg">
          <button
            type="button"
            disabled={loading || submitting || !sender || !recipient || Boolean(phoneBlockMessage)}
            onClick={onConfirmCreateOrder}
            className="w-full rounded-full bg-[#2726F5] px-6 py-3 text-base font-semibold text-white shadow-[0_6px_14px_rgba(39,38,245,0.35)] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
          >
            {submitting ? "กำลังสร้างออเดอร์..." : "ยืนยันสร้างออเดอร์"}
          </button>
        </div>
      </div>
    </main>
  );
}

function ReviewPageShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 pb-36">
      <section className="bg-[#2726F5] px-6 pb-14 pt-10 text-white">
        <div className="mx-auto w-full max-w-lg">
          <div className="mb-3 h-8 w-24 animate-pulse rounded-full bg-white/20" />
          <div className="h-9 w-48 animate-pulse rounded-md bg-white/20" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded-md bg-white/15" />
        </div>
      </section>
      <section className="-mt-8 px-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          <div className="rounded-lg bg-white p-4 shadow-sm">{children}</div>
        </div>
      </section>
      <div className="fixed inset-x-0 bottom-0 z-30 bg-slate-100 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 shadow-[0_-6px_20px_rgba(15,23,42,0.08)]">
        <div className="mx-auto w-full max-w-lg">
          <div className="h-12 w-full animate-pulse rounded-full bg-slate-300" />
        </div>
      </div>
    </main>
  );
}

export default function SendReviewPage() {
  return (
    <Suspense
      fallback={
        <ReviewPageShell>
          <ReviewOrderSummarySkeleton />
        </ReviewPageShell>
      }
    >
      <ReviewInner />
    </Suspense>
  );
}

