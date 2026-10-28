import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("product detail GET is admin-only before reading private catalog details", async () => {
  const route = await read("app/api/products/[id]/route.ts");
  const getHandler = route
    .split("async function GET(")[1]
    .split("async function PATCH(")[0];
  assert.ok(getHandler, "GET handler exists");
  assert.match(getHandler, /evaluateAdminAccess\(session\)/);
  assert.ok(
    getHandler.indexOf("evaluateAdminAccess(session)") <
      getHandler.indexOf("prisma.product.findUnique"),
    "role check must happen before product details are queried"
  );
});

test("product DELETE is admin-only and blocks products referenced by orders", async () => {
  const route = await read("app/api/products/[id]/route.ts");
  const deleteHandler = route.split("async function DELETE(")[1];
  assert.ok(deleteHandler, "DELETE handler exists");
  assert.match(deleteHandler, /evaluateAdminAccess\(session\)/);
  assert.match(deleteHandler, /evaluateProductDeletion\(product\)/);
  assert.match(deleteHandler, /if \(!deletion\.allowed\)/);
  assert.match(deleteHandler, /status: 409/);
  assert.match(deleteHandler, /err\.code === "P2003"/);
  assert.match(deleteHandler, /prisma\.product\.delete/);
});

test("product editor disables deletion when order history exists", async () => {
  const page = await read("app/products/[id]/edit/page.tsx");
  assert.match(page, /usageCount: number/);
  assert.match(page, /disabled=\{deleting \|\| product\.usageCount > 0\}/);
  assert.match(page, /preserve order history/);
  assert.match(page, /window\.confirm/);
});
