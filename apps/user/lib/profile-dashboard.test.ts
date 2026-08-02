import { describe, expect, it } from "vitest";
import {
  formatShortQuickloadId,
  shouldCountProfilePickup,
} from "./profile-dashboard";

describe("formatShortQuickloadId", () => {
  it("uses the first eight uppercase UUID characters", () => {
    expect(formatShortQuickloadId("7f3a91c2-0d2c-4db9-b9bc-a3419c16e10a")).toBe(
      "QL-7F3A91C2",
    );
  });

  it("has a stable fallback when the id is unavailable", () => {
    expect(formatShortQuickloadId(null)).toBe("QL-MEMBER");
  });
});

describe("shouldCountProfilePickup", () => {
  it.each(["submitting", "requested", "assigned", "picked_up", "unknown"])(
    "counts %s pickup requests",
    (status) => {
      expect(shouldCountProfilePickup(status)).toBe(true);
    },
  );

  it.each(["failed", "cancelled"])("excludes %s pickup requests", (status) => {
    expect(shouldCountProfilePickup(status)).toBe(false);
  });
});
