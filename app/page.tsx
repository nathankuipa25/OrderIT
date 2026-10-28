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
      <header className="mb-7 flex items-center justify-between gap-3 py-1">
        <h1 className="min-w-0 truncate text-xl font-semibold leading-tight text-navy">
          {isAdmin ? "Shop ordering" : session.name}
        </h1>
        <AccountMenu name={session.name} role={session.role} />
      </header>

      {isAdmin ? (
        <section className="mb-8 grid grid-cols-2 gap-3">
          <Link href="/orders" className="card px-4 py-4">
            <div className="mb-1 text-sm text-muted">All Orders</div>
            <div className="text-lg font-semibold">View orders</div>
          </Link>
          <Link href="/products" className="card px-4 py-4">
            <div className="mb-1 text-sm text-muted">Catalog</div>
            <div className="text-lg font-semibold">Manage products</div>
          </Link>
        </section>
      ) : (
        <section className="card mb-8 p-4 sm:p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent-light text-accent">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-ink">Create an order</h2>
              <p className="mt-0.5 text-sm text-muted">Choose products for your next request</p>
            </div>
          </div>
          <Link href="/orders/new" className="btn-primary w-full gap-2">
            Create order
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">
            {isAdmin ? "Recent orders across shops" : "Recent orders"}
          </h2>
          {orders.length > 0 && (
            <Link href="/orders" className="rounded-lg px-2 py-2 text-sm font-semibold text-navy">
              View all
            </Link>
          )}
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
                  Create order
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
