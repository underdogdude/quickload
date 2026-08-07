import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACTIVE_PICKUP_STATUSES = [
  "submitting",
  "requested",
  "assigned",
  "unknown",
];
const CONFIRMATION = "RESET_TEST_USER";

function usage() {
  console.log(`Reset one Quickload test user without touching other users or configuration.

Dry run:
  pnpm db:reset:test-user -- --phone 08XXXXXXXX --dry-run

Delete after reviewing the dry run:
  pnpm db:reset:test-user -- --phone 08XXXXXXXX --confirm ${CONFIRMATION}

Alternative identifiers:
  --line-user-id <LINE user id>
  --user-id <Quickload user UUID>

The command refuses to delete a user with an active pickup request.`);
}

function parseArgs(argv) {
  const args = argv.filter((arg) => arg !== "--");
  const result = {
    phone: "",
    lineUserId: "",
    userId: "",
    dryRun: false,
    confirm: "",
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      continue;
    }
    if (arg === "--dry-run") {
      result.dryRun = true;
      continue;
    }
    if (["--phone", "--line-user-id", "--user-id", "--confirm"].includes(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      if (arg === "--phone") result.phone = value;
      if (arg === "--line-user-id") result.lineUserId = value;
      if (arg === "--user-id") result.userId = value;
      if (arg === "--confirm") result.confirm = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return result;
}

function findDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const candidates = [
    path.join(__dirname, "../../../apps/user/.env.local"),
    path.join(__dirname, "../../../apps/user/.env"),
    path.join(__dirname, "../.env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (!trimmed.startsWith("DATABASE_URL=")) continue;
      let value = trimmed.slice("DATABASE_URL=".length).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      return value;
    }
  }
  return null;
}

function mask(value, visible = 4) {
  if (!value) return null;
  if (value.length <= visible) return "*".repeat(value.length);
  return `${"*".repeat(Math.min(8, value.length - visible))}${value.slice(-visible)}`;
}

async function oneCount(query) {
  const [row] = await query;
  return Number(row?.count ?? 0);
}

async function findUsers(sql, args) {
  if (args.userId) {
    return sql`
      select id, line_user_id, display_name, phone, created_at
      from users
      where id = ${args.userId}::uuid
    `;
  }
  if (args.lineUserId) {
    return sql`
      select id, line_user_id, display_name, phone, created_at
      from users
      where line_user_id = ${args.lineUserId}
    `;
  }
  const phoneDigits = args.phone.replace(/\D/g, "");
  return sql`
    select id, line_user_id, display_name, phone, created_at
    from users
    where regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') = ${phoneDigits}
  `;
}

async function inspectUser(sql, user) {
  const userId = user.id;
  const lineUserId = user.line_user_id;
  const [
    senders,
    recipients,
    parcels,
    orders,
    payments,
    thaiPostWebhooks,
    pickupRequests,
    pickupParcels,
    pickupWebhooks,
    notifications,
    internalEvents,
    activePickups,
  ] = await Promise.all([
    oneCount(sql`select count(*)::int as count from sender_addresses where user_id = ${userId}`),
    oneCount(sql`select count(*)::int as count from recipient_addresses where user_id = ${userId}`),
    oneCount(sql`select count(*)::int as count from parcels where user_id = ${userId}`),
    oneCount(sql`
      select count(*)::int as count
      from orders
      where user_id = ${userId}
         or parcel_id in (select id from parcels where user_id = ${userId})
    `),
    oneCount(sql`
      select count(*)::int as count
      from payments
      where user_id = ${userId}
         or parcel_id in (select id from parcels where user_id = ${userId})
    `),
    oneCount(sql`
      select count(*)::int as count
      from thai_post_webhook_events
      where parcel_id in (select id from parcels where user_id = ${userId})
    `),
    oneCount(sql`select count(*)::int as count from iship_pickup_requests where user_id = ${userId}`),
    oneCount(sql`
      select count(*)::int as count
      from iship_pickup_request_parcels
      where pickup_request_id in (
        select id from iship_pickup_requests where user_id = ${userId}
      )
    `),
    oneCount(sql`
      select count(*)::int as count
      from iship_pickup_webhook_logs
      where pickup_request_id in (
        select id from iship_pickup_requests where user_id = ${userId}
      )
    `),
    oneCount(sql`
      select count(*)::int as count
      from notification_log
      where user_id = ${userId} or line_user_id = ${lineUserId}
    `),
    oneCount(sql`
      select count(*)::int as count
      from internal_events
      where payload->>'userId' = ${userId}
         or payload->>'lineUserId' = ${lineUserId}
    `),
    sql`
      select id, iship_ticket_pickup_id, status, created_at
      from iship_pickup_requests
      where user_id = ${userId}
        and status in ${sql(ACTIVE_PICKUP_STATUSES)}
      order by created_at desc
    `,
  ]);

  return {
    counts: {
      senderAddresses: senders,
      recipientAddresses: recipients,
      parcels,
      orders,
      payments,
      thaiPostWebhookEvents: thaiPostWebhooks,
      pickupRequests,
      pickupRequestParcels: pickupParcels,
      pickupWebhookLogs: pickupWebhooks,
      notifications,
      internalEvents,
    },
    activePickups,
  };
}

async function deleteUserData(sql, user) {
  const userId = user.id;
  const lineUserId = user.line_user_id;

  await sql.begin(async (tx) => {
    const locked = await tx`
      select id
      from users
      where id = ${userId}
      for update
    `;
    if (locked.length !== 1) {
      throw new Error("User disappeared before reset; nothing was deleted.");
    }

    await tx`
      delete from iship_pickup_webhook_logs
      where pickup_request_id in (
        select id from iship_pickup_requests where user_id = ${userId}
      )
    `;
    await tx`delete from iship_pickup_requests where user_id = ${userId}`;
    await tx`
      delete from payments
      where user_id = ${userId}
         or parcel_id in (select id from parcels where user_id = ${userId})
    `;
    await tx`
      delete from thai_post_webhook_events
      where parcel_id in (select id from parcels where user_id = ${userId})
    `;
    await tx`
      delete from orders
      where user_id = ${userId}
         or parcel_id in (select id from parcels where user_id = ${userId})
    `;
    await tx`delete from parcels where user_id = ${userId}`;
    await tx`
      delete from notification_log
      where user_id = ${userId} or line_user_id = ${lineUserId}
    `;
    await tx`
      delete from internal_events
      where payload->>'userId' = ${userId}
         or payload->>'lineUserId' = ${lineUserId}
    `;
    await tx`delete from sender_addresses where user_id = ${userId}`;
    await tx`delete from recipient_addresses where user_id = ${userId}`;
    await tx`delete from users where id = ${userId}`;
  });
}

let args;
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exit(1);
}

if (args.help) {
  usage();
  process.exit(0);
}

const identifiers = [args.phone, args.lineUserId, args.userId].filter(Boolean);
if (identifiers.length !== 1) {
  console.error("Provide exactly one of --phone, --line-user-id, or --user-id.");
  usage();
  process.exit(1);
}
if (args.phone && !/^\d{9,15}$/.test(args.phone.replace(/\D/g, ""))) {
  console.error("--phone must contain 9 to 15 digits.");
  process.exit(1);
}
if (args.dryRun && args.confirm) {
  console.error("Use either --dry-run or --confirm, not both.");
  process.exit(1);
}
if (!args.dryRun && args.confirm !== CONFIRMATION) {
  console.error(`Deletion requires --confirm ${CONFIRMATION}. Run --dry-run first.`);
  process.exit(1);
}

const databaseUrl = findDatabaseUrl();
if (!databaseUrl) {
  console.error("DATABASE_URL not found.");
  process.exit(1);
}

const target = new URL(databaseUrl);
console.log(
  `Database target: ${target.hostname}:${target.port || "default"}/${target.pathname.replace(/^\//, "")}`,
);

const sql = postgres(databaseUrl, { max: 1, prepare: false });
try {
  const users = await findUsers(sql, args);
  if (users.length === 0) {
    console.error("No Quickload user matched that identifier.");
    process.exitCode = 2;
  } else if (users.length > 1) {
    console.error(
      JSON.stringify(
        {
          candidates: users.map((user) => ({
            id: user.id,
            displayName: user.display_name,
            phone: mask(user.phone),
            lineUserId: mask(user.line_user_id, 6),
            createdAt: user.created_at,
          })),
        },
        null,
        2,
      ),
    );
    console.error(`Refusing to continue: ${users.length} users matched.`);
    console.error("Run the dry run again with exactly one candidate: --user-id <UUID>");
    process.exitCode = 2;
  } else {
    const user = users[0];
    const inspection = await inspectUser(sql, user);
    console.log(
      JSON.stringify(
        {
          user: {
            id: user.id,
            displayName: user.display_name,
            phone: mask(user.phone),
            lineUserId: mask(user.line_user_id, 6),
          },
          ...inspection,
        },
        null,
        2,
      ),
    );

    if (args.dryRun) {
      console.log("Dry run only. No data was deleted.");
    } else if (inspection.activePickups.length > 0) {
      console.error(
        `Refusing to reset: ${inspection.activePickups.length} active pickup request(s) must be resolved or cancelled first.`,
      );
      process.exitCode = 3;
    } else {
      await deleteUserData(sql, user);
      console.log(
        "Test user reset complete. Other users, admin users, pricing tiers, and database structure were preserved.",
      );
      console.log(
        "SmartPost/iShip/Beam external records are not deleted by this command. Clear the LINE WebView session before signing up again.",
      );
    }
  }
} finally {
  await sql.end({ timeout: 5 });
}
