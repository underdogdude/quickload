export const LIFF_INIT_TIMEOUT_MS = 10000;
export const LIFF_INIT_TIMEOUT_ERROR = "LIFF_INIT_TIMEOUT";

type LiffInitClient = {
  init(options: { liffId: string }): Promise<void>;
};

export function cleanEntryRedirectUrl(location: Pick<Location, "origin" | "pathname">) {
  return `${location.origin}${location.pathname}`;
}

export function isLiffInitTimeout(error: unknown) {
  return error instanceof Error && error.message === LIFF_INIT_TIMEOUT_ERROR;
}

export function startLiffInit<TLiff extends LiffInitClient>(
  liff: TLiff,
  liffId: string,
  timeoutMs = LIFF_INIT_TIMEOUT_MS,
): Promise<TLiff> {
  const p = (async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        liff.init({ liffId }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error(LIFF_INIT_TIMEOUT_ERROR)), timeoutMs);
        }),
      ]);
      return liff;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  })();
  p.catch(() => {});
  return p;
}
