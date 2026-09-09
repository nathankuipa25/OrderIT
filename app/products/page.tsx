"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";
import Toast from "@/components/Toast";

type Product = { id: string; name: string; active: boolean };

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function showToast(message: string, variant: "success" | "error" = "success") {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 2600);
  }

  // Debounce search input so we're not hitting the API on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const skipRef = useRef(0);
  const loadingRef = useRef(false);

  const fetchPage = useCallback(
    async (opts: { reset: boolean }) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (opts.reset) {
        setInitialLoading(true);
        skipRef.current = 0;
      } else {
        setLoadingMore(true);
      }
      setError("");

      try {
        const params = new URLSearchParams({
          take: String(PAGE_SIZE),
          skip: String(opts.reset ? 0 : skipRef.current),
        });
        if (debouncedQuery) params.set("q", debouncedQuery);

        const res = await fetch(`/api/products?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load");

        const newProducts: Product[] = data.products ?? [];
        setProducts((prev) => (opts.reset ? newProducts : [...prev, ...newProducts]));
        setHasMore(Boolean(data.hasMore));
        skipRef.current = (opts.reset ? 0 : skipRef.current) + newProducts.length;
      } catch {
        setError("Something went wrong loading products.");
      } finally {
        loadingRef.current = false;
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQuery]
  );

  // Reload from scratch whenever the (debounced) search term changes.
  useEffect(() => {
    fetchPage({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  // Infinite scroll: observe a sentinel at the bottom of the list.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
          fetchPage({ reset: false });
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, fetchPage]);

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkSetActive(active: boolean) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch("/api/products/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      showToast(
        `✓ ${data.updated} product${data.updated === 1 ? "" : "s"} ${
          active ? "activated" : "deactivated"
        }`
      );
      setSelectMode(false);
      setSelectedIds(new Set());
      fetchPage({ reset: true });
    } catch {
      showToast("Something went wrong. Products weren't updated.", "error");
    } finally {
      setBulkBusy(false);
    }
  }

  function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      // Accept one name per line, optionally with a "name" CSV header/column —
      // just take the first comma-separated field on each line.
      const names = text
        .split(/\r?\n/)
        .map((line) => line.split(",")[0]?.trim())
        .filter((name) => name && name.toLowerCase() !== "name");

      if (names.length === 0) {
        showToast("No product names found in that file.", "error");
        return;
      }

      const res = await fetch("/api/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");

      showToast(
        `✓ Imported ${data.created} product${data.created === 1 ? "" : "s"}` +
          (data.skipped ? ` (${data.skipped} already existed)` : "")
      );
      fetchPage({ reset: true });
    } catch {
      showToast("Something went wrong importing that file.", "error");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className={selectMode && selectedIds.size > 0 ? "pb-28" : "pb-10"}>
      <header className="flex items-center justify-between py-2 mb-5 gap-2">
        <div className="text-2xl font-bold">
          {selectMode ? `${selectedIds.size} selected` : "Products"}
        </div>
        <div className="flex items-center gap-4">
          {selectMode ? (
            <button
              onClick={toggleSelectMode}
              className="text-navy font-semibold text-sm"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={handleImportClick}
                disabled={importing}
                className="text-navy font-semibold text-sm"
              >
                {importing ? "Importing..." : "Import"}
              </button>
              <button
                onClick={toggleSelectMode}
                className="text-navy font-semibold text-sm"
              >
                Select
              </button>
              <Link
                href="/products/new"
                className="text-navy font-semibold text-sm flex items-center gap-1"
              >
                <span className="text-lg leading-none">+</span> Add
              </Link>
            </>
          )}
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        onChange={handleFileSelected}
        className="hidden"
      />

      {!selectMode && (
        <div className="relative mb-5">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            className="absolute left-3.5 top-1/2 -translate-y-1/2"
          >
            <circle cx="11" cy="11" r="7" stroke="#9ca3af" strokeWidth="1.8" />
            <path
              d="M21 21l-4.3-4.3"
              stroke="#9ca3af"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products..."
            className="w-full h-12 pl-11 pr-4 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-accent"
          />
        </div>
      )}

      {error && <div className="text-sm text-danger mb-4">{error}</div>}

      {initialLoading ? (
        <div className="flex flex-col gap-2.5">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : products.length === 0 ? (
        debouncedQuery ? (
          <div className="text-center py-10">
            <div className="font-semibold text-ink">No products found</div>
            <div className="text-sm text-muted mt-1">Try a different search.</div>
          </div>
        ) : (
          <EmptyState
            title="No products yet"
            description="Add products to create your shop catalog."
            action={
              <Link href="/products/new" className="btn-primary w-full">
                Add Product
              </Link>
            }
          />
        )
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            {products.map((p) => {
              const row = (
                <>
                  <div className="flex items-center gap-3 min-w-0">
                    {selectMode && (
                      <span
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                          selectedIds.has(p.id)
                            ? "bg-accent border-accent"
                            : "border-gray-300"
                        }`}
                      >
                        {selectedIds.has(p.id) && (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                            <path
                              d="M5 13l4 4L19 7"
                              stroke="white"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-ink truncate">{p.name}</div>
                      <div
                        className={`text-xs mt-0.5 font-medium ${
                          p.active ? "text-success" : "text-muted"
                        }`}
                      >
                        {p.active ? "Active" : "Inactive"}
                      </div>
                    </div>
                  </div>
                  {!selectMode && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="shrink-0">
                      <path
                        d="M9 6l6 6-6 6"
                        stroke="#9ca3af"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </>
              );

              return selectMode ? (
                <button
                  key={p.id}
                  onClick={() => toggleSelected(p.id)}
                  className="card flex items-center justify-between px-4 py-3.5 min-h-[44px] text-left"
                >
                  {row}
                </button>
              ) : (
                <Link
                  key={p.id}
                  href={`/products/${p.id}/edit`}
                  className="card flex items-center justify-between px-4 py-3.5 min-h-[44px]"
                >
                  {row}
                </Link>
              );
            })}
          </div>

          {/* Sentinel: crossing into view triggers the next page load */}
          {hasMore && (
            <div ref={sentinelRef} className="flex flex-col gap-2.5 mt-2.5">
              {loadingMore && (
                <>
                  <Skeleton className="h-16" />
                  <Skeleton className="h-16" />
                </>
              )}
            </div>
          )}
        </>
      )}

      {selectMode && selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 md:pl-56">
          <div className="page-container px-4 py-3 flex gap-2.5">
            <button
              onClick={() => handleBulkSetActive(true)}
              disabled={bulkBusy}
              className="btn-secondary flex-1"
            >
              {bulkBusy ? "Updating..." : "Activate"}
            </button>
            <button
              onClick={() => handleBulkSetActive(false)}
              disabled={bulkBusy}
              className="btn-primary flex-1"
            >
              {bulkBusy ? "Updating..." : "Deactivate"}
            </button>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} variant={toast.variant} />}
    </div>
  );
}
