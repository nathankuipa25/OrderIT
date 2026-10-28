"use client";
import { useCallback, useEffect, useRef, useState } from "react";

type Notice = { message: string; kind: "success" | "warning" | "neutral" };
type SyncResult = {
  role?: string | null;
  shopId?: string;
  reachable?: boolean;
  error?: string | null;
  pendingCount?: number;
  attentionCount?: number;
  queue?: { pending?: number; attention?: number };
};

export default function ShopSyncToast({
  role,
  userId,
}: {
  role?: "SHOP" | "ADMIN";
  userId?: string;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncing = useRef(false);
  const shouldNotify = useRef(false);

  const showNotice = useCallback((message: string, kind: Notice["kind"] = "success") => {
    setNotice({ message, kind });
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3400);
  }, []);

  const requestSync = useCallback(async (notify = false) => {
    if (role !== "SHOP" || !userId || !("serviceWorker" in navigator)) return;
    if (syncing.current) {
      if (notify) shouldNotify.current = true;
      return;
    }
    if (!navigator.onLine) {
      if (notify) showNotice("You’re offline. Saved orders remain on this device.", "neutral");
      return;
    }

    syncing.current = true;
    shouldNotify.current = notify;
    let posted = false;
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) {
        if (shouldNotify.current) showNotice("Sign in online to sync this shop.", "warning");
        shouldNotify.current = false;
        return;
      }
      const payload = await response.json();
      if (payload?.user?.role !== "SHOP" || payload?.user?.id !== userId) {
        if (shouldNotify.current) showNotice("The active shop account changed. Sign in again to sync.", "warning");
        shouldNotify.current = false;
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const worker = registration.active;
      if (!worker) throw new Error("The offline worker is not active yet.");
      worker.postMessage({ type: "SYNC_NOW" });
      worker.postMessage({ type: "ENABLE_BACKGROUND_SYNC" });
      posted = true;
    } catch {
      if (shouldNotify.current) {
        showNotice(
          navigator.onLine
            ? "Sync couldn’t start. Saved orders remain on this device."
            : "You’re offline. Saved orders remain on this device.",
          "warning"
        );
      }
      shouldNotify.current = false;
    } finally {
      if (!posted) {
        syncing.current = false;
        shouldNotify.current = false;
      }
    }
  }, [role, userId, showNotice]);

  useEffect(() => {
    if (role !== "SHOP" || !userId || !("serviceWorker" in navigator)) return;
    let alive = true;

    const onMessage = (event: MessageEvent) => {
      if (!alive || event.data?.type !== "ORDERIT_SYNC_RESULT") return;
      const result = event.data.result as SyncResult | undefined;
      if (result?.shopId && result.shopId !== userId) return;

      // GET_SHOP_STATUS includes these counters; its reply is not a sync notice.
      if (typeof result?.pendingCount === "number" || typeof result?.attentionCount === "number") return;
      if (!result || (result.role !== "SHOP" && typeof result.reachable !== "boolean" && !result.error)) return;

      const notify = shouldNotify.current;
      shouldNotify.current = false;
      syncing.current = false;
      let message = "Shop data is up to date.";
      let kind: Notice["kind"] = "success";
      if (result.reachable === false) {
        message = "You’re offline. Saved orders remain on this device.";
        kind = "neutral";
      } else if (result.role !== "SHOP") {
        message = "Sign in with a shop account to sync this device.";
        kind = "warning";
      } else if (result.error) {
        message = "Some shop data couldn’t sync. Saved orders remain on this device.";
        kind = "warning";
      } else if ((result.queue?.attention || 0) > 0) {
        const count = result.queue?.attention || 0;
        message = `${count} saved order${count === 1 ? " needs" : "s need"} attention.`;
        kind = "warning";
      } else if ((result.queue?.pending || 0) > 0) {
        const count = result.queue?.pending || 0;
        message = `${count} order${count === 1 ? " is" : "s are"} still queued.`;
        kind = "neutral";
      }
      if (notify) showNotice(message, kind);

      void navigator.serviceWorker.ready.then((registration) => {
        registration.active?.postMessage({ type: "GET_SHOP_STATUS", shopId: userId });
      }).catch(() => {});
    };

    const onOnline = () => void requestSync(false);
    const onOffline = () => showNotice("You’re offline. Saved orders remain on this device.", "neutral");
    const onVisible = () => {
      if (document.visibilityState === "visible") void requestSync(false);
    };
    const onManualSync = () => void requestSync(true);

    navigator.serviceWorker.addEventListener("message", onMessage);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("shop:sync-now", onManualSync);
    document.addEventListener("visibilitychange", onVisible);
    void requestSync(false);

    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("shop:sync-now", onManualSync);
      document.removeEventListener("visibilitychange", onVisible);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, [role, userId, requestSync, showNotice]);

  if (!notice || role !== "SHOP" || !userId) return null;
  const tone = notice.kind === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : notice.kind === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : "border-gray-200 bg-white text-ink";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-4 right-4 z-[100] mx-auto max-w-md rounded-2xl border px-4 py-3 text-sm font-medium shadow-lg ${tone}`}
      style={{ top: "calc(12px + env(safe-area-inset-top))" }}
    >
      {notice.message}
    </div>
  );
}
