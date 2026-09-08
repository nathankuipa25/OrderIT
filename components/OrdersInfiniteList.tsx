"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import OrderCard from "@/components/OrderCard";
import EmptyState from "@/components/EmptyState";
import Skeleton from "@/components/Skeleton";

export type OrderRow = {
  id: string;
  orderNumber: number;
  createdAt: string; // ISO
  itemCount: number;
  shopName?: string | null;
};

const PAGE_SIZE = 20;

function groupByDate(orders: OrderRow[]) {
  const groups: Record<string, OrderRow[]> = {};
  for (const order of orders) {
    const key = new Date(order.createdAt).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    if (!groups[key]) groups[key] = [];
    groups[key].push(order);
  }
  return groups;
}

export default function OrdersInfiniteList({
  initialOrders,
  initialHasMore,
  isAdmin,
}: {
  initialOrders: OrderRow[];
  initialHasMore: boolean;
  isAdmin: boolean;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const loadingRef = useRef(false);
  const skipRef = useRef(initialOrders.length);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    setError("");
    try {
      const params = new URLSearchParams({
        take: String(PAGE_SIZE),
        skip: String(skipRef.current),
      });
      const res = await fetch(`/api/orders?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");

      type RawOrder = {
        id: string;
        orderNumber: number;
        createdAt: string;
        _count?: { items: number };
        user?: { name: string } | null;
      };
      const newOrders: OrderRow[] = (data.orders ?? []).map(
        (o: RawOrder) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          createdAt: o.createdAt,
          itemCount: o._count?.items ?? 0,
          shopName: o.user?.name,
        })
      );

      setOrders((prev) => [...prev, ...newOrders]);
      setHasMore(Boolean(data.hasMore));
      skipRef.current += newOrders.length;
    } catch {
      setError("Couldn't load more orders. Scroll to retry.");
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "300px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore]);

  if (orders.length === 0) {
    return (
      <EmptyState
        title="No orders yet"
        description={
          isAdmin
            ? "Orders created by shops will appear here."
            : "Create an order by selecting the products you need."
        }
        action={
          !isAdmin && (
            <Link href="/orders/new" className="btn-primary w-full">
              Create Order
            </Link>
          )
        }
      />
    );
  }

  const grouped = groupByDate(orders);
  const dateKeys = Object.keys(grouped);

  return (
    <div className="flex flex-col gap-6">
      {dateKeys.map((dateKey) => (
        <div key={dateKey}>
          <div className="text-xs font-bold tracking-wider text-muted uppercase mb-2 px-1">
            {dateKey}
          </div>
          <div className="flex flex-col gap-3">
            {grouped[dateKey].map((order) => (
              <OrderCard
                key={order.id}
                id={order.id}
                orderNumber={order.orderNumber}
                itemCount={order.itemCount}
                createdAt={order.createdAt}
                shopName={isAdmin ? order.shopName : undefined}
              />
            ))}
          </div>
        </div>
      ))}

      {hasMore && (
        <div ref={sentinelRef} className="flex flex-col gap-3">
          {loadingMore && (
            <>
              <Skeleton className="h-[76px]" />
              <Skeleton className="h-[76px]" />
            </>
          )}
        </div>
      )}

      {error && <div className="text-sm text-danger text-center">{error}</div>}
    </div>
  );
}
