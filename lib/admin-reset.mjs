import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { RESET_CONFIRMATION } from "./admin-reset-constants.mjs";

export { RESET_CONFIRMATION };
export const RESET_BACKUP_FORMAT = "orderit-reset-backup";
export const RESET_BACKUP_TTL_MS = 15 * 60 * 1000;

export function getResetAvailability({ nodeEnv, enabledFlag, secretConfigured }) {
  if (nodeEnv === "production" && enabledFlag !== "true") {
    return {
      available: false,
      reason:
        "Production resets are disabled. Set ORDERIT_RESET_ENABLED=true only for an explicitly approved reset window.",
    };
  }
  if (!secretConfigured) {
    return {
      available: false,
      reason: "JWT_SECRET must be configured to protect backup authorization.",
    };
  }
  return { available: true };
}

function canonicalize(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function getSnapshotDigest(snapshot) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(snapshot)))
    .digest("hex");
}

function signatureFor(encodedPayload, secret) {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

export function createResetBackup(snapshot, secret, now = Date.now()) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("A signing secret is required to create a reset backup.");
  }
  const digest = getSnapshotDigest(snapshot);
  const payload = {
    version: 1,
    createdAt: now,
    snapshotSha256: digest,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encodedPayload}.${signatureFor(encodedPayload, secret).toString("base64url")}`;
  const orderItems = snapshot.orders.reduce(
    (total, order) => total + (Array.isArray(order.items) ? order.items.length : 0),
    0
  );

  return {
    token,
    backup: {
      format: RESET_BACKUP_FORMAT,
      version: 1,
      createdAt: new Date(now).toISOString(),
      scope: {
        removed: ["products", "orders"],
        orderItems: "Items belonging to deleted orders are removed with their parent orders.",
        preserved: ["shop accounts", "admin accounts", "all user records"],
      },
      counts: {
        products: Array.isArray(snapshot.products) ? snapshot.products.length : 0,
        orders: Array.isArray(snapshot.orders) ? snapshot.orders.length : 0,
        orderItems,
      },
      snapshotSha256: digest,
      data: snapshot,
    },
  };
}

export function verifyResetBackup(token, secret, currentSnapshot, now = Date.now()) {
  if (typeof secret !== "string" || secret.length === 0 || typeof token !== "string") {
    return { ok: false, status: 400, error: "Create a fresh backup before resetting." };
  }
  if (token.length > 2048) {
    return { ok: false, status: 400, error: "The backup authorization is invalid." };
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return { ok: false, status: 400, error: "The backup authorization is invalid." };
  }

  const [encodedPayload, encodedSignature] = parts;
  let payload;
  let receivedSignature;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    receivedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return { ok: false, status: 400, error: "The backup authorization is invalid." };
  }

  const expectedSignature = signatureFor(encodedPayload, secret);
  if (
    receivedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    return { ok: false, status: 400, error: "The backup authorization is invalid." };
  }
  if (
    payload?.version !== 1 ||
    !Number.isSafeInteger(payload.createdAt) ||
    typeof payload.snapshotSha256 !== "string"
  ) {
    return { ok: false, status: 400, error: "The backup authorization is invalid." };
  }
  if (payload.createdAt > now + 60_000 || now - payload.createdAt > RESET_BACKUP_TTL_MS) {
    return { ok: false, status: 400, error: "That backup authorization expired. Create a fresh backup." };
  }
  if (payload.snapshotSha256 !== getSnapshotDigest(currentSnapshot)) {
    return {
      ok: false,
      status: 409,
      error: "Products or orders changed after the backup. Create a fresh backup before resetting.",
    };
  }
  return { ok: true };
}

export function validateResetConfirmation(value) {
  return value === RESET_CONFIRMATION;
}

export function validateBackupAcknowledgement(value) {
  return value === true;
}

/**
 * Removes only orders and products. OrderItem rows are removed by the schema's
 * onDelete: Cascade relation to Order; users and all account rows are untouched.
 */
export async function executeScopedReset(tx) {
  const deletedOrders = await tx.order.deleteMany({});
  const deletedProducts = await tx.product.deleteMany({});
  return {
    orders: deletedOrders.count,
    products: deletedProducts.count,
  };
}
