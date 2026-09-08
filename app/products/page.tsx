"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";

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

  return (
    <div className="pb-10">
      <header className="flex items-center justify-between py-2 mb-5">
        <div className="text-2xl font-bold">Products</div>
        <Link
          href="/products/new"
          className="text-navy font-semibold text-sm flex items-center gap-1"
        >
          <span className="text-lg leading-none">+</span> Add
        </Link>
      </header>

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
            {products.map((p) => (
              <Link
                key={p.id}
                href={`/products/${p.id}/edit`}
                className="card flex items-center justify-between px-4 py-3.5 min-h-[44px]"
              >
                <div>
                  <div className="font-medium text-ink">{p.name}</div>
                  <div
                    className={`text-xs mt-0.5 font-medium ${
                      p.active ? "text-success" : "text-muted"
                    }`}
                  >
                    {p.active ? "Active" : "Inactive"}
                  </div>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 6l6 6-6 6"
                    stroke="#9ca3af"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Link>
            ))}
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
    </div>
  );
}
