"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { SEND_ACCESS_BLOCKED_MESSAGE } from "@quickload/shared/send-access-block";

type SendAccessData = {
  blocked: boolean;
  overdueParcelCount: number;
  message: string | null;
};

type SendAccessContextValue = {
  loading: boolean;
  blocked: boolean;
  message: string;
  modalOpen: boolean;
  openBlockedModal: () => void;
  closeBlockedModal: () => void;
  navigateToSend: () => void;
  refresh: (options?: { silent?: boolean }) => Promise<SendAccessData | null>;
  checkBeforeSend: () => Promise<boolean>;
};

const DEFAULT_MESSAGE = SEND_ACCESS_BLOCKED_MESSAGE;

const SendAccessContext = createContext<SendAccessContextValue | null>(null);

function useSendAccessContext(): SendAccessContextValue {
  const ctx = useContext(SendAccessContext);
  if (!ctx) {
    throw new Error("SendAccessProvider is required");
  }
  return ctx;
}

export function useSendAccessBlock() {
  return useSendAccessContext();
}

export function SendAccessProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async (options?: { silent?: boolean }): Promise<SendAccessData | null> => {
    const silent = options?.silent ?? false;
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/send/access", { cache: "no-store" });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: SendAccessData;
      };
      if (res.ok && json.ok && json.data) {
        setBlocked(Boolean(json.data.blocked));
        setMessage(json.data.message?.trim() || DEFAULT_MESSAGE);
        return json.data;
      }
      setBlocked(false);
      return null;
    } catch {
      setBlocked(false);
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const checkBeforeSend = useCallback(async (): Promise<boolean> => {
    const data = await refresh({ silent: true });
    return Boolean(data?.blocked);
  }, [refresh]);

  const openBlockedModal = useCallback(() => setModalOpen(true), []);
  const closeBlockedModal = useCallback(() => setModalOpen(false), []);

  const navigateToSend = useCallback(async () => {
    const isBlocked = await checkBeforeSend();
    if (isBlocked) {
      openBlockedModal();
      return;
    }
    router.push("/send");
  }, [checkBeforeSend, openBlockedModal, router]);

  const value = useMemo<SendAccessContextValue>(
    () => ({
      loading,
      blocked,
      message,
      modalOpen,
      openBlockedModal,
      closeBlockedModal,
      navigateToSend,
      refresh,
      checkBeforeSend,
    }),
    [
      loading,
      blocked,
      message,
      modalOpen,
      openBlockedModal,
      closeBlockedModal,
      navigateToSend,
      refresh,
      checkBeforeSend,
    ],
  );

  return (
    <SendAccessContext.Provider value={value}>
      {children}
      <SendAccessBlockedModal />
    </SendAccessContext.Provider>
  );
}

export function SendAccessBlockedModal() {
  const pathname = usePathname();
  const { modalOpen, closeBlockedModal, message } = useSendAccessContext();
  const onSendRoute = pathname.startsWith("/send") && !pathname.startsWith("/send/success");

  if (!modalOpen || onSendRoute) return null;

  const handleClose = () => {
    closeBlockedModal();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-access-blocked-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="send-access-blocked-title" className="text-lg font-semibold text-slate-900">
          ไม่สามารถส่งพัสดุได้
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/payment"
            onClick={handleClose}
            className="inline-flex items-center justify-center rounded-lg bg-[#2726F5] px-4 py-3 text-sm font-semibold text-white"
          >
            ไปชำระเงิน
          </Link>
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  );
}

function SendAccessBlockedPage() {
  const { message } = useSendAccessContext();

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-10">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-lg font-semibold text-slate-900">ไม่สามารถส่งพัสดุได้</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/payment"
            className="inline-flex items-center justify-center rounded-lg bg-[#2726F5] px-4 py-3 text-sm font-semibold text-white"
          >
            ไปชำระเงิน
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700"
          >
            กลับหน้าแรก
          </Link>
        </div>
      </div>
    </main>
  );
}

type SendLinkProps = {
  href?: string;
  className?: string;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
};

/** Intercepts navigation to /send when account is blocked. */
export function SendLink({ href = "/send", className, children, onClick }: SendLinkProps) {
  const router = useRouter();
  const { openBlockedModal, checkBeforeSend } = useSendAccessContext();

  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        void (async () => {
          const isBlocked = await checkBeforeSend();
          if (isBlocked) {
            openBlockedModal();
            return;
          }
          router.push(href);
        })();
      }}
    >
      {children}
    </a>
  );
}

/** Blocks /send/* when account has overdue unpaid parcels (except success). */
export function SendAccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { loading, blocked, refresh } = useSendAccessContext();
  const skip = pathname.startsWith("/send/success");
  const [checking, setChecking] = useState(!skip);

  useEffect(() => {
    if (skip) {
      setChecking(false);
      return;
    }
    setChecking(true);
    void refresh({ silent: true }).finally(() => setChecking(false));
  }, [pathname, skip, refresh]);

  if (skip) return <>{children}</>;
  if (checking || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100">
        <p className="text-sm text-slate-500">กำลังตรวจสอบ…</p>
      </main>
    );
  }
  if (blocked) return <SendAccessBlockedPage />;

  return <>{children}</>;
}
