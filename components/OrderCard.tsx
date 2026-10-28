import Link from "next/link";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }) + " · " + d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderCard({
  id,
  orderNumber,
  itemCount,
  createdAt,
  shopName,
}: {
  id: string;
  orderNumber: number;
  itemCount: number;
  createdAt: string;
  shopName?: string | null;
}) {
  return (
    <Link
      href={`/orders/${id}`}
      className="card group flex min-h-[76px] items-center justify-between gap-3 px-4 py-3.5 transition active:scale-[0.99]"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate font-semibold text-ink">
          Order #{String(orderNumber).padStart(3, "0")}
          </div>
          <span className="shrink-0 rounded-full bg-surface px-2 py-1 text-xs font-medium text-muted">
            {itemCount} product{itemCount === 1 ? "" : "s"}
          </span>
        </div>
        {shopName && (
          <div className="mt-1 truncate text-xs font-medium text-accent">
            {shopName}
          </div>
        )}
        <div className="mt-1 text-xs text-muted">
          {formatDateTime(createdAt)}
        </div>
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-muted transition group-hover:bg-accent-light group-hover:text-navy">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="m9 5 7 7-7 7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      </div>
    </Link>
  );
}
