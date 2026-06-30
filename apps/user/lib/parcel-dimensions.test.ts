import { describe, it, expect } from "vitest";
import {
  parsePositiveCm,
  validateParcelSideCm,
  validateParcelDimensionsCm,
  validateParcelDimensionsFromStrings,
  validateWeightGram,
  MAX_PARCEL_SIDE_CM,
  MAX_PARCEL_DIMENSIONS_SUM_CM,
  MIN_PARCEL_WEIGHT_GRAM,
  MAX_PARCEL_WEIGHT_GRAM,
} from "./parcel-dimensions";

describe("parsePositiveCm", () => {
  it("returns null for undefined", () => {
    expect(parsePositiveCm(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parsePositiveCm("")).toBeNull();
  });

  it("returns null for zero", () => {
    expect(parsePositiveCm(0)).toBeNull();
  });

  it("returns null for negative", () => {
    expect(parsePositiveCm(-5)).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(parsePositiveCm("abc")).toBeNull();
  });

  it("returns null for NaN", () => {
    expect(parsePositiveCm("NaN")).toBeNull();
  });

  it("parses positive numeric string", () => {
    expect(parsePositiveCm("30")).toBe(30);
  });

  it("parses positive number", () => {
    expect(parsePositiveCm(60)).toBe(60);
  });

  it("parses decimal", () => {
    expect(parsePositiveCm("30.5")).toBe(30.5);
  });
});

describe("validateParcelSideCm", () => {
  it("returns null for empty string (no value yet)", () => {
    expect(validateParcelSideCm("")).toBeNull();
  });

  it("returns null for valid side at boundary (60cm)", () => {
    expect(validateParcelSideCm("60")).toBeNull();
  });

  it("returns null for valid side below max (59cm)", () => {
    expect(validateParcelSideCm("59")).toBeNull();
  });

  it("returns null for valid side (1cm)", () => {
    expect(validateParcelSideCm("1")).toBeNull();
  });

  it("returns error message for side exceeding max (60.1cm)", () => {
    const result = validateParcelSideCm("60.1");
    expect(result).toBeTypeOf("string");
    expect(result).toContain("60");
  });

  it("returns error message for side at 70cm", () => {
    const result = validateParcelSideCm("70");
    expect(result).toBeTypeOf("string");
  });

  it("returns null for zero (treated as empty)", () => {
    expect(validateParcelSideCm("0")).toBeNull();
  });

  it("returns null for non-numeric (treated as empty/null)", () => {
    expect(validateParcelSideCm("abc")).toBeNull();
  });
});

describe("validateParcelDimensionsCm", () => {
  it("returns null for dimensions within all limits", () => {
    expect(validateParcelDimensionsCm({ widthCm: 30, lengthCm: 30, heightCm: 30 })).toBeNull();
  });

  it("returns null for all sides exactly at max (60cm each, sum 180 > 120 — BUT per-side checked first)", () => {
    // All sides = 60cm is valid per-side, but sum = 180 > 120, so sum error triggers
    const result = validateParcelDimensionsCm({ widthCm: 60, lengthCm: 60, heightCm: 60 });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("120");
  });

  it("returns null for dimensions exactly at sum boundary (120cm total)", () => {
    expect(validateParcelDimensionsCm({ widthCm: 40, lengthCm: 40, heightCm: 40 })).toBeNull();
  });

  it("returns error for sum exactly 1cm over limit (121cm)", () => {
    const result = validateParcelDimensionsCm({ widthCm: 41, lengthCm: 40, heightCm: 40 });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("120");
  });

  it("returns per-side error when one side exceeds max before checking sum", () => {
    const result = validateParcelDimensionsCm({ widthCm: 61, lengthCm: 10, heightCm: 10 });
    expect(result).toBeTypeOf("string");
    expect(result).toContain("60");
  });

  it("returns per-side error when height exceeds max", () => {
    const result = validateParcelDimensionsCm({ widthCm: 10, lengthCm: 10, heightCm: 61 });
    expect(result).toBeTypeOf("string");
  });

  it("valid: sides at 40/40/40 = sum 120 (exactly at limit)", () => {
    expect(validateParcelDimensionsCm({ widthCm: 40, lengthCm: 40, heightCm: 40 })).toBeNull();
  });

  it("valid: tiny parcel 1x1x1", () => {
    expect(validateParcelDimensionsCm({ widthCm: 1, lengthCm: 1, heightCm: 1 })).toBeNull();
  });
});

describe("validateParcelDimensionsFromStrings", () => {
  it("returns null for valid dimensions", () => {
    expect(validateParcelDimensionsFromStrings("20", "20", "20")).toBeNull();
  });

  it("returns incomplete error when one side is missing", () => {
    const result = validateParcelDimensionsFromStrings("20", "", "20");
    expect(result).toBeTypeOf("string");
    expect(result).toContain("กรุณาระบุ");
  });

  it("returns incomplete error when all sides are empty", () => {
    const result = validateParcelDimensionsFromStrings("", "", "");
    expect(result).toBeTypeOf("string");
  });

  it("returns side error when one side exceeds max", () => {
    const result = validateParcelDimensionsFromStrings("70", "20", "20");
    expect(result).toBeTypeOf("string");
    expect(result).toContain("60");
  });

  it("returns sum error when sum exceeds 120", () => {
    const result = validateParcelDimensionsFromStrings("45", "40", "40");
    expect(result).toBeTypeOf("string");
    expect(result).toContain("120");
  });

  it("handles decimal string inputs", () => {
    expect(validateParcelDimensionsFromStrings("30.5", "30.5", "30")).toBeNull();
  });
});

describe("validateWeightGram", () => {
  it("returns null for weight exactly at minimum (10g)", () => {
    expect(validateWeightGram(String(MIN_PARCEL_WEIGHT_GRAM))).toBeNull();
  });

  it("returns null for weight exactly at maximum (30000g)", () => {
    expect(validateWeightGram(String(MAX_PARCEL_WEIGHT_GRAM))).toBeNull();
  });

  it("returns null for weight in valid range (500g)", () => {
    expect(validateWeightGram("500")).toBeNull();
  });

  it("returns error for weight below minimum (9g)", () => {
    const result = validateWeightGram("9");
    expect(result).toBeTypeOf("string");
    expect(result).toContain("10");
  });

  it("returns error for weight of 1g", () => {
    const result = validateWeightGram("1");
    expect(result).toBeTypeOf("string");
  });

  it("returns error for weight exceeding maximum (30001g)", () => {
    const result = validateWeightGram("30001");
    expect(result).toBeTypeOf("string");
    expect(result).toContain("30");
  });

  it("returns error for empty string", () => {
    const result = validateWeightGram("");
    expect(result).toBeTypeOf("string");
  });

  it("returns error for non-numeric input", () => {
    const result = validateWeightGram("abc");
    expect(result).toBeTypeOf("string");
  });

  it("returns error for zero", () => {
    const result = validateWeightGram("0");
    expect(result).toBeTypeOf("string");
  });

  it("returns error for negative weight", () => {
    const result = validateWeightGram("-100");
    expect(result).toBeTypeOf("string");
  });

  it("accepts custom min/max overrides", () => {
    expect(validateWeightGram("5", 1, 10)).toBeNull();
    expect(validateWeightGram("11", 1, 10)).toBeTypeOf("string");
  });

  it("returns error for weight of 50kg (50000g > max)", () => {
    const result = validateWeightGram("50000");
    expect(result).toBeTypeOf("string");
    expect(result).toContain("30");
  });
});

describe("constants", () => {
  it("MAX_PARCEL_SIDE_CM is 60", () => {
    expect(MAX_PARCEL_SIDE_CM).toBe(60);
  });

  it("MAX_PARCEL_DIMENSIONS_SUM_CM is 120", () => {
    expect(MAX_PARCEL_DIMENSIONS_SUM_CM).toBe(120);
  });

  it("MIN_PARCEL_WEIGHT_GRAM is 10", () => {
    expect(MIN_PARCEL_WEIGHT_GRAM).toBe(10);
  });

  it("MAX_PARCEL_WEIGHT_GRAM is 30000", () => {
    expect(MAX_PARCEL_WEIGHT_GRAM).toBe(30_000);
  });
});
