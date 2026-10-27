"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useRef, useEffect } from "react";

export default function AccountMenu({
  name,
  role,
}: {
  name: string;
  role: "ADMIN" | "SHOP";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleLogout() {
    if (
      role === "SHOP" &&
      !window.confirm(
        "Logging out will not delete orders saved on this device. Any unsynced orders will stay here and can sync after you sign in to the same shop again. Continue?"
      )
    ) {
      return;
    }
    setLoggingOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout could not be completed.");
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.ready.catch(() => null);
        (navigator.serviceWorker.controller || registration?.active)?.postMessage({
          type: "SET_SIGNED_OUT",
        });
      }
      router.push("/login");
      router.refresh();
    } catch {
      window.alert("Could not log out. Check your connection and try again.");
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="w-11 h-11 flex items-center justify-center -mr-2"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <circle cx="5" cy="12" r="1.8" fill="#6b7280" />
          <circle cx="12" cy="12" r="1.8" fill="#6b7280" />
          <circle cx="19" cy="12" r="1.8" fill="#6b7280" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-56 card p-3 z-50">
          <div className="px-1 pb-2 mb-2 border-b border-gray-100">
            <div className="font-semibold text-ink text-sm truncate">
              {name}
            </div>
            <div className="text-xs text-muted mt-0.5">
              {role === "ADMIN" ? "Admin" : "Shop account"}
            </div>
          </div>
          <Link
            href="/account"
            onClick={() => setOpen(false)}
            className="block w-full text-left px-1 py-1.5 text-sm font-medium text-ink"
          >
            Account settings
          </Link>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="w-full text-left px-1 py-1.5 text-sm font-medium text-danger disabled:opacity-50"
          >
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      )}
    </div>
  );
}
