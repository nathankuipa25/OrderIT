export type SelectedProduct = { id: string; name: string };
export type ProductSelectionSummary = {
  count: number;
  ids: string[];
  products: SelectedProduct[];
  scope: string;
};

export function toggleProductSelection(
  selection: ReadonlyMap<string, string>,
  product: SelectedProduct
): Map<string, string>;
export function toggleLoadedProductSelection(
  selection: ReadonlyMap<string, string>,
  products: SelectedProduct[]
): Map<string, string>;
export function summarizeProductSelection(
  selection: ReadonlyMap<string, string>
): ProductSelectionSummary;
