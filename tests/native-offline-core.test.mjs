import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySyncFailure,
  createPendingOrderRecord,
  mergeServerOrders,
  reviseAttentionOrder,
  validateLegacySnapshot,
} from "../mobile/src/offline-core.mjs";

const product = (id, name, active = true) => ({ id, name, active });

test("native pending orders snapshot active product names and reject duplicate or stale selections", () => {
  const draft = createPendingOrderRecord({
    shopId: "shop-a",
    productIds: ["tea", "bread"],
    products: [product("tea", "Tea"), product("bread", "Bread")],
    localId: "local-1",
    idempotencyKey: "retry-1",
  });
  assert.equal(draft.status, "pending");
  assert.equal(draft.orderNumber, null);
  assert.deepEqual(draft.items.map((item) => item.name), ["Tea", "Bread"]);
  assert.throws(() => createPendingOrderRecord({ shopId: "shop-a", productIds: ["tea", "tea"], products: [product("tea", "Tea")] }), /different products/);
  assert.throws(() => createPendingOrderRecord({ shopId: "shop-a", productIds: ["tea"], products: [product("tea", "Tea", false)] }), /no longer active/);
});

test("native history reconciliation acknowledges a lost response without duplicating the draft", () => {
  const draft = createPendingOrderRecord({ shopId: "shop-a", productIds: ["tea"], products: [product("tea", "Tea")], localId: "local-1", idempotencyKey: "retry-1" });
  const server = { id: "server-1", idempotencyKey: "retry-1", orderNumber: 27, createdAt: "2026-04-02T10:00:00.000Z", items: [{ productId: "tea", position: 0, product: { name: "Tea" } }] };
  const result = mergeServerOrders("shop-a", [draft], [server]);
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].localId, "local-1");
  assert.equal(result.orders[0].serverId, "server-1");
  assert.equal(result.orders[0].status, "synced");
  assert.deepEqual(result.acknowledgedLocalIds, ["local-1"]);
});

test("native sync keeps transient failures pending and requires explicit correction for inactive products", () => {
  assert.equal(classifySyncFailure(503, "Service unavailable").status, "pending");
  assert.equal(classifySyncFailure(409, "Selected product is no longer active").code, "stale_products");
  const original = createPendingOrderRecord({ shopId: "shop-a", productIds: ["old"], products: [product("old", "Old tea")], localId: "local-2", idempotencyKey: "retry-2" });
  const attention = { ...original, status: "needs_attention", attentionCode: "stale_products", attentionReason: "Product no longer active" };
  assert.throws(() => reviseAttentionOrder(attention, ["old"], [product("new", "New tea")]), /Change the selection explicitly/);
  const revised = reviseAttentionOrder(attention, ["new"], [product("new", "New tea")]);
  assert.equal(revised.idempotencyKey, "retry-2");
  assert.equal(revised.items[0].productId, "new");
  assert.equal(revised.status, "pending");
});

test("legacy migration accepts valid shop snapshots and canonicalizes local keys without changing the source", () => {
  const snapshot = {
    accounts: [{ shopId: "shop-a", name: "Corner Shop", role: "SHOP", initializedAt: "2026-10-01T10:00:00.000Z", lastSyncAt: "2026-10-02T10:00:00.000Z" }],
    products: [{ key: "old-key", shopId: "shop-a", id: "tea", name: "Tea", active: true, cachedAt: "2026-10-02T10:00:00.000Z" }],
    orders: [{ key: "old-order-key", shopId: "shop-a", localId: "local-1", serverId: null, idempotencyKey: "retry-1", orderNumber: null, createdAt: "2026-10-02T11:00:00.000Z", items: [{ productId: "tea", name: "Tea", position: 0 }], status: "pending", attentionCode: null, attentionReason: null }],
    outbox: [{ key: "old-outbox-key", shopId: "shop-a", localId: "local-1", idempotencyKey: "retry-1", productIds: ["tea"], createdAt: "2026-10-02T11:00:00.000Z", status: "pending", attentionCode: null, attentionReason: null }],
    settings: [{ key: "active-context", role: "SHOP", userId: "shop-a", updatedAt: "2026-10-02T11:00:00.000Z" }],
  };
  const original = structuredClone(snapshot);
  const result = validateLegacySnapshot(snapshot);

  assert.deepEqual(result.issues, []);
  assert.equal(result.records.accounts.length, 1);
  assert.equal(result.records.orders[0].key, JSON.stringify(["shop-a", "local-1"]));
  assert.equal(result.records.outbox.length, 1);
  assert.deepEqual(snapshot, original, "validation must not delete or rewrite the read-only legacy source");
});

test("legacy migration reports malformed rows and orphaned queued orders instead of silently skipping them", () => {
  const snapshot = {
    accounts: [{ shopId: "shop-a", name: "Corner Shop", role: "SHOP", initializedAt: "not-a-date" }],
    products: [{ shopId: "shop-a", id: "tea", name: "", active: true }],
    orders: [{ shopId: "shop-a", localId: "local-bad", createdAt: "bad-date", items: [{ productId: "tea", name: "Tea", position: 0 }], status: "pending" }],
    outbox: [{ shopId: "shop-a", localId: "local-orphan", idempotencyKey: "retry-orphan", productIds: ["tea"], createdAt: "2026-10-02T11:00:00.000Z", status: "pending" }],
    settings: [{ key: "active-context", role: "SHOP", userId: null, updatedAt: "2026-10-02T11:00:00.000Z" }],
  };
  const original = structuredClone(snapshot);
  const result = validateLegacySnapshot(snapshot);

  assert.ok(result.issues.length >= 5);
  assert.deepEqual(new Set(result.issues.map((item) => item.store)), new Set(["accounts", "products", "orders", "outbox", "settings"]));
  assert.equal(result.records.orders.length, 0);
  assert.equal(result.records.outbox.length, 0);
  assert.deepEqual(snapshot, original, "bad rows remain untouched in the original local database");
  assert.deepEqual(validateLegacySnapshot({}).issues, []);
});

test("legacy pending orders without outbox rows stay visible, report an issue, and restore only safe idempotent retries", () => {
  const pendingOrder = {
    shopId: "shop-a",
    localId: "local-missing-queue",
    serverId: null,
    idempotencyKey: "stable-retry-key",
    orderNumber: null,
    createdAt: "2026-10-02T12:00:00.000Z",
    items: [{ productId: "tea", name: "Tea", position: 0 }],
    status: "pending",
    attentionCode: null,
    attentionReason: null,
  };
  const snapshot = { orders: [pendingOrder], outbox: [] };
  const original = structuredClone(snapshot);
  const result = validateLegacySnapshot(snapshot);

  assert.equal(result.records.orders.length, 1);
  assert.equal(result.records.outbox.length, 1);
  assert.equal(result.records.outbox[0].idempotencyKey, "stable-retry-key");
  assert.deepEqual(result.records.outbox[0].productIds, ["tea"]);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].store, "orders");
  assert.match(result.issues[0].reason, /safe retry was restored/);
  assert.deepEqual(snapshot, original, "queue reconstruction must not modify the legacy source");

  const unsafe = validateLegacySnapshot({ orders: [{ ...pendingOrder, idempotencyKey: null }], outbox: [] });
  assert.equal(unsafe.records.orders.length, 1);
  assert.equal(unsafe.records.outbox.length, 0);
  assert.match(unsafe.issues[0].reason, /cannot be retried safely/);
});
