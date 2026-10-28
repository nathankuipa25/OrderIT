import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { bulkDeleteProducts } from "../lib/product-bulk-delete.mjs";
import {
  summarizeProductSelection,
  toggleLoadedProductSelection,
  toggleProductSelection,
} from "../lib/product-selection.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function makeStore(initialProducts) {
  let products = initialProducts.map((product) => ({ ...product }));
  let deleteCalls = 0;

  return {
    get products() {
      return products;
    },
    get deleteCalls() {
      return deleteCalls;
    },
    transaction: (work) =>
      work({
        findProducts: async (ids) => products.filter((product) => ids.includes(product.id)),
        deleteProducts: async (ids) => {
          deleteCalls += 1;
          const before = products.length;
          products = products.filter((product) => !ids.includes(product.id));
          return { count: before - products.length };
        },
      }),
  };
}

test("bulk product deletion denies non-admins before starting a transaction", async () => {
  for (const [session, expectedStatus] of [[null, 401], [{ role: "SHOP" }, 403]]) {
    let transactionStarted = false;
    const result = await bulkDeleteProducts({
      session,
      ids: ["product-1"],
      transaction: async () => {
        transactionStarted = true;
        throw new Error("A non-admin must not reach the database.");
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, expectedStatus);
    assert.equal(transactionStarted, false);
  }
});

test("bulk product deletion removes a fully deletable selection in one operation", async () => {
  const store = makeStore([
    { id: "product-1", name: "Tea", _count: { items: 0 } },
    { id: "product-2", name: "Sugar", _count: { items: 0 } },
  ]);

  const result = await bulkDeleteProducts({
    session: { role: "ADMIN" },
    ids: ["product-1", "product-2"],
    transaction: store.transaction,
  });

  assert.deepEqual(result, { ok: true, status: 200, deleted: 2 });
  assert.equal(store.deleteCalls, 1);
  assert.deepEqual(store.products, []);
});

test("a protected product rejects the mixed selection without deleting any products", async () => {
  const store = makeStore([
    { id: "unused", name: "Unused item", _count: { items: 0 } },
    { id: "ordered", name: "Ordered item", _count: { items: 2 } },
  ]);
  const before = store.products.map((product) => ({ ...product }));

  const result = await bulkDeleteProducts({
    session: { role: "ADMIN" },
    ids: ["unused", "ordered"],
    transaction: store.transaction,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 409);
  assert.match(result.error, /Ordered item/);
  assert.match(result.error, /No products were deleted/);
  assert.equal(store.deleteCalls, 0);
  assert.deepEqual(store.products, before);
});

test("bulk-delete route authorizes before parsing and executes validation and deletion in a transaction", async () => {
  const route = await read("app/api/products/bulk-delete/route.ts");
  const handler = route.split("async function DELETE(")[1];
  assert.ok(handler, "DELETE handler exists");
  assert.ok(
    handler.indexOf("evaluateAdminAccess(session)") < handler.indexOf("req.json()"),
    "admin access must be checked before parsing a deletion request"
  );
  assert.match(handler, /bulkDeleteProducts\(/);
  assert.match(handler, /prisma\.\$transaction/);
  assert.match(handler, /_count: \{ select: \{ items: true \} \}/);
  assert.match(handler, /tx\.product\.deleteMany/);
});

test("existing bulk products route remains dedicated to status updates", async () => {
  const route = await read("app/api/products/bulk/route.ts");
  assert.match(route, /export const PATCH = withPrivateApiHeaders\(async function PATCH/);
  assert.match(route, /prisma\.product\.updateMany/);
  assert.doesNotMatch(route, /export const DELETE = withPrivateApiHeaders/);
});

test("an invalid or missing product rejects the whole selection without deleting existing products", async () => {
  const store = makeStore([
    { id: "present", name: "Still in catalog", _count: { items: 0 } },
  ]);
  const before = store.products.map((product) => ({ ...product }));

  const result = await bulkDeleteProducts({
    session: { role: "ADMIN" },
    ids: ["present", "missing"],
    transaction: store.transaction,
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.match(result.error, /invalid or no longer exist/);
  assert.match(result.error, /No products were deleted/);
  assert.equal(store.deleteCalls, 0);
  assert.deepEqual(store.products, before);
});

test("selection persists across search and paging in select mode, then clears when Done exits", async () => {
  const firstSearchResults = [{ id: "alpha", name: "Alpha" }];
  let selection = toggleProductSelection(new Map(), firstSearchResults[0]);

  const nextSearchResults = [
    { id: "beta", name: "Beta" },
    { id: "gamma", name: "Gamma" },
  ];
  selection = toggleLoadedProductSelection(selection, nextSearchResults);
  const summary = summarizeProductSelection(selection);

  assert.equal(summary.count, 3);
  assert.deepEqual(summary.ids, ["alpha", "beta", "gamma"]);
  assert.deepEqual(summary.products, [
    { id: "alpha", name: "Alpha" },
    { id: "beta", name: "Beta" },
    { id: "gamma", name: "Gamma" },
  ]);
  assert.match(summary.scope, /explicitly selected products in the catalog/);

  const page = await read("app/products/page.tsx");
  const fetchPage = page
    .split("const fetchPage = useCallback(")[1]
    .split("// Reload from scratch")[0];
  assert.doesNotMatch(fetchPage, /setSelectedProductsById/);
  const selectModeHandler = page
    .split("function toggleSelectMode() {")[1]
    .split("function toggleSelected(")[0];
  assert.match(selectModeHandler, /if \(selectMode\) setSelectedProductsById\(new Map\(\)\)/);
  assert.match(page, /onClick=\{toggleSelectMode\}[\s\S]*?>\s*Done/);

  const dialog = page.slice(page.indexOf("{deleteConfirmOpen && ("), page.indexOf("{importPreview && ("));
  assert.match(dialog, /selectionSummary\.products\.map/);
  assert.match(dialog, /selectionSummary\.count/);
  assert.match(dialog, /selectionSummary\.scope/);
  assert.match(dialog, /onClick=\{\(\) => setDeleteConfirmOpen\(false\)\}/);

  const deleteHandler = page
    .split("async function handleBulkDelete() {")[1]
    .split("function handleImportClick()")[0];
  assert.ok(deleteHandler.indexOf("if (!res.ok) throw") < deleteHandler.indexOf("setSelectedProductsById(new Map())"));
  const failureHandler = deleteHandler.split("} catch (err) {")[1].split("} finally {")[0];
  assert.doesNotMatch(failureHandler, /setSelectedProductsById\(new Map\(\)\)/);
});
