"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import OrderDocument from "@/components/OrderDocument";
import Skeleton from "@/components/Skeleton";
import { useOrderExport } from "@/lib/useOrderExport";

type Item = { id: string; product: { name: string } };
type OrderData = {
  id: string;
  orderNumber: number;
  createdAt: string;
  items: Item[];
  user?: { name: string } | null;
};

export default function OrderDetailsPage() {
  const params = useParams();
  const id = params?.id as string;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [error, setError] = useState("");

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

  const { pages, hiddenPages, saveImages, share, generatePdf, busy, toast } =
    useOrderExport({
      orderNumber: order?.orderNumber ?? 0,
      createdAt: order?.createdAt ?? new Date().toISOString(),
      items: order?.items ?? [],
      title: order?.user?.name,
    });

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
        <Skeleton className="h-64" />
      ) : (
        <>
          {/* Hidden full-resolution nodes used only for image/PDF capture */}
          {hiddenPages}

          <div className="flex flex-col items-center gap-4 mb-6">
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
                        orderNumber={order.orderNumber}
                        createdAt={order.createdAt}
                        items={pageItems}
                        title={order.user?.name}
                        startIndex={startIndex}
                        totalCount={order.items.length}
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

          <div className="flex flex-col gap-2.5 mt-2">
            <button
              onClick={saveImages}
              disabled={busy !== ""}
              className="btn-primary w-full"
            >
              {busy === "image"
                ? "Preparing your order..."
                : pages.length > 1
                ? `Save ${pages.length} Images`
                : "Save Image"}
            </button>
            <button
              onClick={share}
              disabled={busy !== ""}
              className="btn-secondary w-full"
            >
              {busy === "share" ? "Preparing..." : "Share"}
            </button>
            <button
              onClick={generatePdf}
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
