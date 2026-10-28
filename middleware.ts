import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifyMobileSession, verifySession } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/register"];
const PUBLIC_ASSET_PATHS = [
  "/manifest.webmanifest",
  "/service-worker.js",
  "/offline.html",
  "/offline-unavailable.html",
  "/offline.css",
  "/offline-app.js",
  "/offline-store.mjs",
  "/icons/",
  "/splash/",
  "/.well-known/",
];

const isApiPath = (pathname: string) => pathname === "/api" || pathname.startsWith("/api/");

function addVary(response: NextResponse, names: string[]) {
  const current = (response.headers.get("Vary") || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (!current.includes("*")) {
    const seen = new Set(current.map((name) => name.toLowerCase()));
    for (const name of names) {
      if (!seen.has(name.toLowerCase())) {
        current.push(name);
        seen.add(name.toLowerCase());
      }
    }
    response.headers.set("Vary", current.join(", "));
  }
  return response;
}

function withPrivateApiHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return addVary(response, ["Authorization", "Cookie"]);
}

function withPrivatePageHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return addVary(response, ["Cookie"]);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    PUBLIC_ASSET_PATHS.some((p) => pathname === p || pathname.startsWith(p)) ||
    pathname === "/api/auth" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    const response = NextResponse.next();
    return isApiPath(pathname) ? withPrivateApiHeaders(response) : response;
  }

  const authorization = isApiPath(pathname) ? req.headers.get("authorization") : null;
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i);
  const cookieToken = req.cookies.get(SESSION_COOKIE)?.value;
  const session = isApiPath(pathname) && authorization !== null
    ? bearer ? await verifyMobileSession(bearer[1]) : null
    : cookieToken ? await verifySession(cookieToken) : null;

  if (!session) {
    if (isApiPath(pathname)) {
      return withPrivateApiHeaders(NextResponse.json(
        { error: "Please log in." },
        { status: 401 }
      ));
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Product catalog management is admin-only. Reading the active product
  // list (GET /api/products) stays open to shops — they need it to build
  // an order — only the management page and write endpoints are gated.
  const isAdminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname === "/api/admin" || pathname.startsWith("/api/admin/");
  if ((isAdminPath || isAdminApi) && session.role !== "ADMIN") {
    if (isApiPath(pathname)) {
      return withPrivateApiHeaders(NextResponse.json(
        { error: "Admins only." },
        { status: 403 }
      ));
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  const isProductsPage = pathname.startsWith("/products");
  const isProductsWrite =
    pathname.startsWith("/api/products") && req.method !== "GET";

  if ((isProductsPage || isProductsWrite) && session.role !== "ADMIN") {
    if (isApiPath(pathname)) {
      return withPrivateApiHeaders(NextResponse.json(
        { error: "Admins only." },
        { status: 403 }
      ));
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  const response = NextResponse.next();
  return isApiPath(pathname)
    ? withPrivateApiHeaders(response)
    : withPrivatePageHeaders(response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|service-worker.js|offline\\.html|offline-unavailable\\.html|offline\\.css|offline-app\\.js|offline-store\\.mjs|icons/|splash/|\\.well-known/).*)",
  ],
};
