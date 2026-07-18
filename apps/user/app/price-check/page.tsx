"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  formatThaiLocation,
  ThaiLocationCombobox,
  type ThaiLocationRow,
} from "@/components/thai-location-combobox";
import { validateParcelDimensionsFromStrings, validateWeightGram } from "@/lib/parcel-dimensions";
import { calculatePriceCheckBreakdown, type PriceCheckBreakdown } from "@/lib/price-check";

type PriceCheckErrors = {
  origin?: string;
  destination?: string;
  weight?: string;
  dimensions?: string;
};

const LOCATION_COPY = {
  searching: "กำลังค้นหา...",
  noResults: "ไม่พบพื้นที่ที่ค้นหา",
};

const SYSTEM_PRICE_NOTE =
  "*ราคานี้เป็นราคาประมาณ ราคาจริงจะแสดงเมื่อลูกค้าอัปเดตน้ำหนักที่แท้จริง ณ สาขาไปรษณีย์";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-500 focus:border-[#2726F5] focus:ring-1 focus:ring-[#2726F5] disabled:bg-slate-100 disabled:text-slate-500";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function formatBaht(value: number) {
  return `${value.toLocaleString("th-TH")} บาท`;
}

export default function PriceCheckPage() {
  const [originQuery, setOriginQuery] = useState("");
  const [origin, setOrigin] = useState<ThaiLocationRow | null>(null);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destination, setDestination] = useState<ThaiLocationRow | null>(null);
  const [weightGram, setWeightGram] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [errors, setErrors] = useState<PriceCheckErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<PriceCheckBreakdown | null>(null);
  const [calculating, setCalculating] = useState(false);
  const priceRequestRef = useRef<AbortController | null>(null);
  const requestVersionRef = useRef(0);
  const resultSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    return () => priceRequestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!result) return;
    const frame = window.requestAnimationFrame(() => {
      resultSectionRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [result]);

  function invalidateResult() {
    requestVersionRef.current += 1;
    priceRequestRef.current?.abort();
    priceRequestRef.current = null;
    setCalculating(false);
    setResult(null);
    setFormError(null);
  }

  function focusFirstError(nextErrors: PriceCheckErrors) {
    const firstErrorId = nextErrors.origin
      ? "price-origin"
      : nextErrors.destination
        ? "price-destination"
        : nextErrors.weight
          ? "price-weight"
          : "price-width";
    window.setTimeout(() => {
      const target = document.getElementById(firstErrorId);
      target?.focus();
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }

  async function calculatePrice(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setResult(null);

    const nextErrors: PriceCheckErrors = {};
    if (!origin) nextErrors.origin = "กรุณาเลือกต้นทางจากผลการค้นหา";
    if (!destination) nextErrors.destination = "กรุณาเลือกปลายทางจากผลการค้นหา";

    const weightError = validateWeightGram(weightGram);
    if (weightError) nextErrors.weight = weightError;

    const dimensionsError = validateParcelDimensionsFromStrings(widthCm, lengthCm, heightCm);
    if (dimensionsError) nextErrors.dimensions = dimensionsError;

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      focusFirstError(nextErrors);
      return;
    }
    if (!destination) return;

    priceRequestRef.current?.abort();
    const controller = new AbortController();
    priceRequestRef.current = controller;
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    setCalculating(true);

    try {
      const params = new URLSearchParams({ productWeight: weightGram });
      const response = await fetch(`/api/pricing/estimate?${params.toString()}`, {
        signal: controller.signal,
      });
      const body = (await response.json()) as {
        ok?: boolean;
        data?: { estimatedTotal?: number };
        error?: string;
      };

      if (!response.ok || !body.ok || !Number.isFinite(body.data?.estimatedTotal)) {
        throw new Error(body.error ?? "คำนวณราคาไม่สำเร็จ");
      }
      if (controller.signal.aborted || requestVersionRef.current !== requestVersion) return;

      setResult(calculatePriceCheckBreakdown(Number(body.data?.estimatedTotal), destination.zipcode));
    } catch (error) {
      if (controller.signal.aborted || requestVersionRef.current !== requestVersion) return;
      setFormError(error instanceof Error ? error.message : "คำนวณราคาไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      window.clearTimeout(timeout);
      if (priceRequestRef.current === controller) {
        priceRequestRef.current = null;
        setCalculating(false);
      }
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 pb-28">
      <section className="bg-[#2726F5] px-6 pb-20 pt-8 text-white">
        <div className="mx-auto w-full max-w-lg">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-[#2726F5]"
            aria-label="กลับไปหน้าแรก"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </Link>
          <h1 className="text-3xl font-bold leading-tight">เช็กราคา</h1>
          <p className="mt-0.5 text-sm text-white/85">ประเมินค่าจัดส่งก่อนสร้างรายการพัสดุ</p>
        </div>
      </section>

      <section className="-mt-12 px-6">
        <div className="mx-auto w-full max-w-lg space-y-5">
          <form
            noValidate
            onSubmit={(event) => void calculatePrice(event)}
            className="space-y-5 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200"
          >
            <ThaiLocationCombobox
              id="price-origin"
              label="1. ต้นทาง"
              hint="ค้นหาด้วยตำบล อำเภอ จังหวัด หรือรหัสไปรษณีย์"
              placeholder="เช่น 10500 หรือ บางรัก"
              query={originQuery}
              selected={origin}
              onQueryChange={(value) => {
                invalidateResult();
                setOriginQuery(value);
                setOrigin(null);
                setErrors((current) => ({ ...current, origin: undefined }));
              }}
              onSelect={(row) => {
                invalidateResult();
                setOrigin(row);
                setOriginQuery(formatThaiLocation(row));
                setErrors((current) => ({ ...current, origin: undefined }));
              }}
              onClear={() => {
                invalidateResult();
                setOrigin(null);
                setOriginQuery("");
                setErrors((current) => ({ ...current, origin: undefined }));
              }}
              copy={LOCATION_COPY}
              disabled={calculating}
              error={errors.origin}
              required
              inputClassName={inputClass}
            />

            <ThaiLocationCombobox
              id="price-destination"
              label="2. ปลายทาง"
              hint="รหัสไปรษณีย์ปลายทางใช้ตรวจสอบค่าพื้นที่ห่างไกล"
              placeholder="เช่น 83000 หรือ เมืองภูเก็ต"
              query={destinationQuery}
              selected={destination}
              onQueryChange={(value) => {
                invalidateResult();
                setDestinationQuery(value);
                setDestination(null);
                setErrors((current) => ({ ...current, destination: undefined }));
              }}
              onSelect={(row) => {
                invalidateResult();
                setDestination(row);
                setDestinationQuery(formatThaiLocation(row));
                setErrors((current) => ({ ...current, destination: undefined }));
              }}
              onClear={() => {
                invalidateResult();
                setDestination(null);
                setDestinationQuery("");
                setErrors((current) => ({ ...current, destination: undefined }));
              }}
              copy={LOCATION_COPY}
              disabled={calculating}
              error={errors.destination}
              required
              inputClassName={inputClass}
            />

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="price-weight" className="shrink-0 text-sm font-semibold text-slate-800">
                  น้ำหนัก<span className="text-red-500">*</span>
                </label>
                <span id="price-weight-hint" className="text-right text-xs text-slate-600">
                  ระบุระหว่าง 10–30,000 กรัม
                </span>
              </div>
              <div
                className={`mt-1 flex items-stretch overflow-hidden rounded-lg border bg-white ${
                  errors.weight ? "border-red-500 ring-1 ring-red-500/20" : "border-slate-300"
                }`}
              >
                <input
                  id="price-weight"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={weightGram}
                  onChange={(event) => {
                    invalidateResult();
                    setWeightGram(digitsOnly(event.target.value));
                    setErrors((current) => ({ ...current, weight: undefined }));
                  }}
                  aria-invalid={Boolean(errors.weight)}
                  aria-describedby={errors.weight ? "price-weight-error" : "price-weight-hint"}
                  placeholder="0"
                  disabled={calculating}
                  className="min-w-0 flex-1 px-4 py-3 text-base text-slate-900 outline-none placeholder:text-slate-500 disabled:bg-slate-100"
                />
                <span className="flex items-center border-l border-slate-200 bg-slate-50 px-4 text-sm font-medium text-slate-600">
                  กรัม
                </span>
              </div>
              {errors.weight ? (
                <p id="price-weight-error" role="alert" className="mt-1 text-sm text-red-600">
                  {errors.weight}
                </p>
              ) : null}
            </div>

            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">
                ขนาดพัสดุ<span className="text-red-500">*</span>
              </legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { id: "price-width", label: "กว้าง (ซม.)", value: widthCm, setValue: setWidthCm },
                  { id: "price-length", label: "ยาว (ซม.)", value: lengthCm, setValue: setLengthCm },
                  { id: "price-height", label: "สูง (ซม.)", value: heightCm, setValue: setHeightCm },
                ].map((field) => (
                  <label key={field.id} htmlFor={field.id} className="min-w-0 text-xs font-medium text-slate-700">
                    {field.label}
                    <input
                      id={field.id}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={field.value}
                      onChange={(event) => {
                        invalidateResult();
                        field.setValue(digitsOnly(event.target.value));
                        setErrors((current) => ({ ...current, dimensions: undefined }));
                      }}
                      aria-invalid={Boolean(errors.dimensions)}
                      aria-describedby={errors.dimensions ? "price-dimensions-error" : undefined}
                      placeholder="0"
                      disabled={calculating}
                      className={`mt-1 w-full rounded-lg border bg-white px-2 py-3 text-center text-base text-slate-900 outline-none placeholder:text-slate-500 focus:border-[#2726F5] focus:ring-1 focus:ring-[#2726F5] disabled:bg-slate-100 ${
                        errors.dimensions ? "border-red-500 ring-1 ring-red-500/20" : "border-slate-300"
                      }`}
                    />
                  </label>
                ))}
              </div>
              {errors.dimensions ? (
                <p id="price-dimensions-error" role="alert" className="mt-2 text-sm text-red-600">
                  {errors.dimensions}
                </p>
              ) : null}
            </fieldset>

            {formError ? (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={calculating}
              className="inline-flex w-full items-center justify-center rounded-lg bg-[#2726F5] px-5 py-3 text-base font-semibold text-white transition hover:bg-[#1f1ed0] focus:outline-none focus:ring-2 focus:ring-[#2726F5] focus:ring-offset-2 active:bg-[#1918b8] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {calculating ? "กำลังคำนวณ..." : "คำนวณราคา"}
            </button>
          </form>

          <section ref={resultSectionRef} aria-labelledby="price-result-heading" className="scroll-mt-4 pb-4">
            <h2 id="price-result-heading" className="mb-2 px-1 text-base font-semibold text-slate-900">
              ค่าใช้จ่ายโดยประมาณ
            </h2>
            {result ? (
              <div aria-live="polite" className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <dl className="space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-600">ราคาพื้นฐาน</dt>
                    <dd className="font-medium text-slate-900">{formatBaht(result.basePrice)}</dd>
                  </div>
                  {result.remoteAreaFee > 0 ? (
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-slate-600">ค่าบริการพื้นที่ห่างไกล</dt>
                      <dd className="font-medium text-slate-900">{formatBaht(result.remoteAreaFee)}</dd>
                    </div>
                  ) : null}
                  <div className="flex items-end justify-between gap-4 border-t border-slate-200 pt-3">
                    <dt className="font-medium text-slate-700">ราคารวมโดยประมาณ</dt>
                    <dd className="text-xl font-bold text-[#2726F5]">{formatBaht(result.estimatedTotal)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-slate-600">{SYSTEM_PRICE_NOTE}</p>
              </div>
            ) : (
              <div aria-live="polite" className="rounded-lg border border-slate-300 bg-white px-5 py-6 text-center">
                <p className="text-sm font-medium text-slate-700">กรอกข้อมูลให้ครบแล้วกดคำนวณราคา</p>
                <p className="mt-1 text-xs text-slate-600">ผลลัพธ์จะอ้างอิงน้ำหนักและรหัสไปรษณีย์ปลายทาง</p>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
