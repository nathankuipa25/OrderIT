// Splits order items across pages BEFORE rendering, so a product row can
// never be cut in half by a screenshot/PDF page boundary. Heights are
// estimated conservatively (long names are assumed to wrap) rather than
// measured from a live DOM node, so this stays fast and synchronous.

export const LAYOUT = {
  documentWidthPx: 480,
  documentHorizontalPaddingPx: 72, // 36px padding on each side (see OrderDocument)
  rowIndexColumnPx: 34, // "01" index column width + gap before the name
  headerHeight: 150, // title + subtitle + date/time/order# + page indicator + spacing
  sectionLabelHeight: 44, // "PRODUCTS" label row incl. top/bottom borders
  footerHeight: 80, // total count line + ORDERIT wordmark
  rowBaseHeight: 34, // a single-line product row
  rowWrapExtraHeightPerLine: 20, // extra height per additional wrapped line
  bottomPadding: 40,
};

function estimateRowHeight(name: string): number {
  const availableTextWidthPx =
    LAYOUT.documentWidthPx -
    LAYOUT.documentHorizontalPaddingPx -
    LAYOUT.rowIndexColumnPx;
  // Conservative average glyph width for ~15px/500-weight sans-serif.
  const avgCharWidthPx = 7.8;
  const estimatedTextWidthPx = name.length * avgCharWidthPx;
  const lines = Math.max(1, Math.ceil(estimatedTextWidthPx / availableTextWidthPx));
  return LAYOUT.rowBaseHeight + (lines - 1) * LAYOUT.rowWrapExtraHeightPerLine;
}

/**
 * A4 portrait, matching the jsPDF instance used for export ("pt" units).
 * We don't need a real jsPDF instance just to measure page budget.
 */
export function computeMaxPageHeightPx(
  documentWidthPx: number = LAYOUT.documentWidthPx
): number {
  const pageWidthPt = 595.28;
  const pageHeightPt = 841.89;
  const marginPt = 40;
  const usableWidthPt = pageWidthPt - marginPt * 2;
  const usableHeightPt = pageHeightPt - marginPt * 2;
  const scale = usableWidthPt / documentWidthPx;
  return usableHeightPt / scale;
}

/**
 * Greedily packs items into pages so that no page's estimated content
 * height exceeds the budget. Footer height is reserved on every page
 * (not just the last) — this wastes a little space on multi-page orders
 * but guarantees a page can never overflow once the footer is added.
 */
export function paginateItems<T extends { product: { name: string } }>(
  items: T[],
  maxPageHeightPx: number
): T[][] {
  if (items.length === 0) return [[]];

  const fixedOverhead =
    LAYOUT.headerHeight +
    LAYOUT.sectionLabelHeight +
    LAYOUT.footerHeight +
    LAYOUT.bottomPadding;

  const pages: T[][] = [];
  let current: T[] = [];
  let currentHeight = fixedOverhead;

  for (const item of items) {
    const rowHeight = estimateRowHeight(item.product.name);
    if (current.length > 0 && currentHeight + rowHeight > maxPageHeightPx) {
      pages.push(current);
      current = [];
      currentHeight = fixedOverhead;
    }
    current.push(item);
    currentHeight += rowHeight;
  }
  if (current.length > 0) pages.push(current);

  return pages;
}
