import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/register"];
const PUBLIC_ASSET_PATHS = [
  "/manifest.webmanifest",
  "/service-worker.js",
  "/icons/",
  "/.well-known/",
];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    PUBLIC_ASSET_PATHS.some((p) => pathname === p || pathname.startsWith(p)) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Product catalog management is admin-only. Reading the active product
  // list (GET /api/products) stays open to shops — they need it to build
  // an order — only the management page and write endpoints are gated.
  const isProductsPage = pathname.startsWith("/products");
  const isProductsWrite =
    pathname.startsWith("/api/products") && req.method !== "GET";

  if ((isProductsPage || isProductsWrite) && session.role !== "ADMIN") {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Admins only." }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|service-worker.js|icons/|\\.well-known/).*)",
  ],
};
