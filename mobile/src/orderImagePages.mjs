export const MAX_ITEMS_PER_IMAGE_PAGE = 25;

export function paginateOrderItems(items, maxPerPage = MAX_ITEMS_PER_IMAGE_PAGE) {
  if (!Number.isInteger(maxPerPage) || maxPerPage < 1) {
    throw new RangeError("The page size must be a positive integer.");
  }
  if (items.length === 0) return [[]];

  const pages = [];
  for (let index = 0; index < items.length; index += maxPerPage) {
    pages.push(items.slice(index, index + maxPerPage));
  }
  return pages;
}
