"use client";

import {
  buildOrderRequest,
  readDraftIntent,
  removeDraftIntent,
  writeDraftIntent,
  type OrderDraftIntent,
} from "./order-draft.mjs";

export { buildOrderRequest };

export function getDraft(): string[] {
  if (typeof window === "undefined") return [];
  return getDraftIntent()?.productIds ?? [];
}

export function getDraftIntent(): OrderDraftIntent | null {
  if (typeof window === "undefined") return null;
  return readDraftIntent(window.localStorage, window.sessionStorage);
}

export function setDraft(ids: string[]) {
  if (typeof window === "undefined") return;
  writeDraftIntent(window.localStorage, ids, window.sessionStorage);
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  removeDraftIntent(window.localStorage, window.sessionStorage);
}
