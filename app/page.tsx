import Link from "next/link";
import { prisma } from "@/lib/prisma";
import OrderCard from "@/components/OrderCard";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

type OrderWithCount = {
  id: string;
  orderNumber: number;
  createdAt: Date;
  _count: { items: number };
};

export default async function HomePage() {
  const orders: OrderWithCount[] = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { _count: { select: { items: true } } },
  });

  return (
    <div>
      <header className="flex items-center justify-between py-2 mb-6">
        <div className="text-2xl font-bold text-navy">OrderIT</div>
        <button
          aria-label="Menu"
          className="w-11 h-11 flex items-center justify-center -mr-2"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="5" cy="12" r="1.8" fill="#6b7280" />
            <circle cx="12" cy="12" r="1.8" fill="#6b7280" />
            <circle cx="19" cy="12" r="1.8" fill="#6b7280" />
          </svg>
        </button>
      </header>

      <section className="card px-5 py-5 mb-8">
        <div className="text-lg font-semibold mb-0.5">Create an Order</div>
        <div className="text-sm text-muted mb-4">
          Select products to request
        </div>
        <Link href="/orders/new" className="btn-primary w-full">
          <span className="mr-1.5 text-lg leading-none">+</span> Create Order
        </Link>
      </section>

      <section>
        <div className="text-lg font-semibold mb-3">Recent Orders</div>

        {orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="Create your first order by selecting the products you need."
            action={
              <Link href="/orders/new" className="btn-primary w-full">
                Create Order
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                id={order.id}
                orderNumber={order.orderNumber}
                itemCount={order._count.items}
                createdAt={order.createdAt.toISOString()}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
