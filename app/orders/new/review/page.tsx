"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getDraft, setDraft, clearDraft } from "@/lib/orderDraft";
import OrderDocument from "@/components/OrderDocument";
import { useOrderExport } from "@/lib/useOrderExport";

type Product = { id: string; name: string };

export default function ReviewOrderPage() {
  const router = useRouter();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const ids = getDraft();
    if (ids.length === 0) {
      router.replace("/orders/new");
      return;
    }
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => {
        const all: Product[] = data.products ?? [];
        const map = new Map(all.map((p) => [p.id, p]));
        const ordered = ids.map((id) => map.get(id)).filter(Boolean) as Product[];
        setItems(ordered);
        setLoading(false);
      })
      .catch(() => {
        setError("Something went wrong loading your selection.");
        setLoading(false);
      });
  }, [router]);

  function removeItem(id: string) {
    setItems((prev) => {
      const next = prev.filter((p) => p.id !== id);
      setDraft(next.map((p) => p.id));
      if (next.length === 0) router.replace("/orders/new");
      return next;
    });
  }

  async function generateOrder() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productIds: items.map((p) => p.id) }),
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
      filenameBase: "order-preview",
    });

  return (
    <div className="pb-28">
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

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="card px-5 py-5 mb-4">
              <div className="text-xs font-bold tracking-wider text-muted uppercase mb-1">
                Order
              </div>
              <div className="text-sm text-muted mb-4">
                {items.length} product{items.length === 1 ? "" : "s"}
              </div>
              <div className="flex flex-col divide-y divide-gray-100">
                {items.map((p, idx) => (
                  <div key={p.id} className="flex items-center justify-between py-3">
                    <span className="text-[15px]">
                      <span className="text-muted mr-2">{idx + 1}.</span>
                      {p.name}
                    </span>
                    <button
                      onClick={() => removeItem(p.id)}
                      aria-label={`Remove ${p.name}`}
                      className="w-8 h-8 flex items-center justify-center text-muted text-lg"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {error && <div className="text-sm text-danger mt-4">{error}</div>}

            <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 md:pl-56">
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
                      <div className="overflow-x-auto max-w-full">
                        <div className="scale-[0.78] origin-top -mb-16 sm:scale-100 sm:mb-0">
                          <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-subtle">
                            <OrderDocument
                              orderNumber={0}
                              createdAt={new Date().toISOString()}
                              items={pageItems}
                              startIndex={startIndex}
                              totalCount={items.length}
                              pageNumber={i + 1}
                              totalPages={pages.length}
                              showFooter={i === pages.length - 1}
                            />
                          </div>
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

            {toast && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-navy text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-subtle z-50">
                {toast}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
