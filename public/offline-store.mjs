export const DB_NAME = "orderit-shop-offline";
export const DB_VERSION = 1;
const STORES = ["accounts", "products", "orders", "outbox", "settings"];
const ORDER_PAGE_SIZE = 100;

export function recordKey(shopId, recordId) {
  return JSON.stringify([shopId, recordId]);
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error("This browser does not support local offline storage."));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("accounts")) db.createObjectStore("accounts", { keyPath: "shopId" });
      if (!db.objectStoreNames.contains("products")) {
        const store = db.createObjectStore("products", { keyPath: "key" });
        store.createIndex("shopId", "shopId", { unique: false });
      }
      if (!db.objectStoreNames.contains("orders")) {
        const store = db.createObjectStore("orders", { keyPath: "key" });
        store.createIndex("shopId", "shopId", { unique: false });
      }
      if (!db.objectStoreNames.contains("outbox")) {
        const store = db.createObjectStore("outbox", { keyPath: "key" });
        store.createIndex("shopId", "shopId", { unique: false });
      }
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open local offline storage."));
    request.onblocked = () => reject(new Error("Offline storage is busy in another tab. Close other OrderIT tabs and retry."));
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Local storage request failed."));
  });
}

async function withTransaction(storeNames, mode, run) {
  const db = await openDatabase();
  const tx = db.transaction(storeNames, mode);
  const completed = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error || new Error("Local storage transaction was aborted."));
    tx.onerror = () => reject(tx.error || new Error("Local storage transaction failed."));
  });
  try {
    const result = await run(Object.fromEntries(storeNames.map((name) => [name, tx.objectStore(name)])));
    await completed;
    return result;
  } catch (error) {
    try { tx.abort(); } catch {}
    await completed.catch(() => {});
    throw error;
  } finally {
    db.close();
  }
}

async function allForShop(store, shopId) {
  return requestValue(store.index("shopId").getAll(IDBKeyRange.only(shopId)));
}

async function deleteForShop(store, shopId) {
  const records = await allForShop(store, shopId);
  for (const record of records) store.delete(record.key);
}

function normalizeServerItems(items = []) {
  return items.map((item, position) => ({
    productId: item.productId,
    name: item.product?.name || item.name || "Product no longer available",
    position: Number.isInteger(item.position) ? item.position : position,
  }));
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

export async function getDeviceContext() {
  return withTransaction(["settings"], "readonly", async ({ settings }) => {
    const record = await requestValue(settings.get("active-context"));
    if (!record) return { role: "SIGNED_OUT", userId: null, updatedAt: null };
    return { role: record.role, userId: record.userId || null, updatedAt: record.updatedAt || null };
  });
}

export async function setDeviceContext(role, userId = null) {
  if (!["SHOP", "ADMIN", "SIGNED_OUT"].includes(role)) throw new Error("Invalid local account role.");
  return withTransaction(["settings"], "readwrite", async ({ settings }) => {
    const record = { key: "active-context", role, userId: role === "SIGNED_OUT" ? null : userId, updatedAt: new Date().toISOString() };
    await requestValue(settings.put(record));
    return record;
  });
}

export async function getShopData(shopId) {
  return withTransaction(["accounts", "products", "orders", "outbox"], "readonly", async ({ accounts, products, orders, outbox }) => {
    const [account, catalog, history, queue] = await Promise.all([
      requestValue(accounts.get(shopId)), allForShop(products, shopId), allForShop(orders, shopId), allForShop(outbox, shopId),
    ]);
    history.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    queue.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    return { account: account || null, products: catalog, orders: history, outbox: queue };
  });
}

export async function saveShopSnapshot(user, activeProducts, serverOrders) {
  const now = new Date().toISOString();
  const shopId = user.id;
  return withTransaction(["accounts", "products", "orders", "outbox"], "readwrite", async ({ accounts, products, orders, outbox }) => {
    const [priorAccount, existingOrders] = await Promise.all([
      requestValue(accounts.get(shopId)), allForShop(orders, shopId),
    ]);
    const merged = mergeServerOrders(shopId, existingOrders, serverOrders);
    await accounts.put({
      shopId, name: user.name, role: "SHOP",
      initializedAt: priorAccount?.initializedAt || now,
      lastSyncAt: now,
    });
    await deleteForShop(products, shopId);
    for (const product of activeProducts) {
      if (typeof product.id === "string" && typeof product.name === "string" && product.active === true) {
        await products.put({ key: recordKey(shopId, product.id), shopId, id: product.id, name: product.name, active: true, cachedAt: now });
      }
    }
    for (const order of merged.orders) await orders.put(order);
    for (const localId of merged.acknowledgedLocalIds) outbox.delete(recordKey(shopId, localId));
    return { lastSyncAt: now, acknowledged: merged.acknowledgedLocalIds.length };
  });
}

export async function saveActiveCatalog(shopId, activeProducts) {
  const now = new Date().toISOString();
  return withTransaction(["products"], "readwrite", async ({ products }) => {
    await deleteForShop(products, shopId);
    for (const product of activeProducts) {
      if (typeof product.id === "string" && typeof product.name === "string" && product.active === true) {
        await products.put({ key: recordKey(shopId, product.id), shopId, id: product.id, name: product.name, active: true, cachedAt: now });
      }
    }
  });
}

export async function enqueueOrder(shopId, productIds) {
  const data = await getShopData(shopId);
  if (!data.account?.initializedAt) throw new Error("Complete an online sign-in and first sync on this device before saving offline orders.");
  const order = createPendingOrderRecord({ shopId, productIds, products: data.products });
  const outbox = createOutboxRecord(order);
  await withTransaction(["orders", "outbox"], "readwrite", async ({ orders, outbox: queue }) => {
    await orders.put(order);
    await queue.put(outbox);
  });
  return order;
}

export async function reviseQueuedOrder(shopId, localId, productIds) {
  const data = await getShopData(shopId);
  const existing = data.orders.find((order) => order.localId === localId);
  if (!existing) throw new Error("This saved order is no longer on this device.");
  const revised = reviseAttentionOrder(existing, productIds, data.products);
  await withTransaction(["orders", "outbox"], "readwrite", async ({ orders, outbox }) => {
    await orders.put(revised);
    await outbox.put(createOutboxRecord(revised));
  });
  return revised;
}

async function markOrderAttention(shopId, localId, failure) {
  await withTransaction(["orders", "outbox"], "readwrite", async ({ orders, outbox }) => {
    const key = recordKey(shopId, localId);
    const [order, queued] = await Promise.all([requestValue(orders.get(key)), requestValue(outbox.get(key))]);
    if (!order || !queued) return;
    const updated = { ...order, status: failure.status, attentionCode: failure.code, attentionReason: failure.message };
    await orders.put(updated);
    await outbox.put({ ...queued, status: failure.status, attentionCode: failure.code, attentionReason: failure.message });
  });
}

async function acknowledgeOrder(shopId, localId, serverOrder) {
  const serverItem = mergeServerOrders(shopId, [], [serverOrder]).orders[0];
  await withTransaction(["orders", "outbox"], "readwrite", async ({ orders, outbox }) => {
    const key = recordKey(shopId, localId);
    const existing = await requestValue(orders.get(key));
    if (!existing) return;
    await orders.put({ ...existing, ...serverItem, key, localId, shopId, status: "synced" });
    outbox.delete(key);
  });
}

async function sendJSON(fetcher, url, options) {
  const response = await fetcher(url, options);
  let body = {};
  try { body = await response.json(); } catch {}
  return { response, body };
}

async function refreshProducts(shopId, fetcher) {
  const { response, body } = await sendJSON(fetcher, "/api/products?active=true", { cache: "no-store" });
  if (!response.ok || !Array.isArray(body.products)) throw new Error(body.error || "Could not refresh the product catalog.");
  await saveActiveCatalog(shopId, body.products);
}

async function syncQueuedOrders(shopId, fetcher) {
  const initial = await getShopData(shopId);
  const results = { synced: 0, attention: 0, pending: 0 };
  for (const queued of initial.outbox) {
    if (queued.status === "needs_attention" && queued.attentionCode !== "authorization") {
      results.attention += 1;
      continue;
    }
    try {
      const { response, body } = await sendJSON(fetcher, "/api/orders", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Idempotency-Key": queued.idempotencyKey },
        body: JSON.stringify({ productIds: queued.productIds, idempotencyKey: queued.idempotencyKey }),
      });
      if (response.ok && body.order?.id) {
        await acknowledgeOrder(shopId, queued.localId, body.order);
        results.synced += 1;
      } else {
        const failure = classifySyncFailure(response.status, body.error || "");
        await markOrderAttention(shopId, queued.localId, failure);
        if (failure.code === "stale_products") {
          try { await refreshProducts(shopId, fetcher); } catch {}
        }
        if (failure.status === "needs_attention") results.attention += 1;
        else results.pending += 1;
      }
    } catch {
      results.pending += 1;
    }
  }
  return results;
}

export async function syncShop(fetcher = fetch) {
  let auth;
  try {
    const result = await sendJSON(fetcher, "/api/auth/me", { cache: "no-store" });
    if (!result.response.ok) {
      if (result.response.status === 401) await setDeviceContext("SIGNED_OUT");
      return { reachable: true, role: null, initialized: false, error: result.body.error || "Sign in online to continue." };
    }
    auth = result.body.user;
  } catch {
    const context = await getDeviceContext().catch(() => ({ role: "SIGNED_OUT", userId: null }));
    const data = context.role === "SHOP" && context.userId ? await getShopData(context.userId).catch(() => null) : null;
    return { reachable: false, role: context.role, shopId: context.userId, initialized: Boolean(data?.account?.initializedAt), error: "The service could not be reached. Saved orders stay on this device." };
  }
  if (auth?.role === "ADMIN") {
    await setDeviceContext("ADMIN", auth.id);
    return { reachable: true, role: "ADMIN", initialized: false, error: "Admin pages are online-only." };
  }
  if (auth?.role !== "SHOP" || typeof auth.id !== "string") {
    return { reachable: true, role: null, initialized: false, error: "No shop account is signed in." };
  }
  await setDeviceContext("SHOP", auth.id);
  let snapshotError = null;
  try {
    const [catalogResult, firstPage] = await Promise.all([
      sendJSON(fetcher, "/api/products?active=true", { cache: "no-store" }),
      sendJSON(fetcher, `/api/orders?sync=1&take=${ORDER_PAGE_SIZE}&skip=0`, { cache: "no-store" }),
    ]);
    if (!catalogResult.response.ok || !Array.isArray(catalogResult.body.products)) throw new Error(catalogResult.body.error || "Product catalog sync failed.");
    if (!firstPage.response.ok || !Array.isArray(firstPage.body.orders)) throw new Error(firstPage.body.error || "Order history sync failed.");
    const serverOrders = [...firstPage.body.orders];
    let skip = firstPage.body.orders.length;
    let hasMore = Boolean(firstPage.body.hasMore);
    while (hasMore) {
      if (serverOrders.length >= 10000) throw new Error("Order history is too large to sync in one session.");
      const page = await sendJSON(fetcher, `/api/orders?sync=1&take=${ORDER_PAGE_SIZE}&skip=${skip}`, { cache: "no-store" });
      if (!page.response.ok || !Array.isArray(page.body.orders)) throw new Error(page.body.error || "Order history sync failed.");
      serverOrders.push(...page.body.orders);
      skip += page.body.orders.length;
      hasMore = Boolean(page.body.hasMore);
    }
    await saveShopSnapshot(auth, catalogResult.body.products, serverOrders);
  } catch (error) {
    snapshotError = error instanceof Error ? error.message : "Initial sync could not be completed.";
  }
  const data = await getShopData(auth.id).catch(() => ({ account: null }));
  let queueResults = { synced: 0, attention: 0, pending: 0 };
  if (data.account?.initializedAt) {
    queueResults = await syncQueuedOrders(auth.id, fetcher);
  }
  const latest = await getShopData(auth.id).catch(() => ({ account: data.account, outbox: [] }));
  return {
    reachable: true,
    role: "SHOP",
    shopId: auth.id,
    initialized: Boolean(latest.account?.initializedAt),
    lastSyncAt: latest.account?.lastSyncAt || null,
    queue: queueResults,
    error: snapshotError || null,
  };
}

export async function getShopStatus(shopId) {
  const data = await getShopData(shopId);
  const pendingCount = data.outbox.filter((item) => item.status === "pending").length;
  const attentionCount = data.outbox.filter((item) => item.status === "needs_attention").length;
  return {
    initialized: Boolean(data.account?.initializedAt),
    shopId,
    shopName: data.account?.name || "",
    lastSyncAt: data.account?.lastSyncAt || null,
    productCount: data.products.length,
    orderCount: data.orders.length,
    pendingCount,
    attentionCount,
  };
}
