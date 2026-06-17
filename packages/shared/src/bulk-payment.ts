export type BulkPaymentMasterMeta = {
  kind: "bulk";
  childPaymentIds: string[];
  parcelIds: string[];
  totalCharged: string;
  itemCount: number;
};

export type BulkPaymentChildMeta = {
  kind: "bulk";
  masterPaymentId: string;
};

function readBulkObject(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const bulk = (raw as Record<string, unknown>)._bulk;
  if (!bulk || typeof bulk !== "object" || Array.isArray(bulk)) return null;
  return bulk as Record<string, unknown>;
}

export function readBulkMasterMeta(raw: unknown): BulkPaymentMasterMeta | null {
  const bulk = readBulkObject(raw);
  if (!bulk || bulk.kind !== "bulk") return null;
  if (!Array.isArray(bulk.childPaymentIds) || !Array.isArray(bulk.parcelIds)) return null;
  const childPaymentIds = bulk.childPaymentIds.filter((id): id is string => typeof id === "string");
  const parcelIds = bulk.parcelIds.filter((id): id is string => typeof id === "string");
  if (typeof bulk.totalCharged !== "string" || typeof bulk.itemCount !== "number") return null;
  return {
    kind: "bulk",
    childPaymentIds,
    parcelIds,
    totalCharged: bulk.totalCharged,
    itemCount: bulk.itemCount,
  };
}

export function readBulkChildMeta(raw: unknown): BulkPaymentChildMeta | null {
  const bulk = readBulkObject(raw);
  if (!bulk || bulk.kind !== "bulk") return null;
  if (typeof bulk.masterPaymentId !== "string" || bulk.masterPaymentId.trim() === "") return null;
  if (Array.isArray(bulk.childPaymentIds)) return null;
  return { kind: "bulk", masterPaymentId: bulk.masterPaymentId };
}

export function withBulkMasterMeta(
  beamRaw: unknown,
  meta: BulkPaymentMasterMeta,
): Record<string, unknown> {
  const base =
    beamRaw && typeof beamRaw === "object" && !Array.isArray(beamRaw)
      ? { ...(beamRaw as Record<string, unknown>) }
      : {};
  return { ...base, _bulk: meta };
}

export function withBulkChildMeta(meta: BulkPaymentChildMeta): Record<string, unknown> {
  return { _bulk: meta };
}
