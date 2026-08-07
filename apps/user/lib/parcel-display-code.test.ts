import { describe, expect, it } from "vitest";
import {
  normalizeCarrierBarcode,
  resolveParcelDisplayCode,
} from "@quickload/shared/parcel-display-code";
import { parcelCreatedTemplate } from "../../admin/lib/internal-line-alerts/templates";

describe("carrier barcode contract", () => {
  it.each(["WA123456789TH", "WB123456789TH", "JB123456789TH", "ZZ-FUTURE-001"])(
    "accepts %s without prefix-specific logic",
    (barcode) => {
      expect(normalizeCarrierBarcode(` ${barcode.toLowerCase()} `)).toBe(barcode);
      expect(
        resolveParcelDisplayCode({
          barcode,
          smartpostTrackingcode: "NO48-REFERENCE",
          trackingId: "internal-id",
        }),
      ).toBe(barcode);
    },
  );

  it("uses references only as a customer-facing fallback when no barcode exists", () => {
    expect(
      resolveParcelDisplayCode({
        barcode: " ",
        smartpostTrackingcode: "NO48-REFERENCE",
        trackingId: "internal-id",
      }),
    ).toBe("NO48-REFERENCE");
  });
});

describe("admin parcel-created identifier semantics", () => {
  it("labels the opaque carrier barcode and SmartPost reference separately", () => {
    const message = parcelCreatedTemplate({
      parcelId: "parcel-1",
      barcode: "WA123456789TH",
      referenceCode: "NO48-REFERENCE",
    });

    expect(message).toContain("Barcode: WA123456789TH");
    expect(message).toContain("SmartPost reference: NO48-REFERENCE");
    expect(message).not.toContain("Tracking: NO48-REFERENCE");
  });

  it("makes a missing barcode impossible to overlook", () => {
    const message = parcelCreatedTemplate({
      parcelId: "parcel-2",
      referenceCode: "NO48-REFERENCE",
    });

    expect(message).toContain("Barcode: ⚠️ MISSING");
    expect(message).toContain("SmartPost reference: NO48-REFERENCE");
  });
});
