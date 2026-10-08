// Splits order items into pages of at most MAX_ITEMS_PER_PAGE products
// each. Each page is captured/exported at whatever height its own
// content naturally needs (see useOrderExport + OrderDocument) — we do
// not try to fit a fixed physical page height, so unlike an earlier
// version of this logic, a product row can never be cut off regardless
// of how many items are on a page or how long their names are.

export const MAX_ITEMS_PER_PAGE = 25;

export function paginateItems<T>(
  items: T[],
  maxPerPage: number = MAX_ITEMS_PER_PAGE
): T[][] {
  if (items.length === 0) return [[]];

  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += maxPerPage) {
    pages.push(items.slice(i, i + maxPerPage));
  }
  return pages;
}
