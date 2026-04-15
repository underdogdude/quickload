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
  trackingId: text("tracking_id").notNull().unique(),
  userId: uuid("user_id").references(() => users.id),
  destination: text("destination"),
  weightKg: numeric("weight_kg", { precision: 12, scale: 3 }),
  size: text("size"),
  status: text("status").notNull().default("registered"),
  price: numeric("price", { precision: 14, scale: 2 }),
  isPaid: boolean("is_paid").notNull().default(false),
  source: text("source").notNull().default("self"),
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
