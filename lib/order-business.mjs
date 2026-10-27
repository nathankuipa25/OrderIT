export function evaluateAdminAccess(session) {
  if (!session) return { allowed: false, status: 401, error: "Please log in." };
  if (session.role !== "ADMIN") return { allowed: false, status: 403, error: "Admins only." };
  return { allowed: true, status: 200 };
}

export function validateProductIdList(value) {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, status: 400, error: "Select at least one product." };
  }
  if (
    value.some((id) => typeof id !== "string" || !id.trim()) ||
    new Set(value).size !== value.length
  ) {
    return {
      ok: false,
      status: 400,
      error: "The product selection contains invalid or repeated items.",
    };
  }
  return { ok: true, productIds: [...value] };
}

export function validateProductAvailability(productIds, products) {
  const byId = new Map(products.map((product) => [product.id, product]));
  if (productIds.some((id) => !byId.has(id))) {
    return {
      ok: false,
      status: 400,
      error: "One or more selected products are invalid.",
    };
  }
  if (productIds.some((id) => !byId.get(id).active)) {
    return {
      ok: false,
      status: 409,
      error: "One or more selected products are no longer active. Review your selection.",
    };
  }
  return { ok: true };
}

export function parseIdempotencyKey(body) {
  const supplied =
    body !== null &&
    typeof body === "object" &&
    Object.prototype.hasOwnProperty.call(body, "idempotencyKey");
  if (!supplied) return { ok: true, key: undefined };
  if (typeof body.idempotencyKey !== "string") {
    return { ok: false, error: "The order retry key must be a string." };
  }
  const key = body.idempotencyKey.trim();
  if (!key || key.length > 128) {
    return { ok: false, error: "The order retry key is invalid." };
  }
  return { ok: true, key };
}

export function resolveIdempotencyReplay(existing, userId, requestedProductIds) {
  if (!existing) return { kind: "new" };
  if (existing.userId !== userId) {
    return {
      kind: "conflict",
      message: "This retry key belongs to another account.",
    };
  }
  const storedIds = (existing.items ?? []).map((item) => item.productId);
  const matches =
    storedIds.length === requestedProductIds.length &&
    storedIds.every((productId, index) => productId === requestedProductIds[index]);
  if (!matches) {
    return {
      kind: "conflict",
      message: "This retry key was already used for a different product selection or order. Start a new order.",
    };
  }
  return { kind: "replay", order: existing };
}

export function evaluateProductDeletion(product) {
  if (!product) return { allowed: false, status: 404, error: "Product not found." };
  const usageCount = product._count?.items ?? 0;
  if (usageCount > 0) {
    return {
      allowed: false,
      status: 409,
      usageCount,
      error: "This product is used in order history and cannot be deleted. Deactivate it instead.",
    };
  }
  return { allowed: true, status: 200, usageCount: 0 };
}

/** Acquire the PostgreSQL transaction-scoped lock, then read the next number.
 * The caller must execute this inside the same transaction that creates the order.
 */
export async function allocateNextOrderNumber(tx) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(5194820, 1) IS NULL AS lock_acquired`;
  const last = await tx.order.findFirst({
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  return (last?.orderNumber ?? 0) + 1;
}
