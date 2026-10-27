import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("product CSV import is admin-only and previews without writing", async () => {
  const route = await read("app/api/products/import/route.ts");
  const guard = route.indexOf('if (!session || session.role !== "ADMIN")');
  const readBody = route.indexOf("await req.json()");
  const previewResponse = route.indexOf('if (action === "preview")');
  const write = route.indexOf("prisma.product.createMany");
  assert.ok(guard >= 0 && guard < readBody, "admin authorization must run before reading import data");
  assert.ok(previewResponse >= 0 && previewResponse < write, "preview must return before any database write");
  assert.match(route, /parseProductCsv\(body\.csv\)/);
  assert.match(route, /classifyProductRows\(/);
  assert.match(route, /mode: "insensitive"/);
});

test("product CSV export is admin-only and selects only stored export fields", async () => {
  const route = await read("app/api/products/export/route.ts");
  const guard = route.indexOf('if (!session || session.role !== "ADMIN")');
  const query = route.indexOf("prisma.product.findMany");
  assert.ok(guard >= 0 && guard < query, "export authorization must run before reading products");
  assert.match(route, /select: \{ name: true, active: true \}/);
  assert.match(route, /serializeProductCsv\(products\)/);
  assert.match(route, /Content-Disposition/);
});

test("products UI previews the selected CSV and requires explicit confirmation", async () => {
  const page = await read("app/products/page.tsx");
  assert.match(page, /action: "preview", csv: text/);
  assert.match(page, /action: "import", csv: importPreview\.csv/);
  assert.match(page, /Review product import/);
  assert.match(page, /onClick=\{handleConfirmImport\}/);
  assert.match(page, /onClick=\{handleExport\}/);
  assert.match(page, /Already in catalog/);
  assert.match(page, /Needs correction/);
});
