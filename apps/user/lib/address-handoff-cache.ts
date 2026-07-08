import type { RecipientAddress, SenderAddress } from "@quickload/shared/types";

export type AddressHandoffKind = "sender" | "recipient";

type AddressByKind = {
  sender: SenderAddress;
  recipient: RecipientAddress;
};

type HandoffPayload<T> = {
  id: string;
  expiresAt: number;
  address: T;
};

const HANDOFF_TTL_MS = 5 * 60 * 1000;
const STORAGE_PREFIX = "quickload_address_handoff";

function storageKey(kind: AddressHandoffKind, id: string): string {
  return `${STORAGE_PREFIX}:${kind}:${id}`;
}

function getSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isAddressLike(value: unknown): value is { id: string } {
  return Boolean(value && typeof value === "object" && typeof (value as { id?: unknown }).id === "string");
}

export function saveAddressHandoff<K extends AddressHandoffKind>(
  kind: K,
  address: AddressByKind[K],
  now = Date.now(),
): void {
  const storage = getSessionStorage();
  if (!storage) return;
  const payload: HandoffPayload<AddressByKind[K]> = {
    id: address.id,
    expiresAt: now + HANDOFF_TTL_MS,
    address,
  };
  try {
    storage.setItem(storageKey(kind, address.id), JSON.stringify(payload));
  } catch {
    // Best-effort handoff only. The API remains the source of truth.
  }
}

export function readAddressHandoff<K extends AddressHandoffKind>(
  kind: K,
  id: string,
  now = Date.now(),
): AddressByKind[K] | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  const key = storageKey(kind, id);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<HandoffPayload<unknown>>;
    if (parsed.id !== id || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= now) {
      storage.removeItem(key);
      return null;
    }
    if (!isAddressLike(parsed.address) || parsed.address.id !== id) {
      storage.removeItem(key);
      return null;
    }
    return parsed.address as AddressByKind[K];
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function clearAddressHandoff(kind: AddressHandoffKind, id: string): void {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey(kind, id));
  } catch {
    // Nothing actionable if browser storage refuses deletion.
  }
}
