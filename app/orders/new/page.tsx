"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProductRow from "@/components/ProductRow";
import { getDraft, setDraft } from "@/lib/orderDraft";

type Product = { id: string; name: string; active: boolean };

export default function CreateOrderPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelected(new Set(getDraft()));
    fetch("/api/products?active=true")
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => setError("Something went wrong loading products."));
  }, []);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setDraft(Array.from(next));
      return next;
    });
  }

  function goToReview() {
    if (selected.size === 0) return;
    setDraft(Array.from(selected));
    router.push("/orders/new/review");
  }

  return (
    <div className="pb-24">
      <header className="flex items-center gap-3 py-2 mb-4">
        <Link
          href="/"
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
        <div className="text-xl font-bold">Create Order</div>
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

      {error && (
        <div className="text-sm text-danger mb-4">{error}</div>
      )}

      {products === null ? (
        <div className="flex flex-col gap-2.5">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="h-[52px] rounded-xl bg-gray-100 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <div className="font-semibold text-ink">No products found</div>
          <div className="text-sm text-muted mt-1">
            Try another product name.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((p) => (
            <ProductRow
              key={p.id}
              name={p.name}
              selected={selected.has(p.id)}
              onToggle={() => toggle(p.id)}
            />
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 md:pl-56">
          <div className="page-container px-4 py-3">
            <div className="text-sm text-muted mb-2 text-center">
              {selected.size} product{selected.size === 1 ? "" : "s"} selected
            </div>
            <button onClick={goToReview} className="btn-primary w-full">
              Review Order
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
