"use client";

// Simple in-memory + sessionStorage-backed draft of the order being created.
// Survives client-side navigation between /orders/new and /orders/new/review.

const KEY = "orderit:draft";

export function getDraft(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setDraft(ids: string[]) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(KEY, JSON.stringify(ids));
}

export function clearDraft() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(KEY);
}
