import { getDeviceContext, getShopStatus, setDeviceContext, syncShop } from "/offline-store.mjs";

const CACHE_NAME = "orderit-app-shell-v5";
const PRECACHE_URLS = [
  "/offline.html",
  "/offline-unavailable.html",
  "/offline.css",
  "/offline-app.js",
  "/offline-store.mjs",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-icon-192.png",
  "/icons/maskable-icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-16.png",
  "/icons/favicon-32.png",
  "/favicon.ico",
  "/splash/iphone-6-7.png",
  "/splash/iphone-6-1.png",
  "/splash/ipad-12-9.png",
];
const FIXED_PUBLIC_ASSETS = new Set(PRECACHE_URLS);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key.startsWith("orderit-") && key !== CACHE_NAME).map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

function isShopNavigation(pathname) {
  return pathname === "/" || pathname === "/orders" || pathname === "/orders/" ||
    pathname === "/orders/new" || pathname === "/orders/new/" ||
    pathname === "/orders/new/review" || pathname === "/orders/new/review/" ||
    pathname.startsWith("/orders/") || pathname === "/offline.html";
}

function isPublicStaticAsset(pathname) {
  return FIXED_PUBLIC_ASSETS.has(pathname) || pathname.startsWith("/_next/static/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET") return;
  // Never intercept or store authenticated API, auth, or mutation responses.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const fallbackPath = isShopNavigation(url.pathname) ? "/offline.html" : "/offline-unavailable.html";
        return (await caches.match(fallbackPath)) || new Response("The shop app is unavailable offline.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
        });
      })
    );
    return;
  }

  if (!isPublicStaticAsset(url.pathname)) return;
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)));
        }
        return response;
      });
    })
  );
});

async function reportToClient(source, result) {
  if (source && typeof source.postMessage === "function") {
    source.postMessage({ type: "ORDERIT_SYNC_RESULT", result });
  }
}

async function performSync(source) {
  const result = await syncShop(fetch.bind(self));
  await reportToClient(source, result);
  return result;
}

self.addEventListener("message", (event) => {
  const message = event.data || {};
  if (message.type === "SYNC_NOW") {
    event.waitUntil(performSync(event.source).catch((error) => reportToClient(event.source, {
      reachable: false,
      error: error instanceof Error ? error.message : "Sync failed.",
    })));
  } else if (message.type === "GET_SHOP_STATUS") {
    event.waitUntil((async () => {
      const context = await getDeviceContext();
      if (context.role !== "SHOP" || context.userId !== message.shopId) {
        await reportToClient(event.source, { initialized: false, shopId: message.shopId, blocked: true });
        return;
      }
      const status = await getShopStatus(message.shopId);
      await reportToClient(event.source, { ...status, role: "SHOP" });
    })());
  } else if (message.type === "SET_SIGNED_OUT") {
    event.waitUntil(setDeviceContext("SIGNED_OUT").catch(() => {}));
  } else if (message.type === "ENABLE_BACKGROUND_SYNC") {
    event.waitUntil((async () => {
      try {
        if (self.registration.sync) await self.registration.sync.register("orderit-shop-sync");
      } catch {
        // Background Sync is best-effort. Foreground/reconnect retries remain enabled.
      }
    })());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "orderit-shop-sync") {
    event.waitUntil(performSync(null).catch(() => {}));
  }
});
