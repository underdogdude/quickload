"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function AddressSavedToastInner() {
  const searchParams = useSearchParams();
  const saved = searchParams.get("saved") === "1";
  const tab = searchParams.get("tab") === "recipient" ? "recipient" : "sender";
  // _t changes on every save, so the effect re-triggers even if the user
  // saves twice in a row and lands on the same /addresses?saved=1 URL.
  const navT = searchParams.get("_t");
  const [visible, setVisible] = useState(saved);

  useEffect(() => {
    if (!saved) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [saved, navT]);

  if (!visible) return null;

  const message =
    tab === "recipient"
      ? "บันทึกข้อมูลผู้รับเรียบร้อยแล้ว"
      : "บันทึกข้อมูลผู้ส่งเรียบร้อยแล้ว";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-40 px-4">
      <div className="mx-auto w-full max-w-lg">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-sm">
          {message}
        </div>
      </div>
    </div>
  );
}

export function AddressSavedToast() {
  return (
    <Suspense fallback={null}>
      <AddressSavedToastInner />
    </Suspense>
  );
}
