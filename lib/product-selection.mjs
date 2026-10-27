export function toggleProductSelection(selection, product) {
  const next = new Map(selection);
  if (next.has(product.id)) next.delete(product.id);
  else next.set(product.id, product.name);
  return next;
}

export function toggleLoadedProductSelection(selection, products) {
  const allLoadedSelected =
    products.length > 0 && products.every((product) => selection.has(product.id));
  const next = new Map(selection);
  for (const product of products) {
    if (allLoadedSelected) next.delete(product.id);
    else next.set(product.id, product.name);
  }
  return next;
}

export function summarizeProductSelection(selection) {
  const products = Array.from(selection, ([id, name]) => ({ id, name }));
  return {
    count: products.length,
    ids: products.map((product) => product.id),
    products,
    scope: "all and only the explicitly selected products in the catalog",
  };
}
