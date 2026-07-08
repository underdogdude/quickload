import type { RecipientAddress, SenderAddress } from "@quickload/shared/types";
import { describe, expect, it, vi } from "vitest";
import { loadAddressByIdForSend, pickFreshAddressForSend } from "./send-address-loader";

const sender: SenderAddress = {
  id: "sender-1",
  userId: "user-1",
  contactName: "Sender One",
  phone: "0812345678",
  addressLine: "123 Sender Road",
  tambon: "บางรัก",
  amphoe: "บางรัก",
  province: "กรุงเทพมหานคร",
  zipcode: "10500",
  isPrimary: true,
  createdAt: "2026-07-08T00:00:00.000Z",
  updatedAt: null,
};

const recipient: RecipientAddress = {
  id: "recipient-1",
  userId: "user-1",
  contactName: "Recipient One",
  phone: "0898765432",
  addressLine: "456 Recipient Road",
  tambon: "คลองตัน",
  amphoe: "คลองเตย",
  province: "กรุงเทพมหานคร",
  zipcode: "10110",
  isPrimary: false,
  createdAt: "2026-07-08T00:00:00.000Z",
  updatedAt: null,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("loadAddressByIdForSend", () => {
  it("loads sender from the saved ID endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: sender }));

    const result = await loadAddressByIdForSend<SenderAddress>("sender", sender.id, fetcher);

    expect(result).toEqual({
      address: sender,
      error: null,
      fromFallbackList: false,
      unauthorized: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("/api/sender-addresses/sender-1", { cache: "no-store" });
  });

  it("loads recipient from the saved ID endpoint", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ ok: true, data: recipient }));

    const result = await loadAddressByIdForSend<RecipientAddress>("recipient", recipient.id, fetcher);

    expect(result.address).toEqual(recipient);
    expect(result.fromFallbackList).toBe(false);
    expect(fetcher).toHaveBeenCalledWith("/api/recipient-addresses/recipient-1", { cache: "no-store" });
  });

  it("uses the full sender list when the saved ID endpoint fails", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: "Not found" }, 404))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: [{ ...sender, id: "other" }, sender] }));

    const result = await loadAddressByIdForSend<SenderAddress>("sender", sender.id, fetcher);

    expect(result.address).toEqual(sender);
    expect(result.error).toBeNull();
    expect(result.fromFallbackList).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("returns a visible error when single and list fetches both fail", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: "Server error" }, 500))
      .mockRejectedValueOnce(new Error("network down"));

    const result = await loadAddressByIdForSend<RecipientAddress>("recipient", recipient.id, fetcher);

    expect(result.address).toBeNull();
    expect(result.error).toBe("โหลดข้อมูลผู้รับไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    expect(result.unauthorized).toBe(false);
  });

  it("signals unauthorized instead of silently rendering empty state", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "Unauthorized" }, 401));

    const result = await loadAddressByIdForSend<SenderAddress>("sender", sender.id, fetcher);

    expect(result).toEqual({
      address: null,
      error: null,
      fromFallbackList: false,
      unauthorized: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("pickFreshAddressForSend", () => {
  it("keeps handoff data when verification returns an older row for the same address", () => {
    const handoff = {
      ...recipient,
      contactName: "Updated Recipient",
      updatedAt: "2026-07-08T08:00:00.000Z",
    };
    const staleVerification = {
      ...recipient,
      contactName: "Old Recipient",
      updatedAt: "2026-07-08T07:59:59.000Z",
    };

    expect(pickFreshAddressForSend(handoff, staleVerification)).toEqual(handoff);
  });

  it("keeps handoff data when stale verification has the same timestamp precision", () => {
    const handoff = {
      ...recipient,
      contactName: "Updated Recipient",
      updatedAt: "2026-07-08T08:00:00.000Z",
    };
    const staleVerification = {
      ...recipient,
      contactName: "Old Recipient",
      updatedAt: "2026-07-08T08:00:00.000Z",
    };

    expect(pickFreshAddressForSend(handoff, staleVerification)).toEqual(handoff);
  });

  it("keeps handoff data when verification does not include a usable timestamp", () => {
    const handoff = {
      ...sender,
      contactName: "Updated Sender",
      updatedAt: "2026-07-08T08:00:00.000Z",
    };
    const staleVerification = {
      ...sender,
      contactName: "Old Sender",
      updatedAt: null,
    };

    expect(pickFreshAddressForSend(handoff, staleVerification)).toEqual(handoff);
  });

  it("uses verification data when it is equal or newer than the handoff row", () => {
    const handoff = {
      ...sender,
      contactName: "Updated Sender",
      updatedAt: "2026-07-08T08:00:00.000Z",
    };
    const confirmed = {
      ...sender,
      contactName: "Confirmed Sender",
      updatedAt: "2026-07-08T08:00:01.000Z",
    };

    expect(pickFreshAddressForSend(handoff, confirmed)).toEqual(confirmed);
  });
});
