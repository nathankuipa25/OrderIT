export type AccessDecision =
  | { allowed: true; status: 200 }
  | { allowed: false; status: 401 | 403; error: string };
export function evaluateAdminAccess(
  session: { role?: string } | null | undefined
): AccessDecision;

export type ProductIdValidation =
  | { ok: true; productIds: string[] }
  | { ok: false; status: 400; error: string };
export function validateProductIdList(value: unknown): ProductIdValidation;

export type ProductAvailability =
  | { ok: true }
  | { ok: false; status: 400 | 409; error: string };
export function validateProductAvailability(
  productIds: string[],
  products: Array<{ id: string; active: boolean }>
): ProductAvailability;

export type IdempotencyKeyValidation =
  | { ok: true; key: string | undefined }
  | { ok: false; error: string };
export function parseIdempotencyKey(body: unknown): IdempotencyKeyValidation;

export type ExistingOrder = {
  userId: string | null;
  items?: Array<{ productId: string }>;
  [key: string]: unknown;
};
export type IdempotencyDecision =
  | { kind: "new" }
  | { kind: "replay"; order: ExistingOrder }
  | { kind: "conflict"; message: string };
export function resolveIdempotencyReplay(
  existing: ExistingOrder | null | undefined,
  userId: string,
  requestedProductIds: string[]
): IdempotencyDecision;

export type ProductDeletionDecision =
  | { allowed: true; status: 200; usageCount: 0 }
  | { allowed: false; status: 404; error: string }
  | { allowed: false; status: 409; usageCount: number; error: string };
export function evaluateProductDeletion(
  product: { _count?: { items?: number } } | null | undefined
): ProductDeletionDecision;

export interface OrderNumberTransaction {
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  order: {
    findFirst(args: {
      orderBy: { orderNumber: "desc" };
      select: { orderNumber: true };
    }): Promise<{ orderNumber: number } | null>;
  };
}
export function allocateNextOrderNumber(
  tx: OrderNumberTransaction
): Promise<number>;
