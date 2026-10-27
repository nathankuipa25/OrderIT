import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createResetBackup,
  executeScopedReset,
  getResetAvailability,
  RESET_BACKUP_TTL_MS,
  RESET_CONFIRMATION,
  validateBackupAcknowledgement,
  validateResetConfirmation,
  verifyResetBackup,
} from "../lib/admin-reset.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const snapshot = {
  products: [
    { id: "product-1", name: "Tea", active: true, createdAt: new Date("2026-01-01T00:00:00.000Z") },
  ],
  orders: [
    {
      id: "order-1",
      orderNumber: 1,
      userId: "shop-1",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      items: [{ id: "item-1", orderId: "order-1", productId: "product-1", position: 0 }],
    },
  ],
};

const secret = "test-only-reset-signing-secret";

test("production resets require an explicit exact opt-in; local use still needs a signing secret", () => {
  assert.equal(
    getResetAvailability({ nodeEnv: "production", enabledFlag: "false", secretConfigured: true }).available,
    false
  );
  assert.match(
    getResetAvailability({ nodeEnv: "production", enabledFlag: undefined, secretConfigured: true }).reason,
    /ORDERIT_RESET_ENABLED=true/
  );
  assert.deepEqual(
    getResetAvailability({ nodeEnv: "production", enabledFlag: "true", secretConfigured: true }),
    { available: true }
  );
  assert.equal(
    getResetAvailability({ nodeEnv: "development", enabledFlag: undefined, secretConfigured: true }).available,
    true
  );
  assert.match(
    getResetAvailability({ nodeEnv: "development", enabledFlag: undefined, secretConfigured: false }).reason,
    /JWT_SECRET/
  );
});

test("backup includes only the reset scope and signs a short-lived snapshot authorization", () => {
  const { backup, token } = createResetBackup(snapshot, secret, 10_000);
  assert.equal(backup.format, "orderit-reset-backup");
  assert.deepEqual(backup.scope.removed, ["products", "orders"]);
  assert.match(backup.scope.orderItems, /parent orders/);
  assert.deepEqual(backup.scope.preserved, ["shop accounts", "admin accounts", "all user records"]);
  assert.deepEqual(backup.counts, { products: 1, orders: 1, orderItems: 1 });
  assert.deepEqual(verifyResetBackup(token, secret, snapshot, 10_001), { ok: true });

  const modified = structuredClone(snapshot);
  modified.products[0].name = "Changed after backup";
  const stale = verifyResetBackup(token, secret, modified, 10_001);
  assert.equal(stale.ok, false);
  assert.equal(stale.status, 409);
  assert.match(stale.error, /changed after the backup/);

  const tampered = `${token.slice(0, -1)}x`;
  assert.equal(verifyResetBackup(tampered, secret, snapshot, 10_001).ok, false);
  const expired = verifyResetBackup(token, secret, snapshot, 10_000 + RESET_BACKUP_TTL_MS + 1);
  assert.equal(expired.status, 400);
  assert.match(expired.error, /expired/);
});

test("reset confirmation must match exactly", () => {
  assert.equal(validateResetConfirmation(RESET_CONFIRMATION), true);
  assert.equal(validateResetConfirmation(RESET_CONFIRMATION.toLowerCase()), false);
  assert.equal(validateResetConfirmation(`${RESET_CONFIRMATION} `), false);
  assert.equal(validateResetConfirmation(undefined), false);
  assert.equal(validateBackupAcknowledgement(true), true);
  assert.equal(validateBackupAcknowledgement(false), false);
});

test("scoped reset deletes orders then products while leaving all users untouched", async () => {
  const database = {
    users: [
      { id: "shop-1", role: "SHOP" },
      { id: "admin-1", role: "ADMIN" },
    ],
    products: [{ id: "product-1" }],
    orders: [{ id: "order-1", items: [{ id: "item-1" }] }],
    orderItems: [{ id: "item-1", orderId: "order-1" }],
  };
  const calls = [];
  const tx = {
    order: {
      async deleteMany(args) {
        calls.push(["order.deleteMany", args]);
        const count = database.orders.length;
        database.orders = [];
        database.orderItems = [];
        return { count };
      },
    },
    product: {
      async deleteMany(args) {
        calls.push(["product.deleteMany", args]);
        const count = database.products.length;
        database.products = [];
        return { count };
      },
    },
  };

  const deleted = await executeScopedReset(tx);
  assert.deepEqual(deleted, { orders: 1, products: 1 });
  assert.deepEqual(calls, [
    ["order.deleteMany", {}],
    ["product.deleteMany", {}],
  ]);
  assert.deepEqual(database.orders, []);
  assert.deepEqual(database.orderItems, []);
  assert.deepEqual(database.products, []);
  assert.deepEqual(database.users, [
    { id: "shop-1", role: "SHOP" },
    { id: "admin-1", role: "ADMIN" },
  ]);
});

test("reset API is admin-gated, requires backup and confirmation, and never deletes account records", async () => {
  const [route, backupRoute, page, middleware, consolePage, schema] = await Promise.all([
    read("app/api/admin/reset/route.ts"),
    read("app/api/admin/reset/backup/route.ts"),
    read("app/admin/reset/page.tsx"),
    read("middleware.ts"),
    read("app/admin/reset/ResetConsole.tsx"),
    read("prisma/schema.prisma"),
  ]);
  const resetHandler = route.split("export async function POST(req: NextRequest)")[1];
  assert.ok(resetHandler);
  assert.ok(resetHandler.indexOf("adminError(session)") < resetHandler.indexOf("prisma.$transaction"));
  assert.match(resetHandler, /validateResetConfirmation\(body\?\.confirmation\)/);
  assert.match(resetHandler, /validateBackupAcknowledgement\(body\?\.backupSaved\)/);
  assert.match(resetHandler, /backupToken/);
  assert.ok(resetHandler.indexOf('LOCK TABLE "Product", "Order", "OrderItem"') < resetHandler.indexOf("executeScopedReset(tx)"));
  assert.doesNotMatch(route, /(?:tx|prisma)\.(?:user|orderItem)\.deleteMany/);
  assert.match(schema, /order\s+Order\s+@relation\(fields: \[orderId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(backupRoute, /evaluateAdminAccess\(session\)/);
  assert.match(backupRoute, /RepeatableRead/);
  assert.match(page, /evaluateAdminAccess\(session\)/);
  assert.match(middleware, /isAdminApi/);
  assert.match(consolePage, /Create and download backup/);
  assert.match(consolePage, /I saved the downloaded backup file/);
  assert.match(consolePage, /Permanently reset products and orders/);
  assert.match(consolePage, /every shop account, every admin account/);
});
