import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import OrderCard from "@/components/OrderCard";
import EmptyState from "@/components/EmptyState";
import AccountMenu from "@/components/AccountMenu";

export const dynamic = "force-dynamic";

type OrderWithCount = {
  id: string;
  orderNumber: number;
  createdAt: Date;
  _count: { items: number };
  user?: { name: string } | null;
};

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.role === "ADMIN";

  const orders: OrderWithCount[] = await prisma.order.findMany({
    where: isAdmin ? undefined : { userId: session.sub },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      _count: { select: { items: true } },
      ...(isAdmin ? { user: { select: { name: true } } } : {}),
    },
  });

  return (
    <div>
      <header className="flex items-center justify-between py-2 mb-6">
        <div className="text-2xl font-bold text-navy">OrderIT</div>
        <AccountMenu name={session.name} role={session.role} />
      </header>

      {isAdmin ? (
        <section className="grid grid-cols-2 gap-3 mb-8">
          <Link href="/orders" className="card px-4 py-4">
            <div className="text-sm text-muted mb-1">All Orders</div>
            <div className="text-lg font-semibold">View orders</div>
          </Link>
          <Link href="/products" className="card px-4 py-4">
            <div className="text-sm text-muted mb-1">Catalog</div>
            <div className="text-lg font-semibold">Manage products</div>
          </Link>
        </section>
      ) : (
        <section className="card px-5 py-5 mb-8">
          <div className="text-lg font-semibold mb-0.5">Create an Order</div>
          <div className="text-sm text-muted mb-4">
            Select products to request
          </div>
          <Link href="/orders/new" className="btn-primary w-full">
            <span className="mr-1.5 text-lg leading-none">+</span> Create Order
          </Link>
        </section>
      )}

      <section>
        <div className="text-lg font-semibold mb-3">
          {isAdmin ? "Recent Orders (all shops)" : "Recent Orders"}
        </div>

        {orders.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description={
              isAdmin
                ? "Orders created by shops will appear here."
                : "Create your first order by selecting the products you need."
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
          <div className="flex flex-col gap-3">
            {orders.map((order) => (
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
        )}
      </section>
    </div>
  );
}
