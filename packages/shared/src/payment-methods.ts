/**
 * Single source of truth for supported payment methods.
 *
 * `id` is the lowercase value stored in `payments.payment_method` (matches the
 * existing `"promptpay"` convention).
 *
 * `beamType` is the exact string Beam expects as `paymentMethodType` in the
 * Charges API. See docs.beamcheckout.com/charges/charges-api.
 *
 * `labelTh` is the Thai display label shown in tiles and history.
 */
export type PaymentMethodId =
  | "promptpay"
  | "kplus"
  | "make"
  | "scb_easy"
  | "truemoney";

export type BeamPaymentMethodType =
  | "QR_PROMPT_PAY"
  | "KPLUS"
  | "MAKE"
  | "SCB_EASY"
  | "TRUE_MONEY";

export type PaymentMethodDef = {
  id: PaymentMethodId;
  beamType: BeamPaymentMethodType;
  labelTh: string;
};

export const PAYMENT_METHODS: ReadonlyArray<PaymentMethodDef> = [
  { id: "promptpay", beamType: "QR_PROMPT_PAY", labelTh: "พร้อมเพย์" },
  { id: "kplus", beamType: "KPLUS", labelTh: "K PLUS" },
  { id: "make", beamType: "MAKE", labelTh: "MAKE by KBank" },
  { id: "scb_easy", beamType: "SCB_EASY", labelTh: "SCB Easy" },
  { id: "truemoney", beamType: "TRUE_MONEY", labelTh: "TrueMoney Wallet" },
];

export function getPaymentMethod(id: string): PaymentMethodDef | null {
  return PAYMENT_METHODS.find((m) => m.id === id) ?? null;
}
