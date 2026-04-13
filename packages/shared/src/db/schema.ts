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
  phone: text("phone"),
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
  trackingId: text("tracking_id").notNull().unique(),
  userId: uuid("user_id").references(() => users.id),
  destination: text("destination"),
  weightKg: numeric("weight_kg", { precision: 12, scale: 3 }),
  size: text("size"),
  status: text("status").notNull().default("registered"),
  price: numeric("price", { precision: 14, scale: 2 }),
  isPaid: boolean("is_paid").notNull().default(false),
  source: text("source").notNull().default("self"),
  legacyRefId: text("legacy_ref_id"),
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

export const pickupRequests = pgTable("pickup_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  slotId: uuid("slot_id")
    .notNull()
    .references(() => pickupSlots.id),
  address: text("address").notNull(),
  note: text("note"),
  status: text("status").notNull().default("pending"),
  parcelIds: text("parcel_ids").array(),
  confirmedBy: uuid("confirmed_by").references(() => adminUsers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
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
