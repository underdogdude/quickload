import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  lineUserId: text("line_user_id").notNull().unique(),
  displayName: text("display_name"),
  pictureUrl: text("picture_url"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  email: text("email"),
  birthDate: date("birth_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const adminUsers = pgTable("admin_users", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  role: text("role").notNull().default("staff"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const parcels = pgTable("parcels", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Primary public tracking: Smartpost `smartpost_trackingcode` when available, else barcode / draft id. */
  trackingId: text("tracking_id").notNull().unique(),
  /** Thailand Post–style barcode (e.g. WB…TH) when Smartpost returns it; may differ from `tracking_id`. */
  barcode: text("barcode"),
  userId: uuid("user_id").references(() => users.id),
  destination: text("destination"),
  weightKg: numeric("weight_kg", { precision: 12, scale: 3 }),
  size: text("size"),
  parcelType: text("parcel_type"),
  status: text("status").notNull().default("registered"),
  price: numeric("price", { precision: 14, scale: 2 }),
  isPaid: boolean("is_paid").notNull().default(false),
  source: text("source").notNull().default("self"),
  /** Set once by the future Smartpost shipped-webhook. NULL = penalty clock not started. */
  penaltyClockStartedAt: timestamp("penalty_clock_started_at", { withTimezone: true }),
  /** Maintained by DB trigger as SUM(payments.amount WHERE status='succeeded'). */
  amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

/** Smartpost addItem success snapshot; one row per parcel after carrier accepts the order. */
export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .notNull()
    .references(() => parcels.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  statuscode: text("statuscode"),
  message: text("message"),
  smartpostTrackingcode: text("smartpost_trackingcode"),
  barcode: text("barcode"),
  serviceType: text("service_type"),
  productInbox: text("product_inbox"),
  productWeight: text("product_weight"),
  productPrice: text("product_price"),
  shipperName: text("shipper_name"),
  shipperAddress: text("shipper_address"),
  shipperSubdistrict: text("shipper_subdistrict"),
  shipperDistrict: text("shipper_district"),
  shipperProvince: text("shipper_province"),
  shipperZipcode: text("shipper_zipcode"),
  shipperEmail: text("shipper_email"),
  shipperMobile: text("shipper_mobile"),
  cusName: text("cus_name"),
  cusAdd: text("cus_add"),
  cusSub: text("cus_sub"),
  cusAmp: text("cus_amp"),
  cusProv: text("cus_prov"),
  cusZipcode: text("cus_zipcode"),
  cusTel: text("cus_tel"),
  cusEmail: text("cus_email"),
  customerCode: text("customer_code"),
  cost: numeric("cost", { precision: 14, scale: 2 }),
  finalcost: numeric("finalcost", { precision: 14, scale: 2 }),
  orderStatus: text("order_status"),
  items: text("items"),
  insuranceRatePrice: text("insurance_rate_price"),
  referenceId: text("reference_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const pickupSlots = pgTable("pickup_slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  date: date("date", { mode: "string" }).notNull(),
  timeWindow: text("time_window").notNull(),
  maxCapacity: integer("max_capacity").notNull().default(10),
  bookedCount: integer("booked_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notificationLog = pgTable("notification_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  lineUserId: text("line_user_id").notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload"),
  sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  status: text("status").notNull().default("sent"),
});

/** Saved sender (address book) for parcel registration; one user may have many. */
export const senderAddresses = pgTable("sender_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  phone: text("phone").notNull(),
  addressLine: text("address_line").notNull(),
  tambon: text("tambon").notNull(),
  amphoe: text("amphoe").notNull(),
  province: text("province").notNull(),
  zipcode: text("zipcode").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

/** Saved recipient (address book) for parcel registration; one user may have many. */
export const recipientAddresses = pgTable("recipient_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  contactName: text("contact_name").notNull(),
  phone: text("phone").notNull(),
  addressLine: text("address_line").notNull(),
  tambon: text("tambon").notNull(),
  amphoe: text("amphoe").notNull(),
  province: text("province").notNull(),
  zipcode: text("zipcode").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

/** Payment attempts for parcels; provider is currently always 'beam' (Beam Checkout). */
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .notNull()
    .references(() => parcels.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  provider: text("provider").notNull().default("beam"),
  providerChargeId: text("provider_charge_id").unique(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("THB"),
  paymentMethod: text("payment_method").notNull().default("promptpay"),
  // 'pending' | 'succeeded' | 'failed' | 'expired' | 'canceled'
  status: text("status").notNull().default("pending"),
  qrPayload: text("qr_payload"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  rawCreateResponse: jsonb("raw_create_response"),
  rawWebhookPayload: jsonb("raw_webhook_payload"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
