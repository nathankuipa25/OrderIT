import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { moveItem } from "../lib/order-reorder.mjs";
import { getLoadState } from "../lib/load-state.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("keyboard move controls preserve stable order and stop at list boundaries", () => {
  const products = ["Tea", "Bread", "Milk"];
  assert.deepEqual(moveItem(products, 1, 0), ["Bread", "Tea", "Milk"]);
  assert.deepEqual(moveItem(products, 1, 2), ["Tea", "Milk", "Bread"]);
  assert.equal(moveItem(products, 0, -1), products);
  assert.equal(moveItem(products, 2, 3), products);
  assert.equal(moveItem(products, 1, 1), products);
  assert.deepEqual(products, ["Tea", "Bread", "Milk"], "the original order is not mutated");
});

test("load states distinguish pending, failed, empty, and populated requests", () => {
  assert.equal(getLoadState({ loading: true, error: false, itemCount: 0 }), "loading");
  assert.equal(getLoadState({ loading: false, error: true, itemCount: 0 }), "error");
  assert.equal(getLoadState({ loading: false, error: false, itemCount: 0 }), "empty");
  assert.equal(getLoadState({ loading: false, error: false, itemCount: 2 }), "ready");
});

test("product and order lists expose loading, empty, error and retry recovery controls", async () => {
  const [catalog, createOrder, review, editor, orders] = await Promise.all([
    read("app/products/page.tsx"),
    read("app/orders/new/page.tsx"),
    read("app/orders/new/review/page.tsx"),
    read("app/products/[id]/edit/page.tsx"),
    read("components/OrdersInfiniteList.tsx"),
  ]);
  assert.match(catalog, /role="status"[\s\S]*aria-busy="true"/);
  assert.match(catalog, /Retry loading products/);
  assert.match(catalog, /Load more products/);
  assert.match(createOrder, /mutate\(\)/);
  assert.match(createOrder, /Retry loading products/);
  assert.match(review, /Retry loading your selection/);
  assert.match(editor, /Retry loading product/);
  assert.match(orders, /Load more orders/);
  assert.match(orders, /Retry loading more orders/);
  assert.match(orders, /role="alert"/);
});

test("order review provides keyboard move controls and announces position changes", async () => {
  const [review, row] = await Promise.all([
    read("app/orders/new/review/page.tsx"),
    read("components/SortableProductRow.tsx"),
  ]);
  assert.match(review, /moveItem\(/);
  assert.match(review, /aria-live="polite"/);
  assert.match(row, /aria-label=\{`Move \$\{name\} up`\}/);
  assert.match(row, /aria-label=\{`Move \$\{name\} down`\}/);
  assert.match(row, /disabled=\{index === 0\}/);
});

test("mobile fixed navigation and action bars reserve safe-area space", async () => {
  const [layout, nav, products, createOrder, review] = await Promise.all([
    read("app/layout.tsx"),
    read("components/BottomNav.tsx"),
    read("app/products/page.tsx"),
    read("app/orders/new/page.tsx"),
    read("app/orders/new/review/page.tsx"),
  ]);
  assert.match(layout, /viewportFit: "cover"/);
  assert.match(layout, /env\(safe-area-inset-bottom\)/);
  assert.match(nav, /aria-current=\{active \? "page" : undefined\}/);
  for (const page of [products, createOrder, review]) {
    assert.match(page, /bottom-\[calc\(3\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
  }
});
