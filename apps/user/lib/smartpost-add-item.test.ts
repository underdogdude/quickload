import { describe, it, expect } from "vitest";
import {
  parseSmartpostAddItemResponse,
  mapSmartpostInnerToOrderFields,
} from "./smartpost-add-item";

const FULL_INNER = {
  smartpostTrackingcode: "SP001234",
  barcode: "TH001234567890",
  service_type: "EMS",
  productInbox: "พัสดุทั่วไป",
  productWeight: "500",
  productPrice: "0",
  shipperName: "สมชาย ใจดี",
  shipperAddress: "123 ถนนพระราม 9",
  shipperSubdistrict: "ห้วยขวาง",
  shipperDistrict: "ห้วยขวาง",
  shipperProvince: "กรุงเทพมหานคร",
  shipperZipcode: "10310",
  shipperEmail: "",
  shipperMobile: "0812345678",
  cusName: "สมศรี รักดี",
  cusAdd: "456 ถนนสุขุมวิท",
  cusSub: "คลองเตย",
  cusAmp: "คลองเตย",
  cusProv: "กรุงเทพมหานคร",
  cusZipcode: "10110",
  cusTel: "0987654321",
  cusEmail: "",
  customer_code: "CUST001",
  cost: "35",
  finalcost: "35",
  order_status: "pending",
};

describe("parseSmartpostAddItemResponse", () => {
  it("returns null for null input", () => {
    expect(parseSmartpostAddItemResponse(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parseSmartpostAddItemResponse(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseSmartpostAddItemResponse("")).toBeNull();
  });

  it("returns null for primitive number", () => {
    expect(parseSmartpostAddItemResponse(42)).toBeNull();
  });

  describe("plain object response", () => {
    it("parses {statuscode, message, data} shape", () => {
      const raw = {
        statuscode: "201",
        message: "Create successful",
        data: FULL_INNER,
      };
      const result = parseSmartpostAddItemResponse(raw);
      expect(result).not.toBeNull();
      expect(result!.statuscode).toBe("201");
      expect(result!.message).toBe("Create successful");
      expect(result!.inner.smartpostTrackingcode).toBe("SP001234");
    });

    it("parses bare {message} with no statuscode (Smartpost quirk)", () => {
      const raw = { message: "Create successful" };
      const result = parseSmartpostAddItemResponse(raw);
      expect(result).not.toBeNull();
      expect(result!.statuscode).toBe("");
      expect(result!.message).toBe("Create successful");
      expect(result!.inner).toEqual({});
    });

    it("parses response with numeric statuscode and coerces to string", () => {
      const raw = { statuscode: 201, message: "OK", data: {} };
      const result = parseSmartpostAddItemResponse(raw);
      expect(result!.statuscode).toBe("201");
    });
  });

  describe("array-wrapped response", () => {
    it("parses array-wrapped plain object", () => {
      const raw = [{ statuscode: "201", message: "Create successful", data: FULL_INNER }];
      const result = parseSmartpostAddItemResponse(raw);
      expect(result).not.toBeNull();
      expect(result!.statuscode).toBe("201");
    });

    it("uses first element of array", () => {
      const raw = [
        { statuscode: "201", message: "first" },
        { statuscode: "500", message: "second" },
      ];
      const result = parseSmartpostAddItemResponse(raw);
      expect(result!.message).toBe("first");
    });

    it("returns an empty-field result for an empty array (arrays are objects in JS)", () => {
      // An empty array [] passes the `typeof raw === "object"` check in firstRecord,
      // so the parser returns {statuscode:"", message:"", inner:{}} rather than null.
      // This is correct behaviour — the draft route's trackingId check will catch it.
      const result = parseSmartpostAddItemResponse([]);
      expect(result).not.toBeNull();
      expect(result!.statuscode).toBe("");
      expect(result!.inner).toEqual({});
    });
  });

  describe("envelope response {data: {statuscode, message, data}}", () => {
    it("unwraps outer envelope when statuscode is in nested data", () => {
      const raw = {
        data: {
          statuscode: "201",
          message: "Create successful",
          data: FULL_INNER,
        },
      };
      const result = parseSmartpostAddItemResponse(raw);
      expect(result).not.toBeNull();
      expect(result!.statuscode).toBe("201");
      expect(result!.message).toBe("Create successful");
    });
  });

  describe("stringified data field", () => {
    it("parses data field as JSON string (actual Smartpost quirk)", () => {
      const raw = {
        statuscode: "201",
        message: "Create successful",
        data: JSON.stringify(FULL_INNER),
      };
      const result = parseSmartpostAddItemResponse(raw);
      expect(result).not.toBeNull();
      expect(result!.inner.smartpostTrackingcode).toBe("SP001234");
      expect(result!.inner.barcode).toBe("TH001234567890");
    });

    it("returns empty inner when data is invalid JSON string", () => {
      const raw = {
        statuscode: "201",
        message: "OK",
        data: "not-valid-json{{{",
      };
      const result = parseSmartpostAddItemResponse(raw);
      expect(result!.inner).toEqual({});
    });
  });

  describe("inner field coercion", () => {
    it("coerces all inner field values to strings", () => {
      const raw = {
        statuscode: "201",
        message: "OK",
        data: { cost: 35, productWeight: 500, flag: true },
      };
      const result = parseSmartpostAddItemResponse(raw);
      expect(result!.inner.cost).toBe("35");
      expect(result!.inner.productWeight).toBe("500");
      expect(result!.inner.flag).toBe("true");
    });

    it("coerces null field values to empty string", () => {
      const raw = {
        statuscode: "201",
        message: "OK",
        data: { barcode: null },
      };
      const result = parseSmartpostAddItemResponse(raw);
      expect(result!.inner.barcode).toBe("");
    });
  });
});

describe("mapSmartpostInnerToOrderFields", () => {
  it("maps camelCase keys", () => {
    const inner = {
      smartpostTrackingcode: "SP001",
      barcode: "TH001",
      serviceType: "EMS",
      productInbox: "box",
    };
    const fields = mapSmartpostInnerToOrderFields(inner);
    expect(fields.smartpostTrackingcode).toBe("SP001");
    expect(fields.barcode).toBe("TH001");
    expect(fields.serviceType).toBe("EMS");
    expect(fields.productInbox).toBe("box");
  });

  it("maps snake_case keys as fallback", () => {
    const inner = {
      smartpost_trackingcode: "SP002",
      bar_code: "TH002",
      service_type: "EMS",
      product_inbox: "envelope",
      customer_code: "C001",
    };
    const fields = mapSmartpostInnerToOrderFields(inner);
    expect(fields.smartpostTrackingcode).toBe("SP002");
    expect(fields.serviceType).toBe("EMS");
    expect(fields.productInbox).toBe("envelope");
    expect(fields.customerCode).toBe("C001");
  });

  it("prefers first non-empty key in priority list", () => {
    const inner = {
      barcode: "",
      Barcode: "UPPERCASE",
    };
    const fields = mapSmartpostInnerToOrderFields(inner);
    expect(fields.barcode).toBe("UPPERCASE");
  });

  it("returns empty string for missing keys", () => {
    const fields = mapSmartpostInnerToOrderFields({});
    expect(fields.smartpostTrackingcode).toBe("");
    expect(fields.barcode).toBe("");
    expect(fields.cost).toBe("");
  });

  it("handles full inner from parsed response", () => {
    const fields = mapSmartpostInnerToOrderFields(
      Object.fromEntries(Object.entries(FULL_INNER).map(([k, v]) => [k, String(v)])),
    );
    expect(fields.smartpostTrackingcode).toBe("SP001234");
    expect(fields.barcode).toBe("TH001234567890");
    expect(fields.shipperName).toBe("สมชาย ใจดี");
    expect(fields.cusName).toBe("สมศรี รักดี");
    expect(fields.cost).toBe("35");
    expect(fields.finalcost).toBe("35");
    expect(fields.customerCode).toBe("CUST001");
  });
});
