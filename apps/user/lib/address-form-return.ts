export const ADDRESS_FORM_FROM_ADDRESSES = "addresses";

export type AddressFormKind = "sender" | "recipient";

type SearchParamLike = {
  get(name: string): string | null;
};

const SEND_RETURN_PARAM_KEYS = [
  "senderId",
  "recipientId",
  "shippingMode",
  "autoPrint",
  "extraInsurance",
  "insuredValue",
  "weightGram",
  "widthCm",
  "lengthCm",
  "heightCm",
  "parcelSizePreset",
  "parcelType",
  "note",
] as const;

export function isAddressFormFromAddresses(params: SearchParamLike): boolean {
  return params.get("from") === ADDRESS_FORM_FROM_ADDRESSES;
}

export function addressBookTabFromParams(params: SearchParamLike, kind: AddressFormKind): AddressFormKind {
  const tab = params.get("tab");
  if (tab === "sender" || tab === "recipient") return tab;
  return kind;
}

export function buildAddressFormHref(
  kind: AddressFormKind,
  options: { id?: string; fromAddresses?: boolean; tab?: AddressFormKind },
): string {
  const base = kind === "sender" ? "/send/sender" : "/send/recipient";
  const usp = new URLSearchParams();
  if (options.id) usp.set("id", options.id);
  if (options.fromAddresses) {
    usp.set("from", ADDRESS_FORM_FROM_ADDRESSES);
    usp.set("tab", options.tab ?? kind);
  }
  const query = usp.toString();
  return query ? `${base}?${query}` : base;
}

export function buildAddressFormBackHref(kind: AddressFormKind, params: SearchParamLike): string {
  if (isAddressFormFromAddresses(params)) {
    const tab = addressBookTabFromParams(params, kind);
    return `/addresses?tab=${tab}`;
  }
  return "/send";
}

export function buildAddressFormAfterSaveHref(
  kind: AddressFormKind,
  savedId: string,
  params: SearchParamLike,
): string {
  if (isAddressFormFromAddresses(params)) {
    const tab = addressBookTabFromParams(params, kind);
    return `/addresses?tab=${tab}&saved=1&_t=${Date.now()}`;
  }
  const usp = new URLSearchParams();
  for (const key of SEND_RETURN_PARAM_KEYS) {
    const value = params.get(key);
    if (value) usp.set(key, value);
  }
  if (kind === "sender") {
    usp.set("senderSaved", "1");
    usp.set("senderId", savedId);
  } else {
    usp.set("recipientSaved", "1");
    usp.set("recipientId", savedId);
  }
  usp.set("_t", String(Date.now()));
  return `/send?${usp.toString()}`;
}
