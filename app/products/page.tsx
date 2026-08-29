"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import EmptyState from "@/components/EmptyState";

type Product = { id: string; name: string; active: boolean };

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  function load() {
    fetch("/api/products")
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => setError("Something went wrong loading products."));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

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

      {products === null ? (
        <div className="flex flex-col gap-2.5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Add products to create your shop catalog."
          action={
            <Link href="/products/new" className="btn-primary w-full">
              Add Product
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <div className="text-center py-10">
          <div className="font-semibold text-ink">No products found</div>
          <div className="text-sm text-muted mt-1">Try a different search.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.map((p) => (
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
      )}
    </div>
  );
}
