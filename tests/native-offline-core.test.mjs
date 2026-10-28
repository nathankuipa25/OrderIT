import assert from "node:assert/strict";
import test from "node:test";
import {
  classifySyncFailure,
  createPendingOrderRecord,
  mergeServerOrders,
  reviseAttentionOrder,
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
