"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  buildOrderRequest,
  getDraft,
  getDraftIntent,
  setDraft,
  clearDraft,
} from "@/lib/orderDraft";
import OrderDocument from "@/components/OrderDocument";
import Skeleton from "@/components/Skeleton";
import Toast from "@/components/Toast";
import SortableProductRow from "@/components/SortableProductRow";
import { useOrderExport } from "@/lib/useOrderExport";
import { getLoadState } from "@/lib/load-state.mjs";
import { moveItem } from "@/lib/order-reorder.mjs";

type Product = { id: string; name: string };

export default function ReviewOrderPage() {
  const router = useRouter();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");
  const [shopName, setShopName] = useState<string | undefined>(undefined);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setShopName(data?.user?.name))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadSelection() {
      setLoading(true);
      setError("");
      const ids = getDraft();
      if (ids.length === 0) {
        router.replace("/orders/new");
        return;
      }
      try {
        const response = await fetch("/api/products");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load products.");
        const all: Product[] = data.products ?? [];
        const map = new Map(all.map((p) => [p.id, p]));
        const ordered = ids.map((id) => map.get(id)).filter(Boolean) as Product[];
        if (!cancelled) setItems(ordered);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Something went wrong loading your selection."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadSelection();
    return () => {
      cancelled = true;
    };
  }, [router, retryCount]);

  function removeItem(id: string) {
    setItems((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setDraft(next.map((p) => p.id));
      if (next.length === 0) router.replace("/orders/new");
      return next;
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function moveProduct(id: string, offset: -1 | 1) {
    setItems((prev) => {
      const fromIndex = prev.findIndex((p) => p.id === id);
      const toIndex = fromIndex + offset;
      const next = moveItem(prev, fromIndex, toIndex);
      if (next === prev) return prev;
      setDraft(next.map((p) => p.id));
      setReorderAnnouncement(
        `${next[toIndex].name} moved to position ${toIndex + 1} of ${next.length}.`
      );
      return next;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setItems((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      const next = moveItem(prev, oldIndex, newIndex);
      setDraft(next.map((p) => p.id));
      setReorderAnnouncement(
        `${next[newIndex].name} moved to position ${newIndex + 1} of ${next.length}.`
      );
      return next;
    });
  }

  async function generateOrder() {
    setSubmitting(true);
    setError("");
    try {
      const productIds = items.map((p) => p.id);
      const savedIntent = getDraftIntent();
      if (
        !savedIntent ||
        savedIntent.productIds.length !== productIds.length ||
        savedIntent.productIds.some((id, index) => id !== productIds[index])
      ) {
        setDraft(productIds);
      }
      const requestBody = buildOrderRequest(getDraftIntent(), productIds);
      if (!requestBody) throw new Error("Your order draft could not be saved. Please try again.");
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Your order wasn't created.");
        setSubmitting(false);
        return;
      }
      clearDraft();
      router.push(`/orders/${data.order.id}`);
    } catch {
      setError("Something went wrong. Your order wasn't created.");
      setSubmitting(false);
    }
  }

  const previewItems = items.map((p) => ({ id: p.id, product: { name: p.name } }));
  const { pages, hiddenPages, saveImages, share, generatePdf, busy, toast } =
    useOrderExport({
      orderNumber: 0,
      createdAt: new Date().toISOString(),
      items: previewItems,
      title: shopName,
      filenameBase: "order-preview",
    });
  const loadState = getLoadState({
    loading,
    error: Boolean(error && items.length === 0),
    itemCount: items.length,
  });

  return (
    <div className="pb-40">
      <div className="sr-only" role="status" aria-live="polite">
        {reorderAnnouncement}
      </div>
      <header className="flex items-center gap-3 py-2 mb-4">
        <Link
          href="/orders/new"
          aria-label="Back"
          className="w-10 h-10 -ml-2 flex items-center justify-center"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M15 6l-6 6 6 6"
              stroke="#1c1f26"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className="text-xl font-bold">Review Order</div>
      </header>

      {loadState === "loading" ? (
        <div role="status" aria-busy="true" aria-label="Loading your order selection" className="flex flex-col gap-2.5">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : loadState === "error" ? (
        <div role="alert" className="card p-5 text-center">
          <div className="font-semibold text-ink">Your selection couldn&rsquo;t load</div>
          <p className="text-sm text-muted mt-1">{error}</p>
          <button
            type="button"
            onClick={() => setRetryCount((count) => count + 1)}
            className="btn-primary w-full mt-4"
          >
            Retry loading your selection
          </button>
        </div>
      ) : loadState === "empty" ? (
        <div className="card p-5 text-center">
          <div className="font-semibold text-ink">No selected products found</div>
          <p className="text-sm text-muted mt-1">Choose products again to continue this order.</p>
          <Link href="/orders/new" className="btn-primary w-full mt-4">
            Choose Products
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="card px-5 py-5 mb-4">
              <div className="text-xs font-bold tracking-wider text-muted uppercase mb-1">
                Order
              </div>
              <div className="text-sm text-muted mb-4">
                {items.length} product{items.length === 1 ? "" : "s"} · drag to reorder or use Move up and Move down
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                accessibility={{
                  screenReaderInstructions: {
                    draggable: "To reorder by keyboard, focus a reorder handle, press Space or Enter, use the arrow keys, then press Space or Enter to drop.",
                  },
                }}
              >
                <SortableContext
                  items={items.map((p) => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col divide-y divide-gray-100">
                    {items.map((p, idx) => (
                      <SortableProductRow
                        key={p.id}
                        id={p.id}
                        index={idx}
                        total={items.length}
                        name={p.name}
                        onRemove={() => removeItem(p.id)}
                        onMoveUp={() => moveProduct(p.id, -1)}
                        onMoveDown={() => moveProduct(p.id, 1)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {error && <div role="alert" className="text-sm text-danger mt-4">{error}</div>}

            <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-30 bg-white border-t border-gray-100 md:bottom-0 md:pl-56">
              <div className="page-container px-4 py-3 flex flex-col gap-2">
                <button
                  onClick={generateOrder}
                  disabled={submitting || items.length === 0}
                  className="btn-primary w-full"
                >
                  {submitting ? "Generating..." : "Generate Order"}
                </button>
                <Link href="/orders/new" className="btn-secondary w-full">
                  Edit Products
                </Link>
              </div>
            </div>
          </div>

          {/* Preview + Export column */}
          <div className="">
            {hiddenPages}

            <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-subtle p-6 mb-4 bg-white">
              <div className="text-sm font-semibold mb-3">Preview</div>

              <div className="flex flex-col items-center gap-4">
                {pages.map((pageItems, i) => {
                  const startIndex = pages
                    .slice(0, i)
                    .reduce((sum, p) => sum + p.length, 0);
                  return (
                    <div key={i} className="w-full flex flex-col items-center">
                      {pages.length > 1 && (
                        <div className="text-xs font-semibold text-muted mb-2">
                          Page {i + 1} of {pages.length}
                        </div>
                      )}
                      <div className="w-full flex justify-center">
                        <div className="w-full max-w-[480px] rounded-2xl overflow-hidden border border-gray-100 shadow-subtle">
                          <OrderDocument
                            orderNumber={0}
                            createdAt={new Date().toISOString()}
                            items={pageItems}
                            title={shopName}
                            startIndex={startIndex}
                            totalCount={items.length}
                            pageNumber={i + 1}
                            totalPages={pages.length}
                            showFooter={i === pages.length - 1}
                            fluid
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-col gap-2.5 mt-4">
                <button onClick={saveImages} disabled={busy !== ""} className="btn-primary w-full">
                  {busy === "image"
                    ? "Preparing preview..."
                    : pages.length > 1
                    ? `Save ${pages.length} Images`
                    : "Save Image"}
                </button>
                <button onClick={share} disabled={busy !== ""} className="btn-secondary w-full">
                  {busy === "share" ? "Preparing..." : "Share"}
                </button>
                <button onClick={generatePdf} disabled={busy !== ""} className="btn-secondary w-full">
                  {busy === "pdf" ? "Generating..." : "Generate PDF"}
                </button>
              </div>
            </div>

            {toast && <Toast message={toast.message} variant={toast.variant} />}
          </div>
        </div>
      )}
    </div>
  );
}
