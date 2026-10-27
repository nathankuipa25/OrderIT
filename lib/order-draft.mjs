const STORAGE_KEY = "orderit:draft:v2";
const LEGACY_SESSION_KEY = "orderit:draft";

function createKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validIntent(value) {
  return value &&
    Array.isArray(value.productIds) &&
    value.productIds.every((id) => typeof id === "string") &&
    typeof value.idempotencyKey === "string" &&
    value.idempotencyKey.length > 0;
}

export function readDraftIntent(storage, legacyStorage, keyFactory = createKey) {
  try {
    const saved = storage?.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (validIntent(parsed)) return parsed;
      if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) {
        const migrated = { productIds: parsed, idempotencyKey: keyFactory() };
        storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
    const legacy = legacyStorage?.getItem(LEGACY_SESSION_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed) && parsed.every((id) => typeof id === "string")) {
        const migrated = { productIds: parsed, idempotencyKey: keyFactory() };
        storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function writeDraftIntent(storage, productIds, legacyStorage, keyFactory = createKey) {
  const ids = [...productIds];
  const previous = readDraftIntent(storage, legacyStorage, keyFactory);
  const unchanged = previous &&
    previous.productIds.length === ids.length &&
    previous.productIds.every((id, index) => id === ids[index]);
  const intent = {
    productIds: ids,
    idempotencyKey: unchanged ? previous.idempotencyKey : keyFactory(),
  };
  storage?.setItem(STORAGE_KEY, JSON.stringify(intent));
  return intent;
}

export function removeDraftIntent(storage, legacyStorage) {
  storage?.removeItem(STORAGE_KEY);
  legacyStorage?.removeItem(LEGACY_SESSION_KEY);
}

export function buildOrderRequest(intent, productIds) {
  if (!validIntent(intent)) return null;
  const matches =
    intent.productIds.length === productIds.length &&
    intent.productIds.every((id, index) => id === productIds[index]);
  if (!matches) return null;
  return { productIds: [...productIds], idempotencyKey: intent.idempotencyKey };
}
