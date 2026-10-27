import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  classifySyncFailure,
  createPendingOrderRecord,
  getDeviceContext,
  getShopData,
  getShopStatus,
  mergeServerOrders,
  enqueueOrder,
  recordKey,
  reviseQueuedOrder,
  saveShopSnapshot,
  setDeviceContext,
  syncShop,
} from "../public/offline-store.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}
function createIndexedDbFake() {
  const databases = new Map();
  function makeRequest(transaction, operation) {
    const request = {};
    transaction.pending += 1;
    setTimeout(() => {
      try {
        request.result = operation();
        request.onsuccess?.({ target: request });
      } catch (error) {
        request.error = error;
        request.onerror?.({ target: request });
      } finally {
        transaction.pending -= 1;
        queueMicrotask(() => transaction.maybeComplete());
      }
    }, 0);
    return request;
  }
  class FakeStore {
    constructor(transaction, name, definition) {
      this.transaction = transaction;
      this.name = name;
      this.definition = definition;
    }
    get(key) { return makeRequest(this.transaction, () => clone(this.definition.records.get(key))); }
    getAll() { return makeRequest(this.transaction, () => [...this.definition.records.values()].map(clone)); }
    put(value) {
      return makeRequest(this.transaction, () => {
        const copy = clone(value);
        const key = copy[this.definition.keyPath];
        if (key === undefined) throw new Error(`Missing ${this.definition.keyPath} key`);
        this.definition.records.set(key, copy);
        return key;
      });
    }
    delete(key) { return makeRequest(this.transaction, () => this.definition.records.delete(key)); }
    index(name) {
      const field = this.definition.indexes.get(name);
      if (!field) throw new Error(`Missing index ${name}`);
      return {
        getAll: (range) => makeRequest(this.transaction, () =>
          [...this.definition.records.values()].filter((record) => record[field] === range.value).map(clone)
        ),
      };
    }
  }
  class FakeTransaction {
    constructor(db, names) {
      this.db = db;
      this.pending = 0;
      this.complete = false;
      this.stores = new Map(names.map((name) => [name, new FakeStore(this, name, db.definitions.get(name))]));
    }
    objectStore(name) { return this.stores.get(name); }
    maybeComplete() {
      if (this.pending !== 0 || this.complete) return;
      setTimeout(() => {
        if (this.pending === 0 && !this.complete) {
          this.complete = true;
          this.oncomplete?.();
        }
      }, 0);
    }
    abort() {
      this.complete = true;
      this.onabort?.();
    }
  }
  class FakeDatabase {
    constructor(definitions) { this.definitions = definitions; }
    get objectStoreNames() {
      return { contains: (name) => this.definitions.has(name) };
    }
    createObjectStore(name, options) {
      this.definitions.set(name, { keyPath: options.keyPath, records: new Map(), indexes: new Map() });
      return {
        createIndex: (indexName, field) => this.definitions.get(name).indexes.set(indexName, field),
      };
    }
    transaction(names) { return new FakeTransaction(this, names); }
    close() {}
  }
  globalThis.IDBKeyRange = { only: (value) => ({ value }) };
  globalThis.indexedDB = {
    open(name) {
      const request = {};
      setTimeout(() => {
        let definitions = databases.get(name);
        const isNew = !definitions;
        if (!definitions) { definitions = new Map(); databases.set(name, definitions); }
        request.result = new FakeDatabase(definitions);
        if (isNew) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      }, 0);
      return request;
    },
  };
  return databases;
}

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, async json() { return structuredClone(body); } };
}
const product = (id, name, active = true) => ({ id, name, active });
const shop = (id = "shop-a", name = "Shop A") => ({ id, name, role: "SHOP" });

 test("account partition keys and pending order snapshots are stable and reject stale catalog items", () => {
  assert.notEqual(recordKey("shop-a", "order-1"), recordKey("shop-b", "order-1"));
  const pending = createPendingOrderRecord({
    shopId: "shop-a", productIds: ["p1", "p2"],
    products: [product("p1", "Tea"), product("p2", "Bread")],
    localId: "local-1", idempotencyKey: "retry-1", createdAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(pending.status, "pending");
  assert.equal(pending.orderNumber, null);
  assert.deepEqual(pending.items.map((item) => item.name), ["Tea", "Bread"]);
  assert.throws(() => createPendingOrderRecord({ shopId: "shop-a", productIds: ["p1"], products: [product("p1", "Tea", false)] }), /no longer active/);
  assert.throws(() => createPendingOrderRecord({ shopId: "shop-a", productIds: ["p1", "p1"], products: [product("p1", "Tea")] }), /different products/);
});

test("server history reconciliation removes an acknowledged local outbox item without duplicating it", () => {
  const local = createPendingOrderRecord({ shopId: "shop-a", productIds: ["p1"], products: [product("p1", "Tea")], localId: "local-1", idempotencyKey: "retry-1" });
  const server = { id: "server-1", idempotencyKey: "retry-1", orderNumber: 27, createdAt: "2026-01-02T00:00:00.000Z", items: [{ productId: "p1", position: 0, product: { name: "Tea" } }] };
  const first = mergeServerOrders("shop-a", [local], [server]);
  assert.equal(first.orders.length, 1);
  assert.equal(first.orders[0].localId, "local-1");
  assert.equal(first.orders[0].serverId, "server-1");
  assert.equal(first.orders[0].status, "synced");
  assert.deepEqual(first.acknowledgedLocalIds, ["local-1"]);
  const replay = mergeServerOrders("shop-a", first.orders, [server]);
  assert.equal(replay.orders.length, 1);
});

test("sync failures distinguish transient retries from authorization and stale-product attention", () => {
  assert.equal(classifySyncFailure(503, "Database unavailable").status, "pending");
  assert.equal(classifySyncFailure(401, "Please log in.").code, "authorization");
  assert.equal(classifySyncFailure(409, "One or more selected products are no longer active.").code, "stale_products");
  assert.equal(classifySyncFailure(409, "This retry key was already used.").code, "conflict");
});

test("IndexedDB-backed shop state survives a fresh read and never crosses account partitions", async () => {
  createIndexedDbFake();
  await saveShopSnapshot(shop("shop-a", "A"), [product("p1", "Tea A")], []);
  const aOrder = await enqueueOrder("shop-a", ["p1"]);
  await saveShopSnapshot(shop("shop-b", "B"), [product("p1", "Tea B")], []);
  const bOrder = await enqueueOrder("shop-b", ["p1"]);
  // Each read opens the database again, as it would after a reload.
  const [a, b] = await Promise.all([getShopData("shop-a"), getShopData("shop-b")]);
  assert.equal(a.account.name, "A");
  assert.equal(b.account.name, "B");
  assert.equal(a.products[0].name, "Tea A");
  assert.equal(b.products[0].name, "Tea B");
  assert.equal(a.orders[0].localId, aOrder.localId);
  assert.equal(b.orders[0].localId, bOrder.localId);
  assert.equal(a.outbox.length, 1);
  assert.equal(b.outbox.length, 1);
  await setDeviceContext("ADMIN", "admin-1");
  assert.deepEqual(await getDeviceContext(), { role: "ADMIN", userId: "admin-1", updatedAt: (await getDeviceContext()).updatedAt });
  assert.equal((await getShopData("shop-a")).outbox.length, 1, "switching the device context does not delete shop A's pending work");
});

test("reconnect reconciles a server-created order after a lost acknowledgement without posting a duplicate", async () => {
  createIndexedDbFake();
  await saveShopSnapshot(shop(), [product("p1", "Tea")], []);
  const draft = await enqueueOrder("shop-a", ["p1"]);
  const serverOrders = [];
  let postCount = 0;
  let loseFirstAcknowledgement = true;
  const fetcher = async (url, options = {}) => {
    if (url === "/api/auth/me") return jsonResponse({ user: shop() });
    if (url === "/api/products?active=true") return jsonResponse({ products: [product("p1", "Tea")] });
    if (String(url).startsWith("/api/orders?sync=1")) return jsonResponse({ orders: serverOrders, hasMore: false });
    if (url === "/api/orders" && options.method === "POST") {
      postCount += 1;
      const body = JSON.parse(options.body);
      let order = serverOrders.find((item) => item.idempotencyKey === body.idempotencyKey);
      if (!order) {
        order = { id: "server-1", idempotencyKey: body.idempotencyKey, orderNumber: 1, createdAt: "2026-02-01T00:00:00.000Z", items: body.productIds.map((id, position) => ({ productId: id, position, product: { name: "Tea" } })) };
        serverOrders.push(order);
      }
      if (loseFirstAcknowledgement) { loseFirstAcknowledgement = false; throw new Error("Connection closed after server commit"); }
      return jsonResponse({ order }, 201);
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const firstSync = await syncShop(fetcher);
  assert.equal(firstSync.queue.pending, 1);
  assert.equal((await getShopData("shop-a")).outbox[0].localId, draft.localId);
  const retry = await syncShop(fetcher);
  const stored = await getShopData("shop-a");
  assert.equal(retry.initialized, true);
  assert.equal(postCount, 1, "history sync found the committed idempotency key and avoided a second POST");
  assert.equal(stored.outbox.length, 0);
  assert.equal(stored.orders.length, 1);
  assert.equal(stored.orders[0].serverId, "server-1");
  assert.equal(stored.orders[0].orderNumber, 1);
  assert.equal(stored.orders[0].status, "synced");
});

test("stale product rejection preserves the draft until an explicit correction", async () => {
  createIndexedDbFake();
  await saveShopSnapshot(shop(), [product("p1", "Old Tea"), product("p2", "Bread")], []);
  const draft = await enqueueOrder("shop-a", ["p1"]);
  const fetcher = async (url, options = {}) => {
    if (url === "/api/auth/me") return jsonResponse({ user: shop() });
    if (url === "/api/products?active=true") return jsonResponse({ products: [product("p2", "Bread")] });
    if (String(url).startsWith("/api/orders?sync=1")) return jsonResponse({ orders: [], hasMore: false });
    if (url === "/api/orders" && options.method === "POST") return jsonResponse({ error: "One or more selected products are no longer active. Review your selection." }, 409);
    throw new Error(`Unexpected request ${url}`);
  };
  const result = await syncShop(fetcher);
  assert.equal(result.queue.attention, 1);
  const before = await getShopData("shop-a");
  assert.equal(before.outbox.length, 1);
  assert.equal(before.outbox[0].productIds[0], "p1");
  assert.equal(before.orders.find((order) => order.localId === draft.localId).items[0].name, "Old Tea");
  assert.equal(before.orders.find((order) => order.localId === draft.localId).status, "needs_attention");
  const revised = await reviseQueuedOrder("shop-a", draft.localId, ["p2"]);
  assert.equal(revised.idempotencyKey, draft.idempotencyKey);
  assert.deepEqual(revised.items.map((item) => item.productId), ["p2"]);
  assert.equal(revised.status, "pending");
  assert.equal((await getShopStatus("shop-a")).pendingCount, 1);
});

test("offline shell and service worker keep APIs network-only and admin navigation data-free", async () => {
  const source = (await read("public/service-worker.js")).replace(/^import .*\n/, "");
  const handlers = {};
  const cacheHits = [];
  const context = {
    URL,
    Set,
    Promise,
    Response,
    fetch: () => Promise.reject(new Error("offline")),
    caches: {
      match: async (path) => { cacheHits.push(path); return { offlineAsset: path }; },
      open: async () => ({ addAll: async () => {}, put: async () => {} }),
      keys: async () => [],
      delete: async () => true,
    },
    self: {
      location: { origin: "https://orderit.test" },
      registration: {},
      clients: { claim: async () => {}, matchAll: async () => [] },
      addEventListener: (type, handler) => { handlers[type] = handler; },
      skipWaiting() {},
    },
    getDeviceContext: async () => ({ role: "SIGNED_OUT", userId: null }),
    getShopStatus: async () => ({}),
    setDeviceContext: async () => {},
    syncShop: async () => ({}),
  };
  vm.runInNewContext(source, context);
  for (const [url, mode, method] of [
    ["https://orderit.test/api/orders?sync=1", "cors", "GET"],
    ["https://orderit.test/api/auth/me", "cors", "GET"],
    ["https://orderit.test/api/orders", "cors", "POST"],
  ]) {
    let intercepted = false;
    handlers.fetch({ request: { url, mode, method, destination: "" }, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false, `${url} must not be intercepted or cached`);
  }
  async function offlineFallback(path) {
    let response;
    handlers.fetch({
      request: { url: `https://orderit.test${path}`, mode: "navigate", method: "GET", destination: "document" },
      respondWith(promise) { response = promise; },
    });
    return response;
  }
  assert.deepEqual(await offlineFallback("/orders/new"), { offlineAsset: "/offline.html" });
  assert.deepEqual(await offlineFallback("/admin/reset"), { offlineAsset: "/offline-unavailable.html" });
  assert.ok(!cacheHits.includes("/admin/reset"), "private admin HTML is never looked up from Cache Storage");
  let dynamicAssetIntercepted = false;
  handlers.fetch({ request: { url: "https://orderit.test/uploads/shop-private.png", mode: "no-cors", method: "GET", destination: "image" }, respondWith() { dynamicAssetIntercepted = true; } });
  assert.equal(dynamicAssetIntercepted, false, "arbitrary dynamic media is not put in the shared shell cache");
});

test("offline sync endpoint and client use shop-scoped minimal history and server idempotency", async () => {
  const [route, client, middleware, html, manifest, login, accountMenu, ...icons] = await Promise.all([
    read("app/api/orders/route.ts"),
    read("public/offline-store.mjs"),
    read("middleware.ts"),
    read("public/offline.html"),
    read("public/manifest.webmanifest"),
    read("app/login/page.tsx"),
    read("components/AccountMenu.tsx"),
    ...["icon-192.png", "icon-512.png", "maskable-icon-192.png", "maskable-icon-512.png", "apple-touch-icon.png"]
      .map((name) => readFile(new URL(`public/icons/${name}`, root))),
  ]);
  const syncBranch = route.split('if (params.get("sync") === "1")')[1]?.split("const takeParam")[0];
  assert.ok(syncBranch, "sync-specific route exists");
  assert.match(syncBranch, /session\.role !== "SHOP"/);
  assert.match(syncBranch, /where: \{ userId: session\.sub \}/);
  assert.match(syncBranch, /idempotencyKey: true/);
  assert.match(syncBranch, /product: \{ select: \{ name: true \} \}/);
  assert.doesNotMatch(syncBranch, /user: \{ select/);
  assert.match(client, /\/api\/orders\?sync=1&take=/);
  assert.match(client, /idempotencyKey: queued\.idempotencyKey/);
  assert.match(client, /saveShopSnapshot\(auth, catalogResult\.body\.products, serverOrders\)/);
  assert.match(middleware, /"\/offline-store\.mjs"/);
  assert.match(html, /offline-app\.js/);
  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.start_url, "/offline.html");
  assert.ok(parsedManifest.icons.some((icon) => icon.purpose === "maskable" && icon.src === "/icons/maskable-icon-192.png"));
  assert.ok(parsedManifest.icons.some((icon) => icon.purpose === "maskable" && icon.src === "/icons/maskable-icon-512.png"));
  assert.deepEqual(icons.map((png) => [png.readUInt32BE(16), png.readUInt32BE(20)]), [[192, 192], [512, 512], [192, 192], [512, 512], [180, 180]]);
  assert.match(login, /window\.location\.assign\(next\)/);
  assert.match(login, /will not delete this shop's offline orders/);
  assert.match(accountMenu, /unsynced orders will stay here/);
});
