"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getDraft, setDraft, clearDraft } from "@/lib/orderDraft";
import OrderDocument from "@/components/OrderDocument";

type Product = { id: string; name: string };

export default function ReviewOrderPage() {
  const router = useRouter();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // preview/export state
  const docRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<"" | "image" | "pdf" | "share">("");
  const [toast, setToast] = useState("");

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

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  }

  async function renderPng(): Promise<Blob | null> {
    if (!docRef.current) return null;
    const { toBlob } = await import("html-to-image");
    return toBlob(docRef.current, { pixelRatio: 3, backgroundColor: "#ffffff" });
  }

  async function handleSaveImage() {
    if (items.length === 0) return;
    setBusy("image");
    try {
      const blob = await renderPng();
      if (!blob) throw new Error("no blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      a.download = `order-preview-${timestamp}.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("✓ Image saved");
    } catch {
      showToast("Something went wrong generating the image.");
    } finally {
      setBusy("");
    }
  }

  async function handleShare() {
    if (items.length === 0) return;
    setBusy("share");
    try {
      const blob = await renderPng();
      if (!blob) throw new Error("no blob");
      const file = new File(
        [blob],
        `order-preview-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`,
        { type: "image/png" }
      );
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `Order preview` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
        showToast("Sharing isn't supported here — image downloaded instead.");
      }
    } catch {
      // user cancelled share sheet, or share failed — no error needed
    } finally {
      setBusy("");
    }
  }

  async function handleGeneratePdf() {
    if (items.length === 0) return;
    setBusy("pdf");
    try {
      const blob = await renderPng();
      if (!blob) throw new Error("no blob");
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const { jsPDF } = await import("jspdf");
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
      });

      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 40;
      const usableWidth = pageWidth - margin * 2;
      const imgHeight = (img.height / img.width) * usableWidth;

      pdf.addImage(dataUrl, "PNG", margin, margin, usableWidth, imgHeight);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      pdf.save(`order-preview-${timestamp}.pdf`);
      showToast("✓ PDF generated");
    } catch {
      showToast("Something went wrong generating the PDF.");
    } finally {
      setBusy("");
    }
  }

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
            <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-subtle p-6 mb-4 bg-white">
              <div className="text-sm font-semibold mb-3">Preview</div>
              <div className="flex justify-center overflow-x-auto">
                <div className="scale-[0.78] origin-top -mb-16 sm:scale-100 sm:mb-0">
                  <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-subtle">
                    <OrderDocument
                      ref={docRef}
                      orderNumber={0}
                      createdAt={new Date().toISOString()}
                      items={items.map((p) => ({ id: p.id, product: { name: p.name } }))}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 mt-4">
                <button onClick={handleSaveImage} disabled={busy !== ""} className="btn-primary w-full">
                  {busy === "image" ? "Preparing preview..." : "Save Image"}
                </button>
                <button onClick={handleShare} disabled={busy !== ""} className="btn-secondary w-full">
                  {busy === "share" ? "Preparing..." : "Share"}
                </button>
                <button onClick={handleGeneratePdf} disabled={busy !== ""} className="btn-secondary w-full">
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
