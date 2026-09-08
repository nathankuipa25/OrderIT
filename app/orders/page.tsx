import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import OrdersInfiniteList, { OrderRow } from "@/components/OrdersInfiniteList";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type OrderWithCount = {
  id: string;
  orderNumber: number;
  createdAt: Date;
  _count: { items: number };
  user?: { name: string } | null;
};

export default async function OrdersPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const isAdmin = session.role === "ADMIN";

  const rows: OrderWithCount[] = await prisma.order.findMany({
    where: isAdmin ? undefined : { userId: session.sub },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    include: {
      _count: { select: { items: true } },
      ...(isAdmin ? { user: { select: { name: true } } } : {}),
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const initialOrders: OrderRow[] = page.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    createdAt: order.createdAt.toISOString(),
    itemCount: order._count.items,
    shopName: isAdmin ? order.user?.name : undefined,
  }));

  return (
    <div>
      <header className="py-2 mb-6">
        <div className="text-2xl font-bold text-navy">
          {isAdmin ? "All Orders" : "Orders"}
        </div>
      </header>

      <OrdersInfiniteList
        initialOrders={initialOrders}
        initialHasMore={hasMore}
        isAdmin={isAdmin}
      />
    </div>
  );
}
