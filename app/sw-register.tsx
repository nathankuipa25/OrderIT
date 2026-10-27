'use client';

import { useEffect } from 'react';

type Role = "ADMIN" | "SHOP";

export default function SWRegister({ role, userId }: { role?: Role; userId?: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker
      .register("/service-worker.js", { type: "module" })
      .then(async (registration) => {
        if (cancelled || role !== "ADMIN" || !userId) return;
        const ready = await navigator.serviceWorker.ready;
        ready.active?.postMessage({ type: "SYNC_NOW" });
      })
      .catch((error) => console.warn("OrderIT offline worker registration failed", error));
    return () => { cancelled = true; };
  }, [role, userId]);
  return null;
}
