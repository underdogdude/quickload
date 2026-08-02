"use client";

const PICKUP_DRAFT_KEY = "quickload:pickup-draft:v1";

export type PickupDraft = {
  senderAddressId: string | null;
  selectedParcelIds: string[];
  remark: string;
  announcement?: string;
};

const EMPTY_PICKUP_DRAFT: PickupDraft = {
  senderAddressId: null,
  selectedParcelIds: [],
  remark: "",
};

export function readPickupDraft(): PickupDraft {
  if (typeof window === "undefined") return EMPTY_PICKUP_DRAFT;
  try {
    const raw = window.sessionStorage.getItem(PICKUP_DRAFT_KEY);
    if (!raw) return EMPTY_PICKUP_DRAFT;
    const value = JSON.parse(raw) as Partial<PickupDraft>;
    return {
      senderAddressId:
        typeof value.senderAddressId === "string" ? value.senderAddressId : null,
      selectedParcelIds: Array.isArray(value.selectedParcelIds)
        ? value.selectedParcelIds.filter(
            (id): id is string => typeof id === "string" && Boolean(id),
          )
        : [],
      remark: typeof value.remark === "string" ? value.remark.slice(0, 500) : "",
      announcement:
        typeof value.announcement === "string" ? value.announcement : undefined,
    };
  } catch {
    return EMPTY_PICKUP_DRAFT;
  }
}

export function writePickupDraft(draft: PickupDraft) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PICKUP_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // The flow still works when storage is unavailable; only draft restoration is skipped.
  }
}

export function clearPickupDraft() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PICKUP_DRAFT_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}
