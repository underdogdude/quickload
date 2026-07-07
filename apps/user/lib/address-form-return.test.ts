import { describe, expect, it } from "vitest";
import {
  buildAddressFormAfterSaveHref,
  buildAddressFormBackHref,
  buildAddressFormHref,
  isAddressFormFromAddresses,
} from "./address-form-return";

function params(input: Record<string, string>) {
  return {
    get: (key: string) => input[key] ?? null,
  };
}

describe("address-form-return", () => {
  it("builds address book edit links with from=addresses", () => {
    expect(buildAddressFormHref("sender", { id: "abc", fromAddresses: true, tab: "sender" })).toBe(
      "/send/sender?id=abc&from=addresses&tab=sender",
    );
    expect(buildAddressFormHref("recipient", { fromAddresses: true, tab: "recipient" })).toBe(
      "/send/recipient?from=addresses&tab=recipient",
    );
  });

  it("returns /send when not from addresses", () => {
    expect(buildAddressFormBackHref("sender", params({}))).toBe("/send");
  });

  it("returns address book when from=addresses", () => {
    expect(buildAddressFormBackHref("sender", params({ from: "addresses", tab: "sender" }))).toBe(
      "/addresses?tab=sender",
    );
    expect(buildAddressFormBackHref("recipient", params({ from: "addresses", tab: "recipient" }))).toBe(
      "/addresses?tab=recipient",
    );
  });

  it("redirects to /send after save in send flow", () => {
    const href = buildAddressFormAfterSaveHref("sender", "id-1", params({}));
    expect(href.startsWith("/send?senderSaved=1&senderId=id-1&_t=")).toBe(true);
  });

  it("preserves send context after saving a sender", () => {
    const href = buildAddressFormAfterSaveHref(
      "sender",
      "new-sender",
      params({
        senderId: "old-sender",
        recipientId: "recipient-1",
        shippingMode: "pickup",
        autoPrint: "0",
        extraInsurance: "1",
        insuredValue: "3000",
        weightGram: "1200",
        widthCm: "10",
        lengthCm: "20",
        heightCm: "30",
        parcelSizePreset: "custom",
        parcelType: "อาหาร",
        note: "fragile",
      }),
    );
    expect(href).toContain("senderSaved=1");
    expect(href).toContain("senderId=new-sender");
    expect(href).toContain("recipientId=recipient-1");
    expect(href).toContain("shippingMode=pickup");
    expect(href).toContain("autoPrint=0");
    expect(href).toContain("extraInsurance=1");
    expect(href).toContain("insuredValue=3000");
    expect(href).toContain("weightGram=1200");
    expect(href).toContain("parcelType=%E0%B8%AD%E0%B8%B2%E0%B8%AB%E0%B8%B2%E0%B8%A3");
    expect(href).toContain("note=fragile");
  });

  it("preserves send context after saving a recipient", () => {
    const href = buildAddressFormAfterSaveHref(
      "recipient",
      "new-recipient",
      params({ senderId: "sender-1", recipientId: "old-recipient", weightGram: "900" }),
    );
    expect(href).toContain("recipientSaved=1");
    expect(href).toContain("recipientId=new-recipient");
    expect(href).toContain("senderId=sender-1");
    expect(href).toContain("weightGram=900");
  });

  it("redirects to /addresses after save from address book", () => {
    const href = buildAddressFormAfterSaveHref("sender", "id-1", params({ from: "addresses", tab: "sender" }));
    expect(href.startsWith("/addresses?tab=sender&saved=1&_t=")).toBe(true);
  });

  it("ignores unknown from values", () => {
    expect(isAddressFormFromAddresses(params({ from: "evil" }))).toBe(false);
    expect(buildAddressFormBackHref("sender", params({ from: "evil" }))).toBe("/send");
  });
});
