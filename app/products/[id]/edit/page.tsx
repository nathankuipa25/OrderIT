"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Product = { id: string; name: string; active: boolean };

export default function EditProductPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();

  const [product, setProduct] = useState<Product | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/products/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setProduct(data.product);
          setName(data.product.name);
        }
      })
      .catch(() => setError("Something went wrong loading this product."));
  }, [id]);

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
      if (res.ok) setProduct(data.product);
    } finally {
      setToggling(false);
    }
  }

  if (error && !product) {
    return (
      <div className="py-16 text-center">
        <div className="font-semibold text-ink mb-1">Something went wrong</div>
        <div className="text-sm text-muted mb-5">{error}</div>
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

      {!product ? (
        <div className="h-40 rounded-xl bg-gray-100 animate-pulse" />
      ) : (
        <>
          <form onSubmit={handleSave} className="flex flex-col gap-4 mb-8">
            <div>
              <label className="block text-sm font-medium text-muted mb-2">
                Product name
              </label>
              <input
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
        </>
      )}
    </div>
  );
}
