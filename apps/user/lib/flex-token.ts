import { createHmac, timingSafeEqual } from "crypto";

/** Actions that can be encoded in a Flex message token. */
export type FlexTokenAction = "label" | "track";

type FlexTokenPayload = {
  userId: string;
  parcelId: string;
  action: FlexTokenAction;
  exp: number;
};

const TOKEN_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

function getSecret(): string {
  const secret = process.env.IRON_SESSION_PASSWORD;
  if (!secret || secret.length < 32) {
    throw new Error("IRON_SESSION_PASSWORD must be set and at least 32 characters");
  }
  return secret;
}

/**
 * Creates a signed token for embedding in LINE Flex message URLs.
 * The token encodes userId + parcelId + action + expiry and is signed with
 * HMAC-SHA256 using IRON_SESSION_PASSWORD. Valid for 90 days.
 */
export function createFlexToken(payload: {
  userId: string;
  parcelId: string;
  action: FlexTokenAction;
}): string {
  const exp = Date.now() + TOKEN_EXPIRY_MS;
  const data = JSON.stringify({ ...payload, exp } satisfies FlexTokenPayload);
  const encoded = Buffer.from(data, "utf8").toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(encoded).digest("hex");
  return `${encoded}.${sig}`;
}

/**
 * Verifies a Flex token. Returns the payload if valid; null otherwise.
 * Performs constant-time HMAC comparison to resist timing attacks.
 */
export function verifyFlexToken(token: string): FlexTokenPayload | null {
  try {
    const dotIndex = token.lastIndexOf(".");
    if (dotIndex === -1) return null;

    const encoded = token.slice(0, dotIndex);
    const sig = token.slice(dotIndex + 1);
    if (!encoded || !sig) return null;

    const expectedSig = createHmac("sha256", getSecret()).update(encoded).digest("hex");

    // timingSafeEqual requires equal-length buffers; wrap in try-catch for safety.
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    try {
      if (!timingSafeEqual(sigBuf, expectedBuf)) return null;
    } catch {
      // Different buffer lengths → invalid token
      return null;
    }

    const data = Buffer.from(encoded, "base64url").toString("utf8");
    const parsed = JSON.parse(data) as Partial<FlexTokenPayload>;

    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.parcelId !== "string" ||
      typeof parsed.action !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    if (parsed.exp < Date.now()) return null;

    return {
      userId: parsed.userId,
      parcelId: parsed.parcelId,
      action: parsed.action as FlexTokenAction,
      exp: parsed.exp,
    };
  } catch {
    return null;
  }
}
