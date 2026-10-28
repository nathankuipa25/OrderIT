"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Role = "ADMIN" | "SHOP";

function getNavItems(role?: Role) {
  const items = [
    { href: "/", label: "Home", icon: HomeIcon },
    { href: "/orders", label: "Orders", icon: OrdersIcon },
  ];
  if (role === "ADMIN") {
    items.push({ href: "/products", label: "Products", icon: ProductsIcon });
    items.push({ href: "/admin/reset", label: "Reset", icon: ResetIcon });
  }
  return items;
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export default function BottomNav({
  role,
  shopName,
}: {
  role?: Role;
  shopName?: string;
}) {
  const pathname = usePathname();

  // No session (login/register pages) — no nav to show.
  if (!role) return null;

  const NAV_ITEMS = getNavItems(role);

  return (
    <>
      {/* Mobile bottom nav */}
      <nav aria-label="Main navigation" className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="max-w-md mx-auto flex items-stretch min-h-14">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className="flex-1 flex flex-col items-center justify-center gap-1 py-1.5"
              >
                <Icon active={active} />
                <span
                  className={`text-[11px] font-medium ${
                    active ? "text-navy" : "text-muted"
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Desktop sidebar */}
      <nav aria-label="Main navigation" className="hidden md:flex md:flex-col md:fixed md:top-0 md:left-0 md:h-full md:w-56 md:border-r md:border-gray-100 md:bg-white md:px-4 md:py-6">
        <div className="mb-8 truncate px-2 text-xl font-semibold text-navy">
          {role === "SHOP" ? shopName || "Shop Orders" : "Order management"}
        </div>
        <div className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium ${
                  active ? "bg-accent-light text-navy" : "text-muted hover:bg-surface"
                }`}
              >
                <Icon active={active} />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 11.5L12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"
        stroke={active ? "#0f2340" : "#6b7280"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function OrdersIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect
        x="5"
        y="3.5"
        width="14"
        height="17"
        rx="2"
        stroke={active ? "#0f2340" : "#6b7280"}
        strokeWidth="1.8"
      />
      <path
        d="M8.5 8h7M8.5 12h7M8.5 16h4"
        stroke={active ? "#0f2340" : "#6b7280"}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProductsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M3.5 8l8.5-4.5L20.5 8v8L12 20.5 3.5 16V8z"
        stroke={active ? "#0f2340" : "#6b7280"}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M3.5 8l8.5 4.5 8.5-4.5M12 12.5V20.5"
        stroke={active ? "#0f2340" : "#6b7280"}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ResetIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M20 7v5h-5M4.5 10a7.5 7.5 0 0 1 13-3L20 12M4 17v-5h5m10.5 2a7.5 7.5 0 0 1-13 3L4 12"
        stroke={active ? "#0f2340" : "#6b7280"}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
