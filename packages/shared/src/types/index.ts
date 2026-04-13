export type ParcelStatus = "registered" | "in_transit" | "delivered" | "failed";
export type PickupRequestStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type ParcelSize = "S" | "M" | "L" | "XL";
export type NotificationType = "pickup_confirmed" | "pickup_reminder" | "parcel_status";
export type AdminRole = "staff" | "superadmin";

export interface User {
  id: string;
  lineUserId: string;
  displayName: string | null;
  pictureUrl: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string | null;
  role: AdminRole;
  createdAt: string;
}

export interface Parcel {
  id: string;
  trackingId: string;
  userId: string | null;
  destination: string | null;
  weightKg: string | null;
  size: ParcelSize | string | null;
  status: ParcelStatus | string;
  price: string | null;
  isPaid: boolean;
  source: string;
  legacyRefId: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface PickupSlot {
  id: string;
  date: string;
  timeWindow: string;
  maxCapacity: number;
  bookedCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface PickupRequest {
  id: string;
  userId: string;
  slotId: string;
  address: string;
  note: string | null;
  status: PickupRequestStatus | string;
  parcelIds: string[] | null;
  confirmedBy: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface NotificationLogEntry {
  id: string;
  userId: string | null;
  lineUserId: string;
  type: NotificationType | string;
  payload: unknown;
  sentAt: string;
  status: string;
}

export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
