import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
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
  /** Thailand Post item id: 13 chars, typically `WB` + 9 digits + `TH` (e.g. WB222126989TH). */
  barcode: text("barcode"),
  userId: uuid("user_id").references(() => users.id),
  destination: text("destination"),
  weightKg: numeric("weight_kg", { precision: 12, scale: 3 }),
  size: text("size"),
  parcelType: text("parcel_type"),
  /** Optional user remark from /send; max 50 chars (see parcels_note_length_chk). */
  note: text("note"),
  status: text("status").notNull().default("registered"),
  /** Customer billable total (Sell tier + remote + insurance); set by thai-post-webhook from actual weight. */
  price: numeric("price", { precision: 14, scale: 2 }),
  isPaid: boolean("is_paid").notNull().default(false),
  source: text("source").notNull().default("self"),
  /** Set once by the future Smartpost shipped-webhook. NULL = penalty clock not started. */
  penaltyClockStartedAt: timestamp("penalty_clock_started_at", { withTimezone: true }),
  /** Maintained by DB trigger as SUM(payments.amount WHERE status='succeeded'). */
  amountPaid: numeric("amount_paid", { precision: 14, scale: 2 }).notNull().default("0"),
  /** Set when billable price is computed from actual weight (Sell tier + surcharges). */
  thaiPostPriceConfirmedAt: timestamp("thai_post_price_confirmed_at", { withTimezone: true }),
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
  /** SmartPost box classification, e.g. BF. Distinct from parcel dimensions. */
  boxsize: text("boxsize"),
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

/** Latest Thailand Post webhook snapshot per parcel; `status_history` holds every received update (oldest → newest). */
export const thaiPostWebhookEvents = pgTable("thai_post_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  parcelId: uuid("parcel_id")
    .notNull()
    .references(() => parcels.id, { onDelete: "cascade" })
    .unique(),
  barcode: text("barcode").notNull(),
  statusCode: text("status_code").notNull(),
  statusDescription: text("status_description"),
  statusDateRaw: text("status_date_raw"),
  station: text("station"),
  statusHistory: jsonb("status_history").notNull().default(sql`'[]'::jsonb`),
  rawPayload: jsonb("raw_payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const internalEvents = pgTable(
  "internal_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    eventKey: text("event_key").notNull(),
    payload: jsonb("payload"),
    status: text("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => ({
    eventKeyIdx: uniqueIndex("internal_events_event_key_idx").on(table.eventKey),
    statusNextAttemptIdx: index("internal_events_status_next_attempt_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    typeCreatedAtIdx: index("internal_events_type_created_at_idx").on(table.type, table.createdAt),
  }),
);

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

export const ishipPickupRequests = pgTable(
  "iship_pickup_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    idempotencyKey: text("idempotency_key").notNull(),
    inputSource: text("input_source").notNull(),
    senderAddressId: uuid("sender_address_id").references(() => senderAddresses.id, {
      onDelete: "set null",
    }),
    contactName: text("contact_name").notNull(),
    contactPhone: text("contact_phone").notNull(),
    pickupAddressLine: text("pickup_address_line").notNull(),
    pickupTambon: text("pickup_tambon").notNull(),
    pickupAmphoe: text("pickup_amphoe").notNull(),
    pickupProvince: text("pickup_province").notNull(),
    pickupZipcode: text("pickup_zipcode").notNull(),
    pickupAddressFull: text("pickup_address_full").notNull(),
    parcelCount: integer("parcel_count").notNull(),
    heaviestWeightKg: numeric("heaviest_weight_kg", { precision: 10, scale: 3 }).notNull(),
    courierCode: text("courier_code").notNull(),
    remark: text("remark").notNull().default(""),
    status: text("status").notNull().default("submitting"),
    ishipTicketPickupId: text("iship_ticket_pickup_id"),
    ishipRecordId: text("iship_record_id"),
    ishipStatusCode: text("iship_status_code"),
    ishipStatusText: text("iship_status_text"),
    providerMessage: text("provider_message"),
    staffInfoName: text("staff_info_name"),
    staffInfoPhone: text("staff_info_phone"),
    timeoutAtText: text("timeout_at_text"),
    ticketMessage: text("ticket_message"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    ishipRequestJson: jsonb("iship_request_json"),
    ishipResponseJson: jsonb("iship_response_json"),
    ishipCancelResponseJson: jsonb("iship_cancel_response_json"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    userIdempotencyIdx: uniqueIndex("iship_pickup_requests_user_idempotency_idx").on(
      table.userId,
      table.idempotencyKey,
    ),
    ticketIdx: uniqueIndex("iship_pickup_requests_ticket_idx").on(table.ishipTicketPickupId),
    userCreatedIdx: index("iship_pickup_requests_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
    statusIdx: index("iship_pickup_requests_status_idx").on(table.status),
  }),
);

export const ishipPickupRequestParcels = pgTable(
  "iship_pickup_request_parcels",
  {
    pickupRequestId: uuid("pickup_request_id")
      .notNull()
      .references(() => ishipPickupRequests.id, { onDelete: "cascade" }),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id, { onDelete: "cascade" }),
    trackingCode: text("tracking_code").notNull(),
    barcode: text("barcode"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.pickupRequestId, table.parcelId] }),
    parcelIdx: index("iship_pickup_request_parcels_parcel_idx").on(table.parcelId),
  }),
);

export const ishipPickupWebhookLogs = pgTable(
  "iship_pickup_webhook_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketPickupId: text("ticket_pickup_id"),
    pickupRequestId: uuid("pickup_request_id").references(() => ishipPickupRequests.id, {
      onDelete: "set null",
    }),
    authenticated: boolean("authenticated").notNull().default(false),
    processed: boolean("processed").notNull().default(false),
    outcome: text("outcome"),
    rawPayload: jsonb("raw_payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    ticketIdx: index("iship_pickup_webhook_logs_ticket_idx").on(table.ticketPickupId),
    requestIdx: index("iship_pickup_webhook_logs_request_idx").on(table.pickupRequestId),
  }),
);

/**
 * Shipping price tiers.
 * Lookup: find the row with the smallest weight_up_to_grams >= actual_weight_grams.
 * price_thb is the final sell price (THB) — no adjustments needed.
 */
export const pricingTiers = pgTable("pricing_tiers", {
  weightUpToGrams: integer("weight_up_to_grams").primaryKey(),
  priceThb: integer("price_thb").notNull(),
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
  redirectUrl: text("redirect_url"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  rawCreateResponse: jsonb("raw_create_response"),
  rawWebhookPayload: jsonb("raw_webhook_payload"),
  idempotencyKey: text("idempotency_key"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});
