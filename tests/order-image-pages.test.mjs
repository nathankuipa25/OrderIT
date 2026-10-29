import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_ITEMS_PER_IMAGE_PAGE, paginateOrderItems } from "../mobile/src/orderImagePages.mjs";

const previewSource = readFileSync(new URL("../mobile/src/OrderPreview.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../mobile/src/App.tsx", import.meta.url), "utf8");
const documentSource = readFileSync(new URL("../components/OrderDocument.tsx", import.meta.url), "utf8");
const paginationSource = readFileSync(new URL("../lib/orderPagination.ts", import.meta.url), "utf8");

test("native saved-order image pages retain a 25-product limit and preserve order", () => {
  assert.equal(MAX_ITEMS_PER_IMAGE_PAGE, 25);
  const items = Array.from({ length: 76 }, (_, index) => ({ name: `Product ${index + 1}` }));
  const pages = paginateOrderItems(items);

  assert.deepEqual(pages.map((page) => page.length), [25, 25, 25, 1]);
  assert.deepEqual(pages.flat(), items);
  assert.deepEqual(paginateOrderItems([]), [[]]);
  assert.throws(() => paginateOrderItems(items, 0), /positive integer/);
});

test("saved-order preview renders every stored product and saves paginated images", () => {
  assert.match(appSource, /screen === "orderPreview"/);
  assert.match(appSource, /Preview full order/);
  assert.match(previewSource, /order\.items\.map/);
  assert.match(previewSource, /captureRef\(page/);
  assert.match(previewSource, /page_\$\{pageIndex \+ 1\}_of_\$\{pages\.length\}/);
  assert.doesNotMatch(appSource, /order\.items\.slice\(0,\s*8\).*captureRef/s);
});

test("generated order documents use denser product rows for photo sharing", () => {
  assert.match(documentSource, /padding: "3px 0"/);
  assert.match(documentSource, /fontSize: 14/);
  assert.match(paginationSource, /MAX_ITEMS_PER_PAGE = 25/);
});
