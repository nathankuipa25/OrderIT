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

const legacyOrderStatuses = new Set(["pending", "synced", "needs_attention"]);
const legacyRoles = new Set(["SHOP", "ADMIN", "SIGNED_OUT"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNullableText(value) {
  return value == null || typeof value === "string";
}

export function validateLegacySnapshot(snapshot) {
  const records = { accounts: [], products: [], orders: [], outbox: [], settings: [] };
  const issues = [];
  const issue = (store, row, reason) => issues.push({ store, row, reason });
  if (!isRecord(snapshot)) {
    return { records, issues: [{ store: "snapshot", row: 0, reason: "Expected a saved-data snapshot." }] };
  }

  const sourceRows = (store) => {
    const value = snapshot[store];
    if (value == null) return [];
    if (!Array.isArray(value)) {
      issue(store, -1, "The saved-data list could not be read as a list.");
      return [];
    }
    return value;
  };
  const uniqueKey = (seen, store, index, key) => {
    if (seen.has(key)) {
      issue(store, index, "This record duplicates an earlier saved record.");
      return false;
    }
    seen.add(key);
    return true;
  };

  const seenAccounts = new Set();
  sourceRows("accounts").forEach((row, index) => {
    if (!isRecord(row) || !isText(row.shopId) || row.role !== "SHOP" || !isText(row.name) || !isTimestamp(row.initializedAt) || (row.lastSyncAt != null && !isTimestamp(row.lastSyncAt))) {
      issue("accounts", index, "Shop identity or saved sync timestamps are incomplete.");
      return;
    }
    if (!uniqueKey(seenAccounts, "accounts", index, row.shopId)) return;
    records.accounts.push({
      shopId: row.shopId,
      name: row.name,
      role: "SHOP",
      initializedAt: row.initializedAt,
      lastSyncAt: row.lastSyncAt || row.initializedAt,
    });
  });

  const seenProducts = new Set();
  sourceRows("products").forEach((row, index) => {
    if (!isRecord(row) || !isText(row.shopId) || !isText(row.id) || !isText(row.name) || typeof row.active !== "boolean" || (row.cachedAt != null && !isTimestamp(row.cachedAt))) {
      issue("products", index, "Product identity, active state, or saved timestamp is invalid.");
      return;
    }
    const key = recordKey(row.shopId, row.id);
    if (!uniqueKey(seenProducts, "products", index, key)) return;
    records.products.push({
      key,
      shopId: row.shopId,
      id: row.id,
      name: row.name,
      active: row.active,
      ...(row.cachedAt ? { cachedAt: row.cachedAt } : {}),
    });
  });

  const seenOrders = new Set();
  const orderSourceRows = new Map();
  sourceRows("orders").forEach((row, index) => {
    const items = Array.isArray(row?.items) ? row.items : [];
    const positions = new Set();
    const itemsValid = items.length > 0 && items.every((item) => {
      if (!isRecord(item) || !isText(item.productId) || !isText(item.name) || !Number.isInteger(item.position) || item.position < 0 || positions.has(item.position)) return false;
      positions.add(item.position);
      return true;
    });
    const validNullableId = row?.serverId == null || isText(row.serverId);
    const validIdempotency = row?.idempotencyKey == null || isText(row.idempotencyKey);
    const validOrderNumber = row?.orderNumber == null || (Number.isInteger(row.orderNumber) && row.orderNumber > 0);
    if (!isRecord(row) || !isText(row.shopId) || !isText(row.localId) || !isTimestamp(row.createdAt) || !itemsValid || !legacyOrderStatuses.has(row.status) || !validNullableId || !validIdempotency || !validOrderNumber || !isNullableText(row.attentionCode) || !isNullableText(row.attentionReason)) {
      issue("orders", index, "Order identity, date, status, or item details are invalid.");
      return;
    }
    const key = recordKey(row.shopId, row.localId);
    if (!uniqueKey(seenOrders, "orders", index, key)) return;
    records.orders.push({
      key,
      shopId: row.shopId,
      localId: row.localId,
      serverId: row.serverId || null,
      idempotencyKey: row.idempotencyKey || null,
      orderNumber: row.orderNumber || null,
      createdAt: row.createdAt,
      items: items.map((item) => ({ productId: item.productId, name: item.name, position: item.position })),
      status: row.status,
      attentionCode: row.attentionCode || null,
      attentionReason: row.attentionReason || null,
    });
    orderSourceRows.set(key, index);
  });

  const seenOutbox = new Set();
  sourceRows("outbox").forEach((row, index) => {
    const productIds = Array.isArray(row?.productIds) ? row.productIds : [];
    const validProductIds = productIds.length > 0 && productIds.every(isText) && new Set(productIds).size === productIds.length;
    if (!isRecord(row) || !isText(row.shopId) || !isText(row.localId) || !isText(row.idempotencyKey) || !isTimestamp(row.createdAt) || !validProductIds || !legacyOrderStatuses.has(row.status) || !isNullableText(row.attentionCode) || !isNullableText(row.attentionReason)) {
      issue("outbox", index, "Queued-order identity, date, status, or product list is invalid.");
      return;
    }
    const key = recordKey(row.shopId, row.localId);
    if (!uniqueKey(seenOutbox, "outbox", index, key)) return;
    records.outbox.push({
      key,
      shopId: row.shopId,
      localId: row.localId,
      idempotencyKey: row.idempotencyKey,
      productIds: [...productIds],
      createdAt: row.createdAt,
      status: row.status,
      attentionCode: row.attentionCode || null,
      attentionReason: row.attentionReason || null,
      sourceRow: index,
    });
  });

  const ordersByKey = new Map(records.orders.map((order) => [recordKey(order.shopId, order.localId), order]));
  records.outbox = records.outbox.filter((queued) => {
    const order = ordersByKey.get(recordKey(queued.shopId, queued.localId));
    const matches = order && order.idempotencyKey === queued.idempotencyKey && order.status === queued.status &&
      order.items.map((item) => item.productId).join("\u0000") === queued.productIds.join("\u0000");
    if (matches) {
      delete queued.sourceRow;
      return true;
    }
    issue("outbox", queued.sourceRow, "The queued order does not match a valid saved order; it was kept in the original data.");
    delete queued.sourceRow;
    return false;
  });

  const queuedOrderKeys = new Set(records.outbox.map((queued) => recordKey(queued.shopId, queued.localId)));
  for (const order of records.orders) {
    if (order.status === "synced") continue;
    const key = recordKey(order.shopId, order.localId);
    if (queuedOrderKeys.has(key)) continue;
    const sourceRow = orderSourceRows.get(key) ?? -1;
    if (isText(order.idempotencyKey)) {
      records.outbox.push({
        key,
        shopId: order.shopId,
        localId: order.localId,
        idempotencyKey: order.idempotencyKey,
        productIds: order.items.map((item) => item.productId),
        createdAt: order.createdAt,
        status: order.status,
        attentionCode: order.attentionCode,
        attentionReason: order.attentionReason,
      });
      queuedOrderKeys.add(key);
      issue("orders", sourceRow, "This saved order had no queue row; a safe retry was restored using its saved idempotency key. The original data is unchanged.");
    } else {
      issue("orders", sourceRow, "This saved order had no queue row or stable idempotency key, so it cannot be retried safely. The original data is unchanged.");
    }
  }

  const seenSettings = new Set();
  sourceRows("settings").forEach((row, index) => {
    if (!isRecord(row) || row.key !== "active-context") {
      issue("settings", index, "This saved setting is not supported by the native app.");
      return;
    }
    if (!uniqueKey(seenSettings, "settings", index, row.key)) return;
    const validUser = row.role === "SIGNED_OUT" ? row.userId == null : isText(row.userId);
    if (!legacyRoles.has(row.role) || !validUser || (row.updatedAt != null && !isTimestamp(row.updatedAt))) {
      issue("settings", index, "Saved account context is incomplete.");
      return;
    }
    records.settings.push({
      key: "active-context",
      role: row.role,
      userId: row.userId || null,
      updatedAt: row.updatedAt || new Date().toISOString(),
    });
  });

  return { records, issues };
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
