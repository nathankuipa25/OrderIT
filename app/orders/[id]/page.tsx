"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import OrderDocument from "@/components/OrderDocument";

type Item = { id: string; product: { name: string } };
type OrderData = {
  id: string;
  orderNumber: number;
  createdAt: string;
  items: Item[];
};

export default function OrderDetailsPage() {
  const params = useParams();
  const id = params?.id as string;
  const docRef = useRef<HTMLDivElement>(null);

  const [order, setOrder] = useState<OrderData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"" | "image" | "pdf" | "share">("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!id) return;
    fetch(`/api/orders/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setOrder(data.order);
      })
      .catch(() => setError("Something went wrong loading this order."));
  }, [id]);

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
    if (!order) return;
    setBusy("image");
    try {
      const blob = await renderPng();
      if (!blob) throw new Error("no blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `order-${String(order.orderNumber).padStart(3, "0")}.png`;
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
    if (!order) return;
    setBusy("share");
    try {
      const blob = await renderPng();
      if (!blob) throw new Error("no blob");
      const file = new File(
        [blob],
        `order-${String(order.orderNumber).padStart(3, "0")}.png`,
        { type: "image/png" }
      );
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Order #${String(order.orderNumber).padStart(3, "0")}`,
        });
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
    if (!order) return;
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

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 40;
      const usableWidth = pageWidth - margin * 2;
      const imgHeight = (img.height / img.width) * usableWidth;

      pdf.addImage(dataUrl, "PNG", margin, margin, usableWidth, imgHeight);
      pdf.save(`order-${String(order.orderNumber).padStart(3, "0")}.pdf`);
      showToast("✓ PDF generated");
    } catch {
      showToast("Something went wrong generating the PDF.");
    } finally {
      setBusy("");
    }
  }

  if (error) {
    return (
      <div className="py-16 text-center">
        <div className="font-semibold text-ink mb-1">Something went wrong</div>
        <div className="text-sm text-muted mb-5">{error}</div>
        <Link href="/orders" className="btn-secondary inline-flex px-6">
          Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <header className="flex items-center gap-3 py-2 mb-5">
        <Link
          href="/orders"
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
        <div className="text-xl font-bold">
          {order ? `Order #${String(order.orderNumber).padStart(3, "0")}` : "Order"}
        </div>
      </header>

      {!order ? (
        <div className="h-64 rounded-2xl bg-gray-100 animate-pulse" />
      ) : (
        <>
          <div className="flex justify-center overflow-x-auto mb-6">
            <div className="scale-[0.78] origin-top -mb-16 sm:scale-100 sm:mb-0">
              <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-subtle">
                <OrderDocument
                  ref={docRef}
                  orderNumber={order.orderNumber}
                  createdAt={order.createdAt}
                  items={order.items}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 mt-2">
            <button
              onClick={handleSaveImage}
              disabled={busy !== ""}
              className="btn-primary w-full"
            >
              {busy === "image" ? "Preparing your order..." : "Save Image"}
            </button>
            <button
              onClick={handleShare}
              disabled={busy !== ""}
              className="btn-secondary w-full"
            >
              {busy === "share" ? "Preparing..." : "Share"}
            </button>
            <button
              onClick={handleGeneratePdf}
              disabled={busy !== ""}
              className="btn-secondary w-full"
            >
              {busy === "pdf" ? "Generating..." : "Generate PDF"}
            </button>
          </div>
        </>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-navy text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-subtle z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
