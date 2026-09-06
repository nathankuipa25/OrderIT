import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import OrderCard from "@/components/OrderCard";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

type OrderWithCount = {
  id: string;
  orderNumber: number;
  createdAt: Date;
  _count: { items: number };
  user?: { name: string } | null;
};

function groupByDate(orders: OrderWithCount[]) {
  const groups: Record<string, OrderWithCount[]> = {};
  for (const order of orders) {
    const key = order.createdAt.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    if (!groups[key]) groups[key] = [];
    groups[key].push(order);
  }
  return groups;
}

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.role === "ADMIN";

  const orders: OrderWithCount[] = await prisma.order.findMany({
    where: isAdmin ? undefined : { userId: session.sub },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { items: true } },
      ...(isAdmin ? { user: { select: { name: true } } } : {}),
    },
  });

  const grouped = groupByDate(orders);
  const dateKeys = Object.keys(grouped);

  return (
    <div>
      <header className="py-2 mb-6">
        <div className="text-2xl font-bold text-navy">
          {isAdmin ? "All Orders" : "Orders"}
        </div>
      </header>

      {orders.length === 0 ? (
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
      ) : (
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
                    itemCount={order._count.items}
                    createdAt={order.createdAt.toISOString()}
                    shopName={isAdmin ? order.user?.name : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
