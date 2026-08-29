import { forwardRef } from "react";

type Item = { id: string; product: { name: string } };

function formatDate(iso: string) {
  return new Date(iso)
    .toLocaleDateString(undefined, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
    .toUpperCase();
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const OrderDocument = forwardRef<
  HTMLDivElement,
  { orderNumber: number; createdAt: string; items: Item[] }
>(function OrderDocument({ orderNumber, createdAt, items }, ref) {
  return (
    <div
      ref={ref}
      style={{
        width: 480,
        background: "#ffffff",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#1c1f26",
        padding: "40px 36px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 1,
            color: "#0f2340",
          }}
        >
          ORDERIT
        </div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 3,
            color: "#0f9d9d",
            marginTop: 4,
          }}
        >
          SHOP ORDER
        </div>
      </div>

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1.5 }}>
          {formatDate(createdAt)}
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
          {formatTime(createdAt)} · Order #{String(orderNumber).padStart(3, "0")}
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          borderBottom: "1px solid #e5e7eb",
          padding: "18px 0",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 2,
            color: "#6b7280",
            marginBottom: 12,
          }}
        >
          PRODUCTS
        </div>
        {items.map((item, idx) => (
          <div
            key={item.id}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              padding: "7px 0",
              fontSize: 15,
            }}
          >
            <span
              style={{
                color: "#9ca3af",
                fontWeight: 600,
                fontSize: 13,
                width: 22,
                flexShrink: 0,
              }}
            >
              {String(idx + 1).padStart(2, "0")}
            </span>
            <span style={{ fontWeight: 500 }}>{item.product.name}</span>
          </div>
        ))}
      </div>

      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
          {items.length} PRODUCT{items.length === 1 ? "" : "S"}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 2,
            color: "#0f2340",
            marginTop: 18,
          }}
        >
          ORDERIT
        </div>
      </div>
    </div>
  );
});

export default OrderDocument;
