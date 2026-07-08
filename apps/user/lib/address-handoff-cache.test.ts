// @vitest-environment jsdom
import type { RecipientAddress, SenderAddress } from "@quickload/shared/types";
import { beforeEach, describe, expect, it } from "vitest";
import { clearAddressHandoff, readAddressHandoff, saveAddressHandoff } from "./address-handoff-cache";

const sender: SenderAddress = {
  id: "sender-1",
  userId: "user-1",
  contactName: "Sender One",
  phone: "0812345678",
  addressLine: "123 Sender Road",
  tambon: "บางรัก",
  amphoe: "บางรัก",
  province: "กรุงเทพมหานคร",
  zipcode: "10500",
  isPrimary: true,
  createdAt: "2026-07-08T00:00:00.000Z",
  updatedAt: null,
};

const recipient: RecipientAddress = {
  id: "recipient-1",
  userId: "user-1",
  contactName: "Recipient One",
  phone: "0898765432",
  addressLine: "456 Recipient Road",
  tambon: "คลองตัน",
  amphoe: "คลองเตย",
  province: "กรุงเทพมหานคร",
  zipcode: "10110",
  isPrimary: false,
  createdAt: "2026-07-08T00:00:00.000Z",
  updatedAt: null,
};

beforeEach(() => {
  sessionStorage.clear();
});

describe("address handoff cache", () => {
  it("stores and restores sender payload by ID", () => {
    saveAddressHandoff("sender", sender, 1_000);
    expect(readAddressHandoff("sender", sender.id, 1_500)).toEqual(sender);
  });

  it("stores and restores recipient payload by ID", () => {
    saveAddressHandoff("recipient", recipient, 1_000);
    expect(readAddressHandoff("recipient", recipient.id, 1_500)).toEqual(recipient);
  });

  it("ignores mismatched IDs", () => {
    saveAddressHandoff("sender", sender, 1_000);
    expect(readAddressHandoff("sender", "other-sender", 1_500)).toBeNull();
  });

  it("ignores expired payloads", () => {
    saveAddressHandoff("recipient", recipient, 1_000);
    expect(readAddressHandoff("recipient", recipient.id, 1_000 + 5 * 60 * 1000 + 1)).toBeNull();
  });

  it("ignores corrupt payloads", () => {
    sessionStorage.setItem("quickload_address_handoff:sender:sender-1", "not-json");
    expect(readAddressHandoff("sender", sender.id, 1_500)).toBeNull();
  });

  it("clears a hydrated payload", () => {
    saveAddressHandoff("sender", sender, 1_000);
    clearAddressHandoff("sender", sender.id);
    expect(readAddressHandoff("sender", sender.id, 1_500)).toBeNull();
  });
});
