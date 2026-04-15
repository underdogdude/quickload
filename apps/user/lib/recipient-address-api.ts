import type { InferSelectModel } from "drizzle-orm";
import { recipientAddresses } from "@quickload/shared/db";
import type { RecipientAddress } from "@quickload/shared/types";

type Row = InferSelectModel<typeof recipientAddresses>;

export function serializeRecipientAddress(row: Row): RecipientAddress {
  return {
    id: row.id,
    userId: row.userId,
    contactName: row.contactName,
    phone: row.phone,
    addressLine: row.addressLine,
    tambon: row.tambon,
    amphoe: row.amphoe,
    province: row.province,
    zipcode: row.zipcode,
    isPrimary: row.isPrimary,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt:
      row.updatedAt == null
        ? null
        : row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt),
  };
}
