"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Skeleton from "@/components/Skeleton";
import { getLoadState } from "@/lib/load-state.mjs";

type Product = { id: string; name: string; active: boolean; usageCount: number };

export default function EditProductPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function loadProduct() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/products/${id}`);
        const data = await response.json();
        if (!response.ok || data.error || !data.product) {
          throw new Error(data.error || "Could not load this product.");
        }
        if (!cancelled) {
          setProduct(data.product);
          setName(data.product.name);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Something went wrong loading this product."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadProduct();
    return () => {
      cancelled = true;
    };
  }, [id, retryCount]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Product name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setSaving(false);
        return;
      }
      router.push("/products");
    } catch {
      setError("Something went wrong. Your changes weren't saved.");
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!product) return;
    setToggling(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !product.active }),
      });
      const data = await res.json();
      if (res.ok) setProduct({ ...data.product, usageCount: product.usageCount });
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    if (!product || product.usageCount > 0) return;
    if (!window.confirm(`Permanently delete “${product.name}”? This cannot be undone.`)) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "The product wasn't deleted.");
      router.push("/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The product wasn't deleted.");
      setDeleting(false);
    }
  }

  const loadState = getLoadState({
    loading,
    error: Boolean(error && !product),
    itemCount: product ? 1 : 0,
  });

  if (loadState === "error") {
    return (
      <div role="alert" className="py-16 text-center">
        <div className="font-semibold text-ink mb-1">Product couldn&rsquo;t load</div>
        <div className="text-sm text-muted mb-5">{error}</div>
        <button
          type="button"
          onClick={() => setRetryCount((count) => count + 1)}
          className="btn-primary w-full mb-3"
        >
          Retry loading product
        </button>
        <Link href="/products" className="btn-secondary inline-flex px-6">
          Back to Products
        </Link>
      </div>
    );
  }

  return (
    <div>
      <header className="flex items-center gap-3 py-2 mb-6">
        <Link
          href="/products"
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
        <div className="text-xl font-bold">Edit Product</div>
      </header>

      {loadState === "loading" ? (
        <div role="status" aria-busy="true" aria-label="Loading product details">
          <Skeleton className="h-40" />
        </div>
      ) : loadState === "empty" ? (
        <div className="card p-5 text-center">
          <div className="font-semibold text-ink">Product not found</div>
          <Link href="/products" className="btn-secondary w-full mt-4">
            Back to Products
          </Link>
        </div>
      ) : product ? (
        <>
          <form onSubmit={handleSave} className="flex flex-col gap-4 mb-8">
            <div>
              <label htmlFor="product-name" className="block text-sm font-medium text-muted mb-2">
                Product name
              </label>
              <input
                id="product-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError("");
                }}
                className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white text-[15px] outline-none focus:border-accent"
              />
              {error && <div className="text-sm text-danger mt-2">{error}</div>}
            </div>

            <div>
              <div className="text-sm font-medium text-muted mb-2">Status</div>
              <div className="flex items-center gap-2 text-[15px] font-medium">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    product.active ? "bg-success" : "bg-gray-400"
                  }`}
                />
                {product.active ? "Active" : "Inactive"}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="btn-primary w-full mt-2"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </form>

          <div className="border-t border-gray-100 pt-5">
            <button
              onClick={handleToggleActive}
              disabled={toggling}
              className="w-full h-12 rounded-xl border border-danger text-danger font-semibold disabled:opacity-50"
            >
              {toggling
                ? "Updating..."
                : product.active
                ? "Deactivate Product"
                : "Activate Product"}
            </button>
            <p className="text-xs text-muted mt-3 text-center px-4">
              Deactivated products won&rsquo;t appear in new orders, but stay
              visible in past orders.
            </p>
          </div>
          <div className="border-t border-gray-100 pt-5 mt-5">
            <button
              onClick={handleDelete}
              disabled={deleting || product.usageCount > 0}
              className="w-full h-12 rounded-xl border border-gray-300 text-ink font-semibold disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Permanently Delete Product"}
            </button>
            <p className="text-xs text-muted mt-3 text-center px-4">
              {product.usageCount > 0
                ? `Used in ${product.usageCount} order${product.usageCount === 1 ? "" : "s"}; deactivate it to preserve order history.`
                : "Only products never used in an order can be deleted."}
            </p>
            {error && product && (
              <p role="alert" className="text-sm text-danger mt-3 text-center">
                {error}
              </p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
