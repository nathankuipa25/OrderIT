import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  classifySyncFailure,
  createOutboxRecord,
  createPendingOrderRecord,
  mergeServerOrders,
  recordKey,
  reviseAttentionOrder,
  validateLegacySnapshot,
  type LegacyImportIssue,
  type LegacySnapshotInput,
  type OrderRecord,
  type OutboxRecord,
  type ProductRecord,
  type ServerOrder,
} from "./offline-core.mjs";

const STORAGE_KEY = "@orderit/shop-offline-v1";
const ORDER_PAGE_SIZE = 100;
const MAX_HISTORY_ORDERS = 10_000;

export type ShopUser = { id: string; name: string; role: "SHOP" | "ADMIN" };
export type ShopAccount = {
  shopId: string;
  name: string;
  role: "SHOP";
  initializedAt: string;
  lastSyncAt: string;
};
export type NativeDeviceContext = {
  role: "SHOP" | "ADMIN" | "SIGNED_OUT";
  userId: string | null;
  updatedAt: string | null;
};
export type ShopData = {
  account: ShopAccount | null;
  products: Array<ProductRecord & { cachedAt?: string }>;
  orders: OrderRecord[];
  outbox: OutboxRecord[];
};
export type SyncResult = {
  reachable: boolean;
  role: "SHOP" | "ADMIN" | null;
  shopId?: string;
  initialized: boolean;
  unauthorized?: boolean;
  lastSyncAt?: string | null;
  queue?: { synced: number; attention: number; pending: number };
  error?: string | null;
};

type StoreState = {
  accounts: Record<string, ShopAccount>;
  products: Record<string, Array<ProductRecord & { cachedAt?: string }>>;
  orders: Record<string, OrderRecord[]>;
  outbox: Record<string, OutboxRecord[]>;
  context: NativeDeviceContext;
  migrationComplete: boolean;
  migrationAcknowledged: boolean;
  migrationIssues: LegacyImportIssue[];
  migrationError: string | null;
};

export type LegacyMigrationState = {
  shouldPrompt: boolean;
  complete: boolean;
  acknowledged: boolean;
  issues: LegacyImportIssue[];
  error: string | null;
};

export type LegacyImportResult = { shops: number; orders: number; queued: number; complete: boolean; issues: LegacyImportIssue[] };

const emptyState = (): StoreState => ({
  accounts: {},
  products: {},
  orders: {},
  outbox: {},
  context: { role: "SIGNED_OUT", userId: null, updatedAt: null },
  migrationComplete: false,
  migrationAcknowledged: false,
  migrationIssues: [],
  migrationError: null,
});

let writeTail: Promise<unknown> = Promise.resolve();

async function readState(): Promise<StoreState> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    const saved = JSON.parse(raw) as Partial<StoreState>;
    return {
      ...emptyState(),
      ...saved,
      accounts: saved.accounts || {},
      products: saved.products || {},
      orders: saved.orders || {},
      outbox: saved.outbox || {},
      context: saved.context || emptyState().context,
      migrationComplete: saved.migrationComplete === true,
      migrationAcknowledged: saved.migrationAcknowledged === true,
      migrationIssues: Array.isArray(saved.migrationIssues) ? saved.migrationIssues : [],
      migrationError: typeof saved.migrationError === "string" ? saved.migrationError : null,
    };
  } catch {
    throw new Error("Saved offline shop data could not be read. Keep the app installed and contact support before clearing app storage.");
  }
}

async function mutate<T>(operation: (state: StoreState) => T | Promise<T>): Promise<T> {
  const task = writeTail.then(async () => {
    const state = await readState();
    const result = await operation(state);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return result;
  });
  writeTail = task.then(() => undefined, () => undefined);
  return task;
}

async function inspect<T>(operation: (state: StoreState) => T): Promise<T> {
  await writeTail;
  return operation(await readState());
}

function byNewest<T extends { createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function getLegacyMigrationState(): Promise<LegacyMigrationState> {
  return inspect((state) => ({
    shouldPrompt: !state.migrationComplete && !state.migrationAcknowledged,
    complete: state.migrationComplete,
    acknowledged: state.migrationAcknowledged,
    issues: state.migrationIssues.map((item) => ({ ...item })),
    error: state.migrationError,
  }));
}

export async function importLegacyIndexedDb(snapshot: LegacySnapshotInput): Promise<LegacyImportResult> {
  const { records, issues } = validateLegacySnapshot(snapshot);
  return mutate((state) => {
    if (state.migrationComplete) return { shops: Object.keys(state.accounts).length, orders: 0, queued: 0, complete: true, issues: [] };
    let migratedOrders = 0;
    let migratedQueued = 0;
    for (const row of records.accounts) {
      const shopId = row.shopId;
      if (!state.accounts[shopId]) state.accounts[shopId] = row;
    }
    for (const row of records.products) {
      const shopId = row.shopId;
      const rows = state.products[shopId] || [];
      if (!rows.some((item) => item.id === row.id)) {
        rows.push({ id: row.id, name: row.name, active: row.active, ...(row.cachedAt ? { cachedAt: row.cachedAt } : {}) });
        state.products[shopId] = rows;
      }
    }
    for (const row of records.orders) {
      const shopId = row.shopId;
      const rows = state.orders[shopId] || [];
      if (!rows.some((item) => item.localId === row.localId)) {
        rows.push(row);
        state.orders[shopId] = rows;
        migratedOrders += 1;
      }
    }
    for (const row of records.outbox) {
      const shopId = row.shopId;
      const rows = state.outbox[shopId] || [];
      if (!rows.some((item) => item.localId === row.localId)) {
        rows.push(row);
        state.outbox[shopId] = rows;
        migratedQueued += 1;
      }
    }
    const activeContext = records.settings.find((row) => row.key === "active-context");
    if (activeContext) {
      state.context = {
        role: activeContext.role,
        userId: activeContext.userId,
        updatedAt: activeContext.updatedAt,
      };
    }
    state.migrationIssues = issues.map((item) => ({ ...item }));
    state.migrationError = null;
    state.migrationComplete = issues.length === 0;
    state.migrationAcknowledged = false;
    return { shops: Object.keys(state.accounts).length, orders: migratedOrders, queued: migratedQueued, complete: state.migrationComplete, issues: state.migrationIssues };
  });
}

export async function recordLegacyMigrationError(message: string | null): Promise<void> {
  await mutate((state) => { state.migrationError = message; });
}

export async function acknowledgeLegacyMigration(): Promise<void> {
  await mutate((state) => {
    if (!state.migrationComplete) state.migrationAcknowledged = true;
  });
}

export async function getDeviceContext(): Promise<NativeDeviceContext> {
  return inspect((state) => ({ ...state.context }));
}

export async function setDeviceContext(role: NativeDeviceContext["role"], userId: string | null = null): Promise<void> {
  await mutate((state) => {
    state.context = {
      role,
      userId: role === "SIGNED_OUT" ? null : userId,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function getShopData(shopId: string): Promise<ShopData> {
  return inspect((state) => ({
    account: state.accounts[shopId] || null,
    products: [...(state.products[shopId] || [])],
    orders: byNewest(state.orders[shopId] || []),
    outbox: [...(state.outbox[shopId] || [])].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
  }));
}

async function saveShopSnapshot(user: ShopUser, activeProducts: ProductRecord[], serverOrders: ServerOrder[]): Promise<{ lastSyncAt: string; acknowledged: number }> {
  const now = new Date().toISOString();
  return mutate((state) => {
    const shopId = user.id;
    const previousAccount = state.accounts[shopId];
    const merged = mergeServerOrders(shopId, state.orders[shopId] || [], serverOrders);
    state.accounts[shopId] = {
      shopId,
      name: user.name,
      role: "SHOP",
      initializedAt: previousAccount?.initializedAt || now,
      lastSyncAt: now,
    };
    state.products[shopId] = activeProducts
      .filter((product) => typeof product.id === "string" && typeof product.name === "string" && product.active === true)
      .map((product) => ({ ...product, cachedAt: now }));
    state.orders[shopId] = merged.orders;
    const acknowledged = new Set(merged.acknowledgedLocalIds);
    state.outbox[shopId] = (state.outbox[shopId] || []).filter((row) => !acknowledged.has(row.localId));
    return { lastSyncAt: now, acknowledged: acknowledged.size };
  });
}

export async function enqueueOrder(shopId: string, productIds: string[]): Promise<OrderRecord> {
  const existing = await getShopData(shopId);
  if (!existing.account?.initializedAt) throw new Error("Complete an online sign-in and first sync on this device before saving offline orders.");
  const order = createPendingOrderRecord({ shopId, productIds, products: existing.products });
  const queued = createOutboxRecord(order);
  return mutate((state) => {
    state.orders[shopId] = [...(state.orders[shopId] || []), order];
    state.outbox[shopId] = [...(state.outbox[shopId] || []), queued];
    return order;
  });
}

export async function reviseQueuedOrder(shopId: string, localId: string, productIds: string[]): Promise<OrderRecord> {
  const existing = await getShopData(shopId);
  const order = existing.orders.find((item) => item.localId === localId);
  if (!order) throw new Error("This saved order is no longer on this device.");
  const revised = reviseAttentionOrder(order, productIds, existing.products);
  return mutate((state) => {
    state.orders[shopId] = (state.orders[shopId] || []).map((item) => item.localId === localId ? revised : item);
    state.outbox[shopId] = (state.outbox[shopId] || []).map((item) => item.localId === localId ? createOutboxRecord(revised) : item);
    return revised;
  });
}

async function saveActiveCatalog(shopId: string, activeProducts: ProductRecord[]): Promise<void> {
  const cachedAt = new Date().toISOString();
  await mutate((state) => {
    state.products[shopId] = activeProducts
      .filter((product) => typeof product.id === "string" && typeof product.name === "string" && product.active === true)
      .map((product) => ({ ...product, cachedAt }));
  });
}

async function markOrderAttention(shopId: string, localId: string, failure: ReturnType<typeof classifySyncFailure>): Promise<void> {
  await mutate((state) => {
    state.orders[shopId] = (state.orders[shopId] || []).map((order) => order.localId === localId
      ? { ...order, status: failure.status, attentionCode: failure.code, attentionReason: failure.message }
      : order);
    state.outbox[shopId] = (state.outbox[shopId] || []).map((row) => row.localId === localId
      ? { ...row, status: failure.status, attentionCode: failure.code, attentionReason: failure.message }
      : row);
  });
}

async function acknowledgeOrder(shopId: string, localId: string, serverOrder: ServerOrder): Promise<void> {
  const serverItem = mergeServerOrders(shopId, [], [serverOrder]).orders[0];
  await mutate((state) => {
    state.orders[shopId] = (state.orders[shopId] || []).map((order) => order.localId === localId
      ? { ...order, ...serverItem, key: recordKey(shopId, localId), localId, shopId, status: "synced" }
      : order);
    state.outbox[shopId] = (state.outbox[shopId] || []).filter((row) => row.localId !== localId);
  });
}

async function sendJSON(fetcher: typeof fetch, apiBaseUrl: string, token: string, path: string, options: RequestInit = {}): Promise<{ response: Response; body: Record<string, any> }> {
  const base = apiBaseUrl.replace(/\/+$/, "");
  const response = await fetcher(`${base}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  let body: Record<string, any> = {};
  try { body = await response.json(); } catch {}
  return { response, body };
}

async function syncQueuedOrders(shopId: string, token: string, apiBaseUrl: string, fetcher: typeof fetch): Promise<{ synced: number; attention: number; pending: number }> {
  const initial = await getShopData(shopId);
  const results = { synced: 0, attention: 0, pending: 0 };
  for (const queued of initial.outbox) {
    if (queued.status === "needs_attention" && queued.attentionCode !== "authorization") {
      results.attention += 1;
      continue;
    }
    try {
      const { response, body } = await sendJSON(fetcher, apiBaseUrl, token, "/api/orders", {
        method: "POST",
        headers: { "Idempotency-Key": queued.idempotencyKey },
        body: JSON.stringify({ productIds: queued.productIds, idempotencyKey: queued.idempotencyKey }),
      });
      if (response.ok && body.order?.id) {
        await acknowledgeOrder(shopId, queued.localId, body.order as ServerOrder);
        results.synced += 1;
      } else {
        const failure = classifySyncFailure(response.status, String(body.error || ""));
        await markOrderAttention(shopId, queued.localId, failure);
        if (failure.code === "stale_products") {
          try {
            const refreshed = await sendJSON(fetcher, apiBaseUrl, token, "/api/products?active=true");
            if (refreshed.response.ok && Array.isArray(refreshed.body.products)) await saveActiveCatalog(shopId, refreshed.body.products as ProductRecord[]);
          } catch {}
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

export async function syncShop(token: string, apiBaseUrl: string, fetcher: typeof fetch = fetch): Promise<SyncResult> {
  let auth: ShopUser;
  try {
    const result = await sendJSON(fetcher, apiBaseUrl, token, "/api/auth/me");
    if (!result.response.ok) {
      if (result.response.status === 401) {
        await setDeviceContext("SIGNED_OUT");
        return { reachable: true, role: null, initialized: false, unauthorized: true, error: String(result.body.error || "Sign in online to continue.") };
      }
      const context = await getDeviceContext();
      const data = context.role === "SHOP" && context.userId ? await getShopData(context.userId).catch(() => null) : null;
      return {
        reachable: true,
        role: context.role === "SHOP" ? "SHOP" : context.role === "ADMIN" ? "ADMIN" : null,
        shopId: context.userId || undefined,
        initialized: Boolean(data?.account?.initializedAt),
        lastSyncAt: data?.account?.lastSyncAt || null,
        error: String(result.body.error || "The shop service could not confirm this session."),
      };
    }
    auth = result.body.user as ShopUser;
  } catch {
    const context = await getDeviceContext().catch(() => ({ role: "SIGNED_OUT" as const, userId: null, updatedAt: null }));
    const data = context.role === "SHOP" && context.userId ? await getShopData(context.userId).catch(() => null) : null;
    return {
      reachable: false,
      role: context.role === "ADMIN" ? "ADMIN" : context.role === "SHOP" ? "SHOP" : null,
      shopId: context.userId || undefined,
      initialized: Boolean(data?.account?.initializedAt),
      lastSyncAt: data?.account?.lastSyncAt || null,
      error: "The service could not be reached. Saved orders stay on this device.",
    };
  }

  if (auth?.role === "ADMIN") {
    await setDeviceContext("ADMIN", auth.id);
    return { reachable: true, role: "ADMIN", initialized: false, error: "The shop app is for shop accounts only." };
  }
  if (auth?.role !== "SHOP" || typeof auth.id !== "string") {
    return { reachable: true, role: null, initialized: false, error: "Sign in with a shop account to continue." };
  }

  await setDeviceContext("SHOP", auth.id);
  let snapshotError: string | null = null;
  try {
    const [catalogResult, firstPage] = await Promise.all([
      sendJSON(fetcher, apiBaseUrl, token, "/api/products?active=true"),
      sendJSON(fetcher, apiBaseUrl, token, `/api/orders?sync=1&take=${ORDER_PAGE_SIZE}&skip=0`),
    ]);
    if (!catalogResult.response.ok || !Array.isArray(catalogResult.body.products)) throw new Error(String(catalogResult.body.error || "Product catalog sync failed."));
    if (!firstPage.response.ok || !Array.isArray(firstPage.body.orders)) throw new Error(String(firstPage.body.error || "Order history sync failed."));
    const serverOrders = [...firstPage.body.orders] as ServerOrder[];
    let skip = firstPage.body.orders.length;
    let hasMore = Boolean(firstPage.body.hasMore);
    while (hasMore) {
      if (serverOrders.length >= MAX_HISTORY_ORDERS) throw new Error("Order history is too large to sync in one session.");
      const page = await sendJSON(fetcher, apiBaseUrl, token, `/api/orders?sync=1&take=${ORDER_PAGE_SIZE}&skip=${skip}`);
      if (!page.response.ok || !Array.isArray(page.body.orders)) throw new Error(String(page.body.error || "Order history sync failed."));
      serverOrders.push(...page.body.orders as ServerOrder[]);
      skip += page.body.orders.length;
      hasMore = Boolean(page.body.hasMore);
    }
    await saveShopSnapshot(auth, catalogResult.body.products as ProductRecord[], serverOrders);
  } catch (error) {
    snapshotError = error instanceof Error ? error.message : "Initial sync could not be completed.";
  }

  const data = await getShopData(auth.id).catch(() => ({ account: null, products: [], orders: [], outbox: [] } as ShopData));
  const queue = data.account?.initializedAt
    ? await syncQueuedOrders(auth.id, token, apiBaseUrl, fetcher)
    : { synced: 0, attention: 0, pending: 0 };
  const latest = await getShopData(auth.id).catch(() => data);
  return {
    reachable: true,
    role: "SHOP",
    shopId: auth.id,
    initialized: Boolean(latest.account?.initializedAt),
    lastSyncAt: latest.account?.lastSyncAt || null,
    queue,
    error: snapshotError,
  };
}
