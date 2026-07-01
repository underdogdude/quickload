import { describe, expect, it } from "vitest";
import {
  beToCeYear,
  birthYearOptions,
  ceToBeYear,
  daysInMonth,
  formatIsoDate,
  isValidBirthDateParts,
  parseIsoDate,
} from "./thai-birth-date";

describe("thai-birth-date conversions", () => {
  it("converts CE ↔ BE years", () => {
    expect(ceToBeYear(1990)).toBe(2533);
    expect(beToCeYear(2533)).toBe(1990);
  });
});

describe("parseIsoDate / formatIsoDate", () => {
  it("round-trips valid ISO dates", () => {
    expect(parseIsoDate("1990-05-15")).toEqual({ ceYear: 1990, month: 5, day: 15 });
    expect(formatIsoDate(1990, 5, 15)).toBe("1990-05-15");
  });

  it("rejects invalid ISO strings", () => {
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("1990-13-01")).toBeNull();
    expect(parseIsoDate("1990-02-30")).toBeNull();
  });
});

describe("isValidBirthDateParts", () => {
  const now = new Date(2026, 6, 1); // 2026-07-01 local

  it("accepts valid past dates", () => {
    expect(isValidBirthDateParts(1990, 1, 1, now)).toBe(true);
    expect(isValidBirthDateParts(2026, 7, 1, now)).toBe(true);
  });

  it("rejects future dates and out-of-range years", () => {
    expect(isValidBirthDateParts(2026, 7, 2, now)).toBe(false);
    expect(isValidBirthDateParts(1919, 1, 1, now)).toBe(false);
    expect(isValidBirthDateParts(2027, 1, 1, now)).toBe(false);
  });

  it("handles leap years", () => {
    expect(isValidBirthDateParts(2000, 2, 29, now)).toBe(true);
    expect(isValidBirthDateParts(1900, 2, 29, now)).toBe(false);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2001, 2)).toBe(28);
  });
});

describe("birthYearOptions", () => {
  it("returns descending BE years", () => {
    const years = birthYearOptions(new Date(2026, 0, 1));
    expect(years[0]).toBe(2569);
    expect(years[years.length - 1]).toBe(2463);
  });
});
