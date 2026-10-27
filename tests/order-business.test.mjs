import assert from "node:assert/strict";
import test from "node:test";
import {
  allocateNextOrderNumber,
  evaluateAdminAccess,
  evaluateProductDeletion,
  parseIdempotencyKey,
  resolveIdempotencyReplay,
  validateProductAvailability,
  validateProductIdList,
} from "../lib/order-business.mjs";

test("admin authorization distinguishes unauthenticated, shop, and admin sessions", () => {
  assert.deepEqual(evaluateAdminAccess(null), {
    allowed: false,
    status: 401,
    error: "Please log in.",
  });
  assert.deepEqual(evaluateAdminAccess({ role: "SHOP" }), {
    allowed: false,
    status: 403,
    error: "Admins only.",
  });
  assert.deepEqual(evaluateAdminAccess({ role: "ADMIN" }), {
    allowed: true,
    status: 200,
  });
});

test("order selection rejects empty, invalid, and repeated IDs and checks active catalog state", () => {
  assert.equal(validateProductIdList([]).ok, false);
  assert.equal(validateProductIdList(["a", "a"]).ok, false);
  assert.equal(validateProductIdList(["a", null]).ok, false);
  assert.deepEqual(validateProductIdList(["a", "b"]), {
    ok: true,
    productIds: ["a", "b"],
  });
  assert.deepEqual(
    validateProductAvailability(["a"], [{ id: "a", active: true }]),
    { ok: true }
  );
  assert.equal(validateProductAvailability(["missing"], []).status, 400);
  assert.equal(
    validateProductAvailability(["a"], [{ id: "a", active: false }]).status,
    409
  );
});

test("idempotency keys reject explicitly supplied non-strings and invalid values", () => {
  assert.deepEqual(parseIdempotencyKey({}), { ok: true, key: undefined });
  assert.deepEqual(parseIdempotencyKey({ idempotencyKey: "  retry-1 " }), {
    ok: true,
    key: "retry-1",
  });
  assert.equal(parseIdempotencyKey({ idempotencyKey: 123 }).ok, false);
  assert.equal(parseIdempotencyKey({ idempotencyKey: null }).ok, false);
  assert.equal(parseIdempotencyKey({ idempotencyKey: " " }).ok, false);
});

test("idempotency replays only for the same account and identical ordered products", () => {
  const existing = {
    id: "order-1",
    userId: "shop-1",
    items: [{ productId: "a" }, { productId: "b" }],
  };
  assert.equal(resolveIdempotencyReplay(null, "shop-1", ["a"]).kind, "new");
  assert.equal(resolveIdempotencyReplay(existing, "shop-1", ["a", "b"]).kind, "replay");
  assert.match(
    resolveIdempotencyReplay(existing, "shop-1", ["b", "a"]).message,
    /different product selection/
  );
  assert.match(
    resolveIdempotencyReplay(existing, "shop-1", ["a"]).message,
    /different product selection/
  );
  assert.match(
    resolveIdempotencyReplay(existing, "shop-2", ["a", "b"]).message,
    /another account/
  );
});

test("product deletion policy allows unused items and protects order history", () => {
  assert.deepEqual(evaluateProductDeletion(null), {
    allowed: false,
    status: 404,
    error: "Product not found.",
  });
  assert.deepEqual(evaluateProductDeletion({ _count: { items: 0 } }), {
    allowed: true,
    status: 200,
    usageCount: 0,
  });
  const used = evaluateProductDeletion({ _count: { items: 2 } });
  assert.equal(used.allowed, false);
  assert.equal(used.status, 409);
  assert.equal(used.usageCount, 2);
  assert.match(used.error, /Deactivate it instead/);
});

test("transaction-scoped allocation lock serializes mocked concurrent callers", async () => {
  // This models a transaction-scoped mutex so the allocator's protocol can be
  // exercised without a live database. It is not a PostgreSQL integration test.
  let lockQueue = Promise.resolve();
  let lastNumber = 0;
  const created = [];

  async function runTransaction() {
    let release;
    const tx = {
      async $queryRaw(strings) {
        assert.match(strings[0], /pg_advisory_xact_lock\(5194820, 1\)/);
        const previous = lockQueue;
        let unlock;
        lockQueue = new Promise((resolve) => { unlock = resolve; });
        await previous;
        release = unlock;
      },
      order: {
        async findFirst() {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return lastNumber ? { orderNumber: lastNumber } : null;
        },
      },
    };

    try {
      const orderNumber = await allocateNextOrderNumber(tx);
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 3));
      lastNumber = orderNumber;
      created.push(orderNumber);
      return orderNumber;
    } finally {
      release?.();
    }
  }

  const allocated = await Promise.all(Array.from({ length: 40 }, runTransaction));
  assert.equal(new Set(allocated).size, 40);
  assert.deepEqual([...allocated].sort((a, b) => a - b), Array.from({ length: 40 }, (_, i) => i + 1));
  assert.equal(created.length, 40);
});
