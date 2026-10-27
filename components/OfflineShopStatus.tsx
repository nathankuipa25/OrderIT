"use client";
import { useCallback, useEffect, useState } from "react";

type Status = {
  lastSyncAt?: string | null;
  pendingCount?: number;
  attentionCount?: number;
  initialized?: boolean;
  error?: string | null;
  busy?: boolean;
};

function formatSync(value?: string | null) {
  if (!value) return "No complete sync on this device yet.";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Last sync time unavailable."
    : `Last successful sync: ${date.toLocaleString()}.`;
}

export default function OfflineShopStatus({
  role,
  userId,
}: {
  role?: "SHOP" | "ADMIN";
  userId?: string;
}) {
  const [status, setStatus] = useState<Status>({});
  const [serviceReachable, setServiceReachable] = useState<boolean | null>(null);

  const requestSync = useCallback(async () => {
    if (role !== "SHOP" || !userId || !("serviceWorker" in navigator)) return;
    setStatus((current) => ({ ...current, busy: true }));
    try {
      const response = await fetch("/api/auth/me", { cache: "no-store" });
      if (!response.ok) {
        setServiceReachable(true);
        setStatus((current) => ({ ...current, busy: false, error: "Sign in online to sync this shop." }));
        return;
      }
      const payload = await response.json();
      if (payload?.user?.role !== "SHOP" || payload?.user?.id !== userId) {
        setServiceReachable(true);
        setStatus((current) => ({ ...current, busy: false, error: "The active online account changed. Cached shop data remains partitioned and was not removed." }));
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const worker = registration.active;
      if (!worker) throw new Error("The offline worker is not active yet.");
      worker.postMessage({ type: "SYNC_NOW" });
      worker.postMessage({ type: "ENABLE_BACKGROUND_SYNC" });
    } catch {
      setServiceReachable(false);
      setStatus((current) => ({ ...current, busy: false, error: navigator.onLine ? "OrderIT could not be reached. Pending orders remain on this device." : "Offline. Pending orders remain on this device." }));
      void navigator.serviceWorker.ready.then((registration) => {
        registration.active?.postMessage({ type: "GET_SHOP_STATUS", shopId: userId });
      }).catch(() => {});
    }
  }, [role, userId]);

  useEffect(() => {
    if (role !== "SHOP" || !userId || !("serviceWorker" in navigator)) return;
    let alive = true;
    const onMessage = (event: MessageEvent) => {
      if (!alive || event.data?.type !== "ORDERIT_SYNC_RESULT") return;
      const result = event.data.result as Status & { role?: string; shopId?: string; reachable?: boolean };
      if (result?.shopId && result.shopId !== userId) return;
      if (typeof result?.reachable === "boolean") setServiceReachable(result.reachable);
      if (typeof result?.pendingCount === "number" || typeof result?.attentionCount === "number") {
        setStatus({
          initialized: result.initialized,
          lastSyncAt: result.lastSyncAt,
          pendingCount: result.pendingCount,
          attentionCount: result.attentionCount,
          busy: false,
        });
        return;
      }
      if (result?.role === "SHOP") {
        setStatus((current) => ({
          ...current,
          initialized: result.initialized,
          lastSyncAt: result.lastSyncAt || current.lastSyncAt,
          busy: false,
          error: result.error || null,
        }));
        void navigator.serviceWorker.ready.then((registration) => {
          registration.active?.postMessage({ type: "GET_SHOP_STATUS", shopId: userId });
        });
      } else if (result?.error) {
        setStatus((current) => ({ ...current, busy: false, error: result.error || null }));
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    const onOnline = () => void requestSync();
    const onOffline = () => {
      setServiceReachable(false);
      setStatus((current) => ({ ...current, error: "Offline. Pending orders remain on this device." }));
      void navigator.serviceWorker.ready.then((registration) => {
        registration.active?.postMessage({ type: "GET_SHOP_STATUS", shopId: userId });
      }).catch(() => {});
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void requestSync();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    void requestSync();
    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener("message", onMessage);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [role, userId, requestSync]);

  if (role !== "SHOP" || !userId) return null;
  const offlineHint = typeof navigator !== "undefined" && !navigator.onLine;
  const kind = status.attentionCount ? "#fff6e5" : !serviceReachable || offlineHint ? "#f3f5f8" : "#eaf7f1";
  const summary = status.error || (offlineHint || serviceReachable === false
    ? "Connection unavailable — saved orders remain on this device."
    : serviceReachable === true
      ? "Connected to OrderIT."
      : "Checking OrderIT connection…");
  return (
    <section
      aria-label="Offline order sync status"
      className="mx-auto max-w-2xl mb-4 rounded-xl border border-gray-200 px-3 py-3 text-sm"
      style={{ backgroundColor: kind }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-ink">{offlineHint || serviceReachable === false ? "Offline-ready shop workspace" : "Shop sync"}</div>
          <div className="text-muted mt-1">{summary}</div>
          <div className="text-xs text-muted mt-1">{formatSync(status.lastSyncAt)}</div>
          {status.initialized && (
            <div className="text-xs text-muted mt-1">
              {status.pendingCount || 0} pending · {status.attentionCount || 0} need attention
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void requestSync()}
          disabled={status.busy}
          className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-navy disabled:opacity-50"
        >
          {status.busy ? "Checking…" : "Retry sync"}
        </button>
      </div>
      <a href="/offline.html" className="inline-block mt-2 text-xs font-semibold text-navy underline underline-offset-2">
        Open offline shop workspace
      </a>
      <p className="mt-2 text-[11px] leading-4 text-muted">Offline data is stored on this device and is only as protected as the device/browser profile. Signing out preserves queued orders but requires signing in again to access or sync them.</p>
    </section>
  );
}
