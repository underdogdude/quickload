import type { RecipientAddress, SenderAddress } from "@quickload/shared/types";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { getDb, recipientAddresses, senderAddresses } from "@quickload/shared/db";
import { getCurrentUser } from "@/lib/current-user";
import { serializeRecipientAddress } from "@/lib/recipient-address-api";
import { serializeSenderAddress } from "@/lib/sender-address-api";

type TabKey = "sender" | "recipient";

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

function formatAddress(address: SenderAddress | RecipientAddress) {
  return `${address.addressLine}, ${address.tambon}, ${address.amphoe}, ${address.province}, ${address.zipcode}`;
}

function asString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function buildSendBaseHref(params: Record<string, string>): string {
  const carry = [
    "senderId",
    "recipientId",
    "shippingMode",
    "autoPrint",
    "weightGram",
    "widthCm",
    "lengthCm",
    "heightCm",
    "parcelType",
    "note",
  ] as const;
  const usp = new URLSearchParams();
  for (const key of carry) {
    const v = params[key];
    if (v) usp.set(key, v);
  }
  const q = usp.toString();
  return q ? `/send?${q}` : "/send";
}

function buildRowHref(id: string, rowTab: TabKey, params: Record<string, string>, fromSend: boolean): string {
  if (!fromSend) {
    return rowTab === "sender" ? `/send/sender?id=${id}` : `/send/recipient?id=${id}`;
  }
  const usp = new URLSearchParams();
  if (rowTab === "sender") usp.set("senderId", id);
  else usp.set("recipientId", id);
  if (rowTab === "sender" && params.recipientId) usp.set("recipientId", params.recipientId);
  if (rowTab === "recipient" && params.senderId) usp.set("senderId", params.senderId);
  for (const key of ["shippingMode", "autoPrint", "weightGram", "widthCm", "lengthCm", "heightCm", "parcelType", "note"] as const) {
    if (params[key]) usp.set(key, params[key]);
  }
  return `/send?${usp.toString()}`;
}

function buildTabHref(nextTab: TabKey, raw: Record<string, string | string[] | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    if (!v) continue;
    if (Array.isArray(v)) {
      if (v[0]) usp.set(k, v[0]);
    } else {
      usp.set(k, v);
    }
  }
  usp.set("tab", nextTab);
  return `/addresses?${usp.toString()}`;
}

async function loadAddresses(userId: string): Promise<{
  senders: SenderAddress[];
  recipients: RecipientAddress[];
  error: string | null;
}> {
  try {
    const db = getDb();
    const [senderRows, recipientRows] = await Promise.all([
      db
        .select()
        .from(senderAddresses)
        .where(eq(senderAddresses.userId, userId))
        .orderBy(desc(senderAddresses.isPrimary), desc(senderAddresses.createdAt)),
      db
        .select()
        .from(recipientAddresses)
        .where(eq(recipientAddresses.userId, userId))
        .orderBy(desc(recipientAddresses.isPrimary), desc(recipientAddresses.createdAt)),
    ]);
    return {
      senders: senderRows.map(serializeSenderAddress),
      recipients: recipientRows.map(serializeRecipientAddress),
      error: null,
    };
  } catch {
    return { senders: [], recipients: [], error: "โหลดข้อมูลที่อยู่ไม่สำเร็จ" };
  }
}

export default async function AddressBookPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user.loggedIn || !user.userId) {
    redirect("/entry");
  }

  const tab: TabKey = asString(searchParams.tab) === "recipient" ? "recipient" : "sender";
  const fromSend = asString(searchParams.from) === "send";

  const passthrough: Record<string, string> = {
    senderId: asString(searchParams.senderId),
    recipientId: asString(searchParams.recipientId),
    shippingMode: asString(searchParams.shippingMode),
    autoPrint: asString(searchParams.autoPrint),
    weightGram: asString(searchParams.weightGram),
    widthCm: asString(searchParams.widthCm),
    lengthCm: asString(searchParams.lengthCm),
    heightCm: asString(searchParams.heightCm),
    parcelType: asString(searchParams.parcelType),
    note: asString(searchParams.note),
  };
  const selectedSenderId = passthrough.senderId;
  const selectedRecipientId = passthrough.recipientId;
  const sendBaseHref = buildSendBaseHref(passthrough);

  const { senders, recipients, error } = await loadAddresses(user.userId);

  const activeRows = tab === "sender" ? senders : recipients;
  const emptyText = tab === "sender" ? "ยังไม่มีข้อมูลผู้ส่ง" : "ยังไม่มีข้อมูลผู้รับ";
  const addHref = tab === "sender" ? "/send/sender" : "/send/recipient";
  const selectedId = tab === "sender" ? selectedSenderId : selectedRecipientId;

  return (
    <main className="min-h-screen bg-slate-100 pb-24">
      <section className="bg-[#2726F5] px-6 pb-6 pt-8 text-white">
        <div className="mx-auto w-full max-w-lg">
          <Link
            href={fromSend ? sendBaseHref : "/"}
            className="mb-3 inline-flex items-center gap-1 rounded-full border border-white/40 px-3 py-1.5 text-xs font-medium text-white/95"
          >
            <span aria-hidden>←</span>
            <span>กลับ</span>
          </Link>
          <h1 className="text-3xl font-bold leading-none">สมุดที่อยู่</h1>
          <p className="mt-0 text-base text-white/80">จัดการข้อมูลผู้ส่งและผู้รับ</p>
        </div>
      </section>

      <section className="px-6 py-4">
        <div className="mx-auto w-full max-w-lg space-y-4">
          <div className="rounded-full bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
            <div className="grid grid-cols-2 gap-1">
              <Link
                href={buildTabHref("sender", searchParams)}
                className={`rounded-full px-3 py-2 text-center text-md font-medium transition ${
                  tab === "sender" ? "bg-[#2726F5] text-white" : "text-slate-500"
                }`}
              >
                ผู้ส่ง
              </Link>
              <Link
                href={buildTabHref("recipient", searchParams)}
                className={`rounded-full px-3 py-2 text-center text-md font-medium transition ${
                  tab === "recipient" ? "bg-[#2726F5] text-white" : "text-slate-500"
                }`}
              >
                ผู้รับ
              </Link>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
              {error}
            </div>
          ) : null}

          {activeRows.length === 0 ? (
            <div className="rounded-lg bg-white p-5 text-center shadow-sm ring-1 ring-slate-200">
              <p className="text-sm text-slate-600">{emptyText}</p>
              <Link
                href={addHref}
                className="mt-3 inline-flex rounded-full bg-[#2726F5] px-4 py-2 text-xs font-medium text-white"
              >
                เพิ่มข้อมูล
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {activeRows.map((row) => {
                const selected = selectedId === row.id;
                const href = buildRowHref(row.id, tab, passthrough, fromSend);
                return (
                  <Link
                    key={row.id}
                    href={href}
                    className="block rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {row.contactName}
                          <span className="mx-1 font-light text-slate-400">|</span>
                          {row.phone}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-500">{formatAddress(row)}</p>
                      </div>
                      {selected ? (
                        <span className="w-[60px] rounded-full bg-emerald-100 px-2 py-0.5 text-center text-[11px] font-medium text-emerald-700">
                          เลือกอยู่
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-xs font-medium text-[#2726F5]">
                      {fromSend ? "เลือกที่อยู่นี้" : "แก้ไขข้อมูล"}
                    </p>
                  </Link>
                );
              })}
              <Link
                href={addHref}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  className="bi bi-plus"
                  viewBox="0 0 16 16"
                  aria-hidden
                >
                  <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4" />
                </svg>
                เพิ่มข้อมูลใหม่
              </Link>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
