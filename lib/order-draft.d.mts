export type OrderDraftIntent = {
  productIds: string[];
  idempotencyKey: string;
};
export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function readDraftIntent(
  storage: DraftStorage | null | undefined,
  legacyStorage?: DraftStorage | null,
  keyFactory?: () => string
): OrderDraftIntent | null;
export function writeDraftIntent(
  storage: DraftStorage | null | undefined,
  productIds: string[],
  legacyStorage?: DraftStorage | null,
  keyFactory?: () => string
): OrderDraftIntent;
export function removeDraftIntent(
  storage: DraftStorage | null | undefined,
  legacyStorage?: DraftStorage | null
): void;
export function buildOrderRequest(
  intent: OrderDraftIntent | null | undefined,
  productIds: string[]
): { productIds: string[]; idempotencyKey: string } | null;
