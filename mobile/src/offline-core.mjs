function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function recordKey(shopId, recordId) {
  return JSON.stringify([shopId, recordId]);
}

export function createPendingOrderRecord({ shopId, productIds, products, localId = makeId(), idempotencyKey = makeId(), createdAt = new Date().toISOString() }) {
  if (typeof shopId !== "string" || !shopId) throw new Error("A signed-in shop is required.");
  if (!Array.isArray(productIds) || productIds.length === 0 || productIds.some((id) => typeof id !== "string" || !id) || new Set(productIds).size !== productIds.length) {
    throw new Error("Select one or more different products.");
  }
  const byId = new Map(products.map((product) => [product.id, product]));
  const items = productIds.map((productId, position) => {
    const product = byId.get(productId);
    if (!product || product.active !== true) throw new Error("One or more selected products are no longer active. Refresh the catalog and review this order.");
    return { productId, name: product.name, position };
  });
  return {
    key: recordKey(shopId, localId), shopId, localId, serverId: null,
    idempotencyKey, orderNumber: null, createdAt, items,
    status: "pending", attentionCode: null, attentionReason: null,
  };
}

export function createOutboxRecord(order) {
  return {
    key: order.key, shopId: order.shopId, localId: order.localId,
    idempotencyKey: order.idempotencyKey,
    productIds: order.items.map((item) => item.productId),
    createdAt: order.createdAt, status: order.status,
    attentionCode: order.attentionCode || null,
    attentionReason: order.attentionReason || null,
  };
}

export function classifySyncFailure(status, message = "") {
  if (status === 401 || status === 403) {
    return { status: "needs_attention", code: "authorization", message: message || "Sign in to this shop again before syncing." };
  }
  if (status === 409 && /no longer active|inactive/i.test(message)) {
    return { status: "needs_attention", code: "stale_products", message };
  }
  if (status === 409) {
    return { status: "needs_attention", code: "conflict", message: message || "The server found an order conflict. Keep this draft and contact support if it continues." };
  }
  if (status === 400 || status === 422) {
    return { status: "needs_attention", code: "invalid_order", message: message || "Review this order before retrying." };
  }
  return { status: "pending", code: null, message: message || "Sync will retry when the service is available." };
}

export function reviseAttentionOrder(order, productIds, activeProducts) {
  if (!order || order.status !== "needs_attention" || order.attentionCode !== "stale_products") {
    throw new Error("Only an order flagged for inactive products can be revised here.");
  }
  if (!Array.isArray(productIds) || productIds.length === 0 || productIds.some((id) => typeof id !== "string" || !id) || new Set(productIds).size !== productIds.length) {
    throw new Error("Select one or more different active products.");
  }
  const previousIds = order.items.map((item) => item.productId);
  if (productIds.length === previousIds.length && productIds.every((id, index) => id === previousIds[index])) {
    throw new Error("Change the selection explicitly before retrying this order.");
  }
  const byId = new Map(activeProducts.filter((product) => product.active === true).map((product) => [product.id, product]));
  const items = productIds.map((productId, position) => {
    const product = byId.get(productId);
    if (!product) throw new Error("This selection includes a product that is not in the current active catalog.");
    return { productId, name: product.name, position };
  });
  return { ...order, items, status: "pending", attentionCode: null, attentionReason: null };
}

function normalizeServerItems(items = []) {
  return items.map((item, position) => ({
    productId: item.productId,
    name: item.product?.name || item.name || "Product no longer available",
    position: Number.isInteger(item.position) ? item.position : position,
  }));
}

export function mergeServerOrders(shopId, existingOrders, serverOrders) {
  const merged = existingOrders.map((order) => ({ ...order }));
  const acknowledgedLocalIds = new Set();
  for (const serverOrder of serverOrders) {
    const match = merged.find((candidate) =>
      candidate.serverId === serverOrder.id ||
      candidate.localId === `server:${serverOrder.id}` ||
      (serverOrder.idempotencyKey && candidate.idempotencyKey === serverOrder.idempotencyKey)
    );
    const item = {
      key: recordKey(shopId, match?.localId || `server:${serverOrder.id}`),
      shopId,
      localId: match?.localId || `server:${serverOrder.id}`,
      serverId: serverOrder.id,
      idempotencyKey: serverOrder.idempotencyKey || match?.idempotencyKey || null,
      orderNumber: serverOrder.orderNumber,
      createdAt: new Date(serverOrder.createdAt).toISOString(),
      items: normalizeServerItems(serverOrder.items),
      status: "synced",
      attentionCode: null,
      attentionReason: null,
    };
    if (match) {
      Object.assign(match, item);
      acknowledgedLocalIds.add(match.localId);
    } else {
      merged.push(item);
    }
  }
  merged.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return { orders: merged, acknowledgedLocalIds: [...acknowledgedLocalIds] };
}
