import Link from "next/link";

function formatDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

export default function OrderCard({
  id,
  orderNumber,
  itemCount,
  createdAt,
}: {
  id: string;
  orderNumber: number;
  itemCount: number;
  createdAt: string;
}) {
  return (
    <Link
      href={`/orders/${id}`}
      className="card flex items-center justify-between px-4 py-3.5 min-h-[44px]"
    >
      <div>
        <div className="font-semibold text-ink">
          Order #{String(orderNumber).padStart(3, "0")}
        </div>
        <div className="text-sm text-muted mt-0.5">
          {itemCount} product{itemCount === 1 ? "" : "s"}
        </div>
        <div className="text-xs text-muted mt-0.5">
          {formatDateTime(createdAt)}
        </div>
      </div>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M9 6l6 6-6 6"
          stroke="#9ca3af"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}
