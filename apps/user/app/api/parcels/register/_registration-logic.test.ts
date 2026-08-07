import { describe, expect, it } from "vitest";
import {
  decideRegistrationAttempt,
  parcelRegistrationRequestHash,
  readParcelRegistrationSnapshot,
  validateParcelRegistrationBody,
  type ParcelRegistrationSnapshot,
} from "./_registration-logic";

const validBody = {
  senderId: "sender-1",
  recipientId: "recipient-1",
  shippingMode: "branch",
  autoPrint: false,
  weightGram: "150",
  widthCm: "10",
  lengthCm: "20",
  heightCm: "5",
  parcelType: "อื่นๆ",
  note: "test",
  insuredValue: "0",
  extraInsurance: false,
  referenceId: "QL-attempt-1",
};

const snapshot: ParcelRegistrationSnapshot = {
  ...validBody,
  shippingMode: "branch",
  weightGram: 150,
  widthCm: 10,
  lengthCm: 20,
  heightCm: 5,
  insuredValue: 0,
  note: "test",
  sender: {
    contactName: "Sender",
    phone: "0811111111",
    addressLine: "1 Road",
    tambon: "A",
    amphoe: "B",
    province: "Bangkok",
    zipcode: "10250",
  },
  recipient: {
    contactName: "Recipient",
    phone: "0822222222",
    addressLine: "2 Road",
    tambon: "C",
    amphoe: "D",
    province: "Pathum Thani",
    zipcode: "12120",
  },
};

describe("validateParcelRegistrationBody", () => {
  it("validates and normalizes a complete request", () => {
    const result = validateParcelRegistrationBody(validBody);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject({ weightGram: 150, referenceId: "QL-attempt-1" });
  });

  it("requires a stable valid reference", () => {
    expect(validateParcelRegistrationBody({ ...validBody, referenceId: "bad ref" }).ok).toBe(false);
  });

  it("enforces physical limits before any provider call", () => {
    expect(validateParcelRegistrationBody({ ...validBody, widthCm: "61" }).ok).toBe(false);
    expect(validateParcelRegistrationBody({ ...validBody, weightGram: "30001" }).ok).toBe(false);
  });
});

describe("registration attempt idempotency", () => {
  it("hashes every immutable request field", () => {
    expect(parcelRegistrationRequestHash(snapshot)).not.toBe(
      parcelRegistrationRequestHash({ ...snapshot, weightGram: 151 }),
    );
  });

  it("keeps the intent hash stable when a saved address changes after submission", () => {
    const snapshotWithEditedAddress: ParcelRegistrationSnapshot = {
      ...snapshot,
      sender: { ...snapshot.sender, addressLine: "A later address-book edit" },
    };
    expect(parcelRegistrationRequestHash(snapshot)).toBe(
      parcelRegistrationRequestHash(snapshotWithEditedAddress),
    );
    expect(parcelRegistrationRequestHash(snapshot)).not.toBe(
      parcelRegistrationRequestHash({ ...snapshot, senderId: "sender-2" }),
    );
  });

  it("never reuses a reference for different input", () => {
    expect(
      decideRegistrationAttempt(
        { requestHash: "old", status: "persisted", retryable: false, parcelId: "parcel-1" },
        "new",
      ),
    ).toBe("conflict");
  });

  it("resumes local persistence without another provider call", () => {
    expect(
      decideRegistrationAttempt(
        { requestHash: "same", status: "provider_succeeded", retryable: false, parcelId: null },
        "same",
      ),
    ).toBe("resume_persistence");
  });

  it("does not retry ambiguous or in-flight provider calls", () => {
    expect(
      decideRegistrationAttempt(
        { requestHash: "same", status: "unknown", retryable: false, parcelId: null },
        "same",
      ),
    ).toBe("unknown");
    expect(
      decideRegistrationAttempt(
        { requestHash: "same", status: "submitting", retryable: false, parcelId: null },
        "same",
      ),
    ).toBe("processing");
  });
});

describe("readParcelRegistrationSnapshot", () => {
  it("round-trips a durable JSON snapshot", () => {
    expect(readParcelRegistrationSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  });

  it("rejects incomplete address snapshots", () => {
    expect(readParcelRegistrationSnapshot({ ...snapshot, recipient: {} })).toBeNull();
  });
});
