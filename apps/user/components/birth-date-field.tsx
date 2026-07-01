"use client";

import {
  beToCeYear,
  birthYearOptions,
  ceToBeYear,
  daysInMonth,
  formatIsoDate,
  isValidBirthDateParts,
  parseIsoDate,
  THAI_MONTHS,
} from "@/lib/thai-birth-date";
import { useEffect, useMemo, useState } from "react";

const SELECT_CLASS =
  "w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 outline-none transition focus:border-[#2726F5]";

type BirthDateFieldProps = {
  value: string;
  onChange: (isoDate: string) => void;
  required?: boolean;
};

function emitChange(
  day: number | null,
  month: number | null,
  ceYear: number | null,
  onChange: (isoDate: string) => void,
) {
  if (day == null || month == null || ceYear == null) {
    onChange("");
    return;
  }
  if (!isValidBirthDateParts(ceYear, month, day)) {
    onChange("");
    return;
  }
  onChange(formatIsoDate(ceYear, month, day));
}

export function BirthDateField({ value, onChange, required }: BirthDateFieldProps) {
  const [day, setDay] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [ceYear, setCeYear] = useState<number | null>(null);

  useEffect(() => {
    const parsed = parseIsoDate(value);
    if (parsed) {
      setDay(parsed.day);
      setMonth(parsed.month);
      setCeYear(parsed.ceYear);
      return;
    }
    if (!value) {
      setDay(null);
      setMonth(null);
      setCeYear(null);
    }
  }, [value]);

  const yearOptions = useMemo(() => birthYearOptions(), []);

  const dayOptions = useMemo(() => {
    const maxDay =
      month != null && ceYear != null ? daysInMonth(ceYear, month) : 31;
    return Array.from({ length: maxDay }, (_, i) => i + 1);
  }, [month, ceYear]);

  function updateDay(nextDay: number | null) {
    setDay(nextDay);
    emitChange(nextDay, month, ceYear, onChange);
  }

  function updateMonth(nextMonth: number | null) {
    let nextDay = day;
    if (nextMonth != null && ceYear != null && nextDay != null) {
      const maxDay = daysInMonth(ceYear, nextMonth);
      if (nextDay > maxDay) nextDay = maxDay;
    }
    setMonth(nextMonth);
    setDay(nextDay);
    emitChange(nextDay, nextMonth, ceYear, onChange);
  }

  function updateCeYear(nextCeYear: number | null) {
    let nextDay = day;
    if (nextCeYear != null && month != null && nextDay != null) {
      const maxDay = daysInMonth(nextCeYear, month);
      if (nextDay > maxDay) nextDay = maxDay;
    }
    setCeYear(nextCeYear);
    setDay(nextDay);
    emitChange(nextDay, month, nextCeYear, onChange);
  }

  const beYearValue = ceYear != null ? String(ceToBeYear(ceYear)) : "";

  return (
    <div className="mt-1">
      <div className="grid grid-cols-3 gap-2">
        <label className="block min-w-0">
          <span className="sr-only">วัน</span>
          <select
            data-testid="birth-date-day"
            className={SELECT_CLASS}
            value={day ?? ""}
            required={required}
            onChange={(e) => {
              const raw = e.target.value;
              updateDay(raw ? Number(raw) : null);
            }}
          >
            <option value="">วัน</option>
            {dayOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="sr-only">เดือน</span>
          <select
            data-testid="birth-date-month"
            className={SELECT_CLASS}
            value={month ?? ""}
            required={required}
            onChange={(e) => {
              const raw = e.target.value;
              updateMonth(raw ? Number(raw) : null);
            }}
          >
            <option value="">เดือน</option>
            {THAI_MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="sr-only">ปี พ.ศ.</span>
          <select
            data-testid="birth-date-year"
            className={SELECT_CLASS}
            value={beYearValue}
            required={required}
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) {
                updateCeYear(null);
                return;
              }
              updateCeYear(beToCeYear(Number(raw)));
            }}
          >
            <option value="">พ.ศ.</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <input type="hidden" name="birthDate" value={value} required={required} readOnly />
    </div>
  );
}
