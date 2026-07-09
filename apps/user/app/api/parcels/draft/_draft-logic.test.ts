import { describe, it, expect } from "vitest";
import { resolveDraftIdempotency, validateDraftPayload } from "./_draft-logic";

const VALID_SMARTPOST = {
  statuscode: "201",
  message: "Create successful",
  data: {
    smartpostTrackingcode: "SP001234",
    barcode: "TH001234567890",
  },
};

const VALID_BASE = {
  senderId: "sender-1",
  recipientId: "recipient-1",
  weightGram: "500",
  widthCm: "20",
  lengthCm: "20",
  heightCm: "20",
  parcelType: "พัสดุทั่วไป",
  smartpostAddItemResponse: VALID_SMARTPOST,
};

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("validateDraftPayload — happy path", () => {
  it("returns ok with trackingId when all fields are valid", () => {
    const result = validateDraftPayload(VALID_BASE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.trackingId).toBe("SP001234");
      expect(result.barcode).toBe("TH001234567890");
    }
  });

  it("uses barcode as trackingId when smartpostTrackingcode is absent", () => {
    const smartpost = {
      statuscode: "201",
      message: "OK",
      data: { barcode: "TH999" },
    };
    const result = validateDraftPayload({ ...VALID_BASE, smartpostAddItemResponse: smartpost });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.trackingId).toBe("TH999");
  });

  it("accepts weight at minimum boundary (10g)", () => {
    const result = validateDraftPayload({ ...VALID_BASE, weightGram: "10" });
    expect(result.ok).toBe(true);
  });

  it("accepts weight at maximum boundary (30000g)", () => {
    const result = validateDraftPayload({ ...VALID_BASE, weightGram: "30000" });
    expect(result.ok).toBe(true);
  });

  it("accepts dimensions at exactly the sum limit (40+40+40=120cm)", () => {
    const result = validateDraftPayload({ ...VALID_BASE, widthCm: "40", lengthCm: "40", heightCm: "40" });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Address validation
// ---------------------------------------------------------------------------

describe("validateDraftPayload — address validation", () => {
  it("returns 400 when senderId is missing", () => {
    const result = validateDraftPayload({ ...VALID_BASE, senderId: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("senderId");
    }
  });

  it("returns 400 when recipientId is missing", () => {
    const result = validateDraftPayload({ ...VALID_BASE, recipientId: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Weight validation
// ---------------------------------------------------------------------------

describe("validateDraftPayload — weight validation", () => {
  it("returns 400 for weight below minimum (9g)", () => {
    const result = validateDraftPayload({ ...VALID_BASE, weightGram: "9" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("returns 400 for weight above maximum (30001g)", () => {
    const result = validateDraftPayload({ ...VALID_BASE, weightGram: "30001" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("returns 400 for zero weight", () => {
    const result = validateDraftPayload({ ...VALID_BASE, weightGram: "0" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("returns 400 for non-numeric weight", () => {
    const result = validateDraftPayload({ ...VALID_BASE, weightGram: "abc" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Dimension validation
// ---------------------------------------------------------------------------

describe("validateDraftPayload — dimension validation", () => {
  it("returns 400 when a dimension is missing", () => {
    const result = validateDraftPayload({ ...VALID_BASE, widthCm: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("returns 400 when a side exceeds 60cm", () => {
    const result = validateDraftPayload({ ...VALID_BASE, widthCm: "61" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("60");
    }
  });

  it("returns 400 when dimension sum exceeds 120cm (41+40+40=121)", () => {
    const result = validateDraftPayload({ ...VALID_BASE, widthCm: "41", lengthCm: "40", heightCm: "40" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("120");
    }
  });
});

// ---------------------------------------------------------------------------
// parcelType validation
// ---------------------------------------------------------------------------

describe("validateDraftPayload — parcelType validation", () => {
  it("returns 400 when parcelType is empty", () => {
    const result = validateDraftPayload({ ...VALID_BASE, parcelType: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("parcelType");
    }
  });
});

// ---------------------------------------------------------------------------
// Smartpost response validation
// ---------------------------------------------------------------------------

describe("validateDraftPayload — Smartpost response validation", () => {
  it("returns 400 when smartpostAddItemResponse is null", () => {
    const result = validateDraftPayload({ ...VALID_BASE, smartpostAddItemResponse: null });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("smartpostAddItemResponse");
    }
  });

  it("returns 400 when smartpostAddItemResponse is undefined", () => {
    const result = validateDraftPayload({ ...VALID_BASE, smartpostAddItemResponse: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("returns 400 when statuscode is not 201 (e.g. '500')", () => {
    const badSmartpost = { statuscode: "500", message: "Error", data: {} };
    const result = validateDraftPayload({ ...VALID_BASE, smartpostAddItemResponse: badSmartpost });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("returns 400 when Smartpost response has no tracking code or barcode", () => {
    const noTrack = { statuscode: "201", message: "Create successful", data: {} };
    const result = validateDraftPayload({ ...VALID_BASE, smartpostAddItemResponse: noTrack });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("tracking");
    }
  });

  it("accepts bare {message} Smartpost success (no statuscode) — falls through to trackingId check", () => {
    // Real Smartpost quirk: {message: "Create successful"} with no statuscode
    // Parser returns statuscode: "" which is falsy — the check `if (statuscode && statuscode !== "201")` passes
    // But then inner will be {} with no tracking → returns trackingId error
    const bare = { message: "Create successful" };
    const result = validateDraftPayload({ ...VALID_BASE, smartpostAddItemResponse: bare });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("tracking");
  });

  it("accepts statuscode '201' even when empty string statuscode is present", () => {
    const smartpost = {
      statuscode: "201",
      message: "OK",
      data: { smartpostTrackingcode: "SP-XYZ" },
    };
    const result = validateDraftPayload({ ...VALID_BASE, smartpostAddItemResponse: smartpost });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveDraftIdempotency (retry-safety for duplicate trackingId)
// ---------------------------------------------------------------------------

describe("resolveDraftIdempotency", () => {
  it("returns 'create' when no parcel exists for this trackingId", () => {
    const result = resolveDraftIdempotency(undefined, "user-1");
    expect(result.kind).toBe("create");
  });

  it("returns 'replay' with the existing parcel when it belongs to the same user", () => {
    const result = resolveDraftIdempotency(
      { id: "parcel-1", trackingId: "SP001234", userId: "user-1" },
      "user-1",
    );
    expect(result.kind).toBe("replay");
    if (result.kind === "replay") {
      expect(result.id).toBe("parcel-1");
      expect(result.trackingId).toBe("SP001234");
    }
  });

  it("returns 'conflict' when the existing parcel belongs to a different user", () => {
    const result = resolveDraftIdempotency(
      { id: "parcel-1", trackingId: "SP001234", userId: "user-2" },
      "user-1",
    );
    expect(result.kind).toBe("conflict");
  });

  it("returns 'conflict' when the existing parcel has no owner", () => {
    const result = resolveDraftIdempotency(
      { id: "parcel-1", trackingId: "SP001234", userId: null },
      "user-1",
    );
    expect(result.kind).toBe("conflict");
  });
});
