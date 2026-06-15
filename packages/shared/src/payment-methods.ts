/**
 * Single source of truth for supported payment methods.
 *
 * `id` is the lowercase value stored in `payments.payment_method`.
 *
 * `beamType` is the exact string Beam expects as `paymentMethodType` in the
 * Charges API. See docs.beamcheckout.com/charges/charges-api.
 *
 * PromptPay is the default checkout QR and is not shown as a selectable tile.
 * `BANK_PAYMENT_METHODS` are the app-redirect options shown below the QR.
 */
export const PROMPTPAY_METHOD_ID = "promptpay" as const;

export type BankPaymentMethodId = "kplus" | "make" | "scb_easy" | "truemoney";

export type StoredPaymentMethodId = typeof PROMPTPAY_METHOD_ID | BankPaymentMethodId;

export type BeamPaymentMethodType =
  | "QR_PROMPT_PAY"
  | "KPLUS"
  | "MAKE"
  | "SCB_EASY"
  | "TRUE_MONEY";

export type PaymentMethodDef = {
  id: StoredPaymentMethodId;
  beamType: BeamPaymentMethodType;
  labelTh: string;
};

export const DEFAULT_PAYMENT_METHOD_ID = PROMPTPAY_METHOD_ID;

/** Bank / wallet tiles — PromptPay is always the QR above, not a tile here. */
export const BANK_PAYMENT_METHODS: ReadonlyArray<
  PaymentMethodDef & { id: BankPaymentMethodId }
> = [
  { id: "kplus", beamType: "KPLUS", labelTh: "K PLUS" },
  { id: "make", beamType: "MAKE", labelTh: "MAKE by KBank" },
  { id: "scb_easy", beamType: "SCB_EASY", labelTh: "SCB Easy" },
  { id: "truemoney", beamType: "TRUE_MONEY", labelTh: "TrueMoney Wallet" },
];

/** @deprecated Use BANK_PAYMENT_METHODS for UI tiles. */
export const PAYMENT_METHODS = BANK_PAYMENT_METHODS;

export type PaymentMethodId = BankPaymentMethodId;

export function isBankPaymentMethod(id: string): id is BankPaymentMethodId {
  return BANK_PAYMENT_METHODS.some((m) => m.id === id);
}

export function getPaymentMethod(id: string): PaymentMethodDef | null {
  if (id === PROMPTPAY_METHOD_ID) {
    return { id: PROMPTPAY_METHOD_ID, beamType: "QR_PROMPT_PAY", labelTh: "พร้อมเพย์" };
  }
  return BANK_PAYMENT_METHODS.find((m) => m.id === id) ?? null;
}
