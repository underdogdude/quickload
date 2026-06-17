const LOCAL_HOST_RE = /^(0\.0\.0\.0|localhost|127\.0\.0\.1)(:\d+)?$/i;

function isLocalHost(host: string): boolean {
  return LOCAL_HOST_RE.test(host);
}

/**
 * Resolves the public-facing base URL for links and redirects.
 * Prefers env vars, then proxy headers, then the Host header (tunnel/LIFF),
 * and finally request.url origin — never returns 0.0.0.0 or localhost.
 */
export function resolvePublicBaseUrl(request: Request): string | null {
  const envBase =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_BASE_URL?.trim() ||
    process.env.PUBLIC_BASE_URL?.trim() ||
    "";
  if (envBase) {
    try {
      const host = new URL(envBase).host;
      if (isLocalHost(host)) return null;
      return envBase.replace(/\/+$/, "");
    } catch {
      return null;
    }
  }

  const forwardedProto = request.headers.get("x-forwarded-proto")?.trim();
  const forwardedHost = request.headers.get("x-forwarded-host")?.trim();
  if (forwardedProto && forwardedHost && !isLocalHost(forwardedHost)) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, "");
  }

  const host = request.headers.get("host")?.trim();
  if (host && !isLocalHost(host)) {
    const proto =
      forwardedProto ||
      (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  try {
    const origin = new URL(request.url).origin;
    const originHost = new URL(origin).host;
    if (isLocalHost(originHost)) return null;
    return origin.replace(/\/+$/, "");
  } catch {
    return null;
  }
}
