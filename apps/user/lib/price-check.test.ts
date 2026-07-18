import { describe, expect, it } from "vitest";
import { calculatePriceCheckBreakdown } from "./price-check";

describe("calculatePriceCheckBreakdown", () => {
  it("returns the base price for a regular destination", () => {
    expect(calculatePriceCheckBreakdown(45, "10500")).toEqual({
      basePrice: 45,
      remoteAreaFee: 0,
      estimatedTotal: 45,
    });
  });

  it("adds the existing 20 baht remote-area surcharge", () => {
    expect(calculatePriceCheckBreakdown(45, "83000")).toEqual({
      basePrice: 45,
      remoteAreaFee: 20,
      estimatedTotal: 65,
    });
  });

  it("trims the destination zipcode", () => {
    expect(calculatePriceCheckBreakdown(50, " 83000 ").estimatedTotal).toBe(70);
  });

  it("rejects invalid base prices", () => {
    expect(() => calculatePriceCheckBreakdown(Number.NaN, "10500")).toThrow("Invalid base price");
    expect(() => calculatePriceCheckBreakdown(-1, "10500")).toThrow("Invalid base price");
  });
});
