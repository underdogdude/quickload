type AddressWithId = { id: string; updatedAt?: string | null };

type ApiOne<T> = {
  ok?: boolean;
  data?: T;
};

type ApiList<T> = {
  ok?: boolean;
  data?: T[];
};

export type SendAddressLoadKind = "sender" | "recipient";

export type SendAddressLoadResult<T> = {
  address: T | null;
  error: string | null;
  fromFallbackList: boolean;
  unauthorized: boolean;
};

export type SendAddressListResult<T> = {
  addresses: T[];
  error: string | null;
  unauthorized: boolean;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function endpointFor(kind: SendAddressLoadKind): string {
  return kind === "sender" ? "/api/sender-addresses" : "/api/recipient-addresses";
}

function labelFor(kind: SendAddressLoadKind): string {
  return kind === "sender" ? "ผู้ส่ง" : "ผู้รับ";
}

function loadErrorFor(kind: SendAddressLoadKind): string {
  return `โหลดข้อมูล${labelFor(kind)}ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง`;
}

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function pickFreshAddressForSend<T extends AddressWithId>(
  handoffAddress: T | null,
  fetchedAddress: T | null,
): T | null {
  if (!handoffAddress) return fetchedAddress;
  if (!fetchedAddress) return handoffAddress;
  if (handoffAddress.id !== fetchedAddress.id) return handoffAddress;

  const handoffUpdatedAt = timestampMs(handoffAddress.updatedAt);
  const fetchedUpdatedAt = timestampMs(fetchedAddress.updatedAt);
  if (handoffUpdatedAt != null && fetchedUpdatedAt != null && fetchedUpdatedAt > handoffUpdatedAt) {
    return fetchedAddress;
  }
  return handoffAddress;
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export async function loadAddressByIdForSend<T extends AddressWithId>(
  kind: SendAddressLoadKind,
  id: string,
  fetcher: FetchLike = fetch,
): Promise<SendAddressLoadResult<T>> {
  const base = endpointFor(kind);

  try {
    const response = await fetcher(`${base}/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (response.status === 401) {
      return { address: null, error: null, fromFallbackList: false, unauthorized: true };
    }
    const json = await readJson<ApiOne<T>>(response);
    if (response.ok && json?.ok && json.data?.id === id) {
      return { address: json.data, error: null, fromFallbackList: false, unauthorized: false };
    }
  } catch {
    // Fall through to the list endpoint. The post-save ID endpoint can be the fragile branch.
  }

  try {
    const response = await fetcher(base, { cache: "no-store" });
    if (response.status === 401) {
      return { address: null, error: null, fromFallbackList: false, unauthorized: true };
    }
    const json = await readJson<ApiList<T>>(response);
    if (response.ok && json?.ok && Array.isArray(json.data)) {
      const match = json.data.find((address) => address.id === id) ?? null;
      if (match) {
        return { address: match, error: null, fromFallbackList: true, unauthorized: false };
      }
    }
  } catch {
    // The caller will surface a visible error instead of silently rendering empty state.
  }

  return { address: null, error: loadErrorFor(kind), fromFallbackList: false, unauthorized: false };
}

export async function loadAddressListForSend<T extends AddressWithId>(
  kind: SendAddressLoadKind,
  fetcher: FetchLike = fetch,
): Promise<SendAddressListResult<T>> {
  try {
    const response = await fetcher(endpointFor(kind), { cache: "no-store" });
    if (response.status === 401) {
      return { addresses: [], error: null, unauthorized: true };
    }
    const json = await readJson<ApiList<T>>(response);
    if (response.ok && json?.ok && Array.isArray(json.data)) {
      return { addresses: json.data, error: null, unauthorized: false };
    }
  } catch {
    // Handled by visible caller error.
  }

  return { addresses: [], error: loadErrorFor(kind), unauthorized: false };
}
