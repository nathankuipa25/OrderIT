import assert from "node:assert/strict";
import test from "node:test";
import {
  buildOrderRequest,
  readDraftIntent,
  removeDraftIntent,
  writeDraftIntent,
} from "../lib/order-draft.mjs";

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test("order intent keeps a stable key across reloads and unchanged writes", () => {
  const local = memoryStorage();
  let keyNumber = 0;
  const keyFactory = () => `key-${++keyNumber}`;
  const created = writeDraftIntent(local, ["p1", "p2"], null, keyFactory);
  const reloaded = readDraftIntent(local, null, keyFactory);
  const same = writeDraftIntent(local, ["p1", "p2"], null, keyFactory);
  assert.equal(created.idempotencyKey, "key-1");
  assert.equal(reloaded.idempotencyKey, created.idempotencyKey);
  assert.equal(same.idempotencyKey, created.idempotencyKey);
  assert.deepEqual(reloaded.productIds, ["p1", "p2"]);
  assert.deepEqual(buildOrderRequest(reloaded, ["p1", "p2"]), {
    productIds: ["p1", "p2"],
    idempotencyKey: "key-1",
  });
  assert.equal(buildOrderRequest(reloaded, ["p2", "p1"]), null);
});

test("reordered, changed, and newly started intents receive fresh keys", () => {
  const local = memoryStorage();
  let keyNumber = 0;
  const keyFactory = () => `key-${++keyNumber}`;
  const first = writeDraftIntent(local, ["p1", "p2"], null, keyFactory);
  const reordered = writeDraftIntent(local, ["p2", "p1"], null, keyFactory);
  const changed = writeDraftIntent(local, ["p2", "p3"], null, keyFactory);
  assert.notEqual(reordered.idempotencyKey, first.idempotencyKey);
  assert.notEqual(changed.idempotencyKey, reordered.idempotencyKey);
  removeDraftIntent(local, null);
  const nextOrder = writeDraftIntent(local, ["p2", "p3"], null, keyFactory);
  assert.notEqual(nextOrder.idempotencyKey, changed.idempotencyKey);
});

test("legacy session-only drafts migrate to persistent local storage with a retry key", () => {
  const local = memoryStorage();
  const session = memoryStorage();
  session.setItem("orderit:draft", JSON.stringify(["p1"]));
  const intent = readDraftIntent(local, session, () => "migrated-key");
  assert.deepEqual(intent, { productIds: ["p1"], idempotencyKey: "migrated-key" });
  assert.equal(readDraftIntent(local, null).idempotencyKey, "migrated-key");
});
