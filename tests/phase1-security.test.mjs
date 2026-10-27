import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("seeding and deployment docs do not create or disclose default admin credentials", async () => {
  const [seed, readme, workflow, bootstrap] = await Promise.all([
    read("prisma/seed.js"),
    read("README.md"),
    read(".github/workflows/prisma-db-push.yml"),
    read("prisma/create-admin.js"),
  ]);
  for (const text of [seed, readme, workflow]) {
    assert.doesNotMatch(text, /0624|username:\s*Nathan|password:\s*0624/i);
  }
  assert.doesNotMatch(seed, /prisma\.user\.(create|upsert)/);
  assert.match(bootstrap, /process\.env\.ADMIN_PASSWORD/);
  assert.match(bootstrap, /password\.length < 12/);
});

test("service worker falls back to a static shell for navigation but never intercepts private APIs", async () => {
  const source = (await read("public/service-worker.js")).replace(/^import .*\n/, "");
  const handlers = {};
  const context = {
    URL,
    Set,
    Promise,
    Response,
    self: {
      location: { origin: "https://orderit.test" },
      addEventListener: (type, fn) => { handlers[type] = fn; },
      skipWaiting() {},
      clients: { claim() {} },
    },
    caches: { match: () => Promise.resolve({ fromCache: true }) },
    fetch() { return Promise.resolve({ ok: true, type: "basic", clone() { return this; } }); },
    getDeviceContext: async () => ({ role: "SIGNED_OUT", userId: null }),
    getShopStatus: async () => ({}),
    setDeviceContext: async () => {},
    syncShop: async () => ({}),
  };
  vm.runInNewContext(source, context);
  for (const [url, mode] of [
    ["https://orderit.test/api/orders", "cors"],
    ["https://orderit.test/api/auth/me", "cors"],
  ]) {
    let intercepted = false;
    handlers.fetch({
      request: { url, mode, destination: "" },
      respondWith() { intercepted = true; },
    });
    assert.equal(intercepted, false, `${url} must pass through to the network`);
  }
  let navigationIntercepted = false;
  handlers.fetch({
    request: { url: "https://orderit.test/orders", mode: "navigate", method: "GET", destination: "document" },
    respondWith() { navigationIntercepted = true; },
  });
  assert.equal(navigationIntercepted, true, "shop navigation uses the offline shell fallback");
  let staticIntercepted = false;
  handlers.fetch({
    request: { url: "https://orderit.test/_next/static/chunk.js", mode: "cors", method: "GET", destination: "script" },
    respondWith() { staticIntercepted = true; },
  });
  assert.equal(staticIntercepted, true, "versioned static assets may be cached");
});

test("order creation rejects inactive products and serializes number allocation", async () => {
  const route = await read("app/api/orders/route.ts");
  assert.match(route, /validateProductAvailability\(ids, products\)/);
  assert.match(route, /allocateNextOrderNumber\(tx\)/);
  assert.match(route, /parseIdempotencyKey\(body\)/);
  assert.match(route, /resolveIdempotencyReplay\(existing, session\.sub, ids\)/);
});
