import { describe, expect, it } from "vitest";
import { signIshipRelayPayload, verifyIshipRelaySignature } from "./iship-relay-auth";

const SECRET = "smartpost-quickload-test-secret";
const BODY = JSON.stringify({ ticketPickupId: 15315219, status: "assigned" });
const NOW_MS = 1_800_000_000_000;
const TIMESTAMP = String(Math.floor(NOW_MS / 1000));

describe("iShip SmartPost relay authentication", () => {
  it("accepts the exact raw body signed by SmartPost", () => {
    const signature = signIshipRelayPayload(BODY, TIMESTAMP, SECRET);
    expect(signature).toBe(
      "sha256=aa73a631258db0a443977848456446fbcda97edb8bd5870ef38e3731f8fde131",
    );
    expect(
      verifyIshipRelaySignature({
        rawBody: BODY,
        timestamp: TIMESTAMP,
        signature,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(true);
  });

  it("rejects tampered bodies and signatures", () => {
    const signature = signIshipRelayPayload(BODY, TIMESTAMP, SECRET);
    expect(
      verifyIshipRelaySignature({
        rawBody: `${BODY} `,
        timestamp: TIMESTAMP,
        signature,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false);
    expect(
      verifyIshipRelaySignature({
        rawBody: BODY,
        timestamp: TIMESTAMP,
        signature: `sha256=${"0".repeat(64)}`,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });

  it("rejects stale or excessively future-dated requests", () => {
    const stale = String(Math.floor(NOW_MS / 1000) - 301);
    const future = String(Math.floor(NOW_MS / 1000) + 301);
    expect(
      verifyIshipRelaySignature({
        rawBody: BODY,
        timestamp: stale,
        signature: signIshipRelayPayload(BODY, stale, SECRET),
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false);
    expect(
      verifyIshipRelaySignature({
        rawBody: BODY,
        timestamp: future,
        signature: signIshipRelayPayload(BODY, future, SECRET),
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toBe(false);
  });
});
