export const EXCLUDED_PROFILE_PICKUP_STATUSES = ["failed", "cancelled"] as const;

export function formatShortQuickloadId(userId: string | null | undefined): string {
  const normalized = userId?.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() ?? "";
  return `QL-${normalized.slice(0, 8) || "MEMBER"}`;
}

export function shouldCountProfilePickup(status: string): boolean {
  return !EXCLUDED_PROFILE_PICKUP_STATUSES.includes(
    status as (typeof EXCLUDED_PROFILE_PICKUP_STATUSES)[number],
  );
}
