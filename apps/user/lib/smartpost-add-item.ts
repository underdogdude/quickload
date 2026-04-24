/**
 * Parse Smartpost addItem success body (array-wrapped or object; inner `data` may be JSON string).
 */

function firstRecord(raw: unknown): Record<string, unknown> | null {
  if (Array.isArray(raw) && raw[0] && typeof raw[0] === "object") {
    return raw[0] as Record<string, unknown>;
  }
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  return null;
}

/** Unwrap `{ data: { statuscode, message, data } }` when the outer object has no statuscode. */
function unwrapEnvelope(raw: unknown): Record<string, unknown> | null {
  let rec = firstRecord(raw);
  if (!rec) return null;
  if (
    rec.statuscode == null &&
    rec.message == null &&
    typeof rec.data === "object" &&
    rec.data !== null &&
    !Array.isArray(rec.data)
  ) {
    const nested = rec.data as Record<string, unknown>;
    if (nested.statuscode != null || nested.message != null) {
      rec = nested;
    }
  }
  return rec;
}

function materializeDataField(dataField: unknown): Record<string, string> | null {
  if (dataField == null) return null;
  let obj: unknown = dataField;
  if (typeof dataField === "string") {
    try {
      obj = JSON.parse(dataField) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof obj !== "object" || obj === null) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    out[k] = v == null ? "" : String(v);
  }
  return out;
}

export type ParsedSmartpostAddItem = {
  statuscode: string;
  message: string;
  inner: Record<string, string>;
};

export function parseSmartpostAddItemResponse(raw: unknown): ParsedSmartpostAddItem | null {
  const rec = unwrapEnvelope(raw);
  if (!rec) return null;
  const statuscode = String(rec.statuscode ?? "");
  const message = String(rec.message ?? "");
  const inner = materializeDataField(rec.data);
  if (!inner) return null;
  return { statuscode, message, inner };
}

function pick(inner: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = inner[k];
    if (v != null && v !== "") return v;
  }
  return "";
}

/** Map inner `data` object keys to values for DB insert (handles API camelCase / snake_case). */
export function mapSmartpostInnerToOrderFields(inner: Record<string, string>) {
  return {
    smartpostTrackingcode: pick(inner, "smartpost_trackingcode", "smartpostTrackingcode"),
    barcode: pick(inner, "barcode", "Barcode", "bar_code", "th_barcode"),
    serviceType: pick(inner, "service_type", "serviceType"),
    productInbox: pick(inner, "productInbox", "product_inbox"),
    productWeight: pick(inner, "productWeight", "product_weight"),
    productPrice: pick(inner, "productPrice", "product_price"),
    shipperName: pick(inner, "shipperName", "shipper_name"),
    shipperAddress: pick(inner, "shipperAddress", "shipper_address"),
    shipperSubdistrict: pick(inner, "shipperSubdistrict", "shipper_subdistrict"),
    shipperDistrict: pick(inner, "shipperDistrict", "shipper_district"),
    shipperProvince: pick(inner, "shipperProvince", "shipper_province"),
    shipperZipcode: pick(inner, "shipperZipcode", "shipper_zipcode"),
    shipperEmail: pick(inner, "shipperEmail", "shipper_email"),
    shipperMobile: pick(inner, "shipperMobile", "shipper_mobile"),
    cusName: pick(inner, "cusName", "cus_name"),
    cusAdd: pick(inner, "cusAdd", "cus_add"),
    cusSub: pick(inner, "cusSub", "cus_sub"),
    cusAmp: pick(inner, "cusAmp", "cus_amp"),
    cusProv: pick(inner, "cusProv", "cus_prov"),
    cusZipcode: pick(inner, "cusZipcode", "cus_zipcode"),
    cusTel: pick(inner, "cusTel", "cus_tel"),
    cusEmail: pick(inner, "cusEmail", "cus_email"),
    customerCode: pick(inner, "customer_code", "customerCode"),
    cost: pick(inner, "cost"),
    finalcost: pick(inner, "finalcost", "finalCost"),
    orderStatus: pick(inner, "order_status", "orderStatus"),
    items: pick(inner, "items"),
    insuranceRatePrice: pick(inner, "insuranceRatePrice", "insurance_rate_price"),
    referenceId: pick(inner, "referenceId", "reference_id"),
  };
}
