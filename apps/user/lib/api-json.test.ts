import { describe, expect, it } from "vitest";
import { readApiJson } from "./api-json";

describe("readApiJson", () => {
  it("returns valid JSON responses", async () => {
    await expect(
      readApiJson<{ ok: boolean }>(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("replaces an HTML error page with a customer-safe message", async () => {
    await expect(
      readApiJson(new Response("<!DOCTYPE html><html></html>", { status: 404 }), "ระบบเรียกรถเข้ารับยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง"),
    ).rejects.toThrow("ระบบเรียกรถเข้ารับยังไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง");
  });
});
