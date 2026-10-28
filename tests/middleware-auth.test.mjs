import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const originalJwtSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = "test-only-middleware-auth-secret";

const tempDir = await mkdtemp(path.join(repositoryRoot, ".middleware-auth-test-"));
after(async () => {
  await rm(tempDir, { recursive: true, force: true });
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
});

function transpile(source) {
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
    },
  });
  return result.outputText;
}

const [authSource, middlewareSource] = await Promise.all([
  readFile(path.join(repositoryRoot, "lib/auth.ts"), "utf8"),
  readFile(path.join(repositoryRoot, "middleware.ts"), "utf8"),
]);
await writeFile(path.join(tempDir, "auth.mjs"), transpile(authSource));
const nextServerUrl = pathToFileURL(require.resolve("next/server")).href;
const testableMiddleware = middlewareSource
  .replace('from "@/lib/auth"', 'from "./auth.mjs"')
  .replace('from "next/server"', `from "${nextServerUrl}"`);
assert.notEqual(testableMiddleware, middlewareSource, "the test harness must resolve the middleware auth import");
await writeFile(path.join(tempDir, "middleware.mjs"), transpile(testableMiddleware));

const [{ middleware }, { signMobileSession, signSession }, { NextRequest }] = await Promise.all([
  import(pathToFileURL(path.join(tempDir, "middleware.mjs")).href),
  import(pathToFileURL(path.join(tempDir, "auth.mjs")).href),
  import(nextServerUrl),
]);

const shop = { sub: "shop-1", role: "SHOP", name: "Shop One" };
const admin = { sub: "admin-1", role: "ADMIN", name: "Admin One" };
const shopBearer = await signMobileSession(shop, "device-token-shop");
const adminBearer = await signMobileSession(admin, "device-token-admin");
const shopCookie = await signSession(shop);
const adminCookie = await signSession(admin);

function request(pathname, { method = "GET", headers = {} } = {}) {
  return new NextRequest(`https://orderit.test${pathname}`, { method, headers });
}

async function run(pathname, options) {
  return middleware(request(pathname, options));
}

function assertPrivateApiVary(response) {
  const vary = (response.headers.get("vary") || "")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  assert.ok(vary.includes("authorization"), `expected Authorization in Vary, got ${response.headers.get("vary")}`);
  assert.ok(vary.includes("cookie"), `expected Cookie in Vary, got ${response.headers.get("vary")}`);
  assert.match(response.headers.get("cache-control") || "", /private/);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
}

function assertAllowed(response) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
}

function bearer(token) {
  return { authorization: `Bearer ${token}` };
}

function cookie(token) {
  return { cookie: `orderit_session=${token}` };
}

test("protected APIs reject missing, malformed, invalid, and web-only bearer tokens", async () => {
  const responses = await Promise.all([
    run("/api/orders"),
    run("/api/orders", { headers: { authorization: "Bearer not-a-jwt" } }),
    run("/api/orders", { headers: { authorization: "Basic not-a-bearer" } }),
    run("/api/orders", { headers: bearer(shopCookie) }),
    run("/api/orders", { headers: { ...cookie(adminCookie), authorization: "Bearer invalid" } }),
  ]);

  for (const response of responses) {
    assert.equal(response.status, 401);
    assertPrivateApiVary(response);
  }
});

test("SHOP bearer sessions can order and read products but cannot use admin-only APIs", async () => {
  const [orders, products, productWrite, adminApi] = await Promise.all([
    run("/api/orders", { headers: bearer(shopBearer) }),
    run("/api/products", { headers: bearer(shopBearer) }),
    run("/api/products", { method: "POST", headers: bearer(shopBearer) }),
    run("/api/admin/reset", { method: "POST", headers: bearer(shopBearer) }),
  ]);

  assertAllowed(orders);
  assertAllowed(products);
  assert.equal(productWrite.status, 403);
  assertPrivateApiVary(orders);
  assertPrivateApiVary(products);
  assertPrivateApiVary(productWrite);
  assertPrivateApiVary(adminApi);
  assert.equal(adminApi.status, 403);
});

test("ADMIN bearer sessions pass admin-only APIs while SHOP-only order policy remains at the API handler", async () => {
  const [productsWrite, adminApi, orders] = await Promise.all([
    run("/api/products", { method: "POST", headers: bearer(adminBearer) }),
    run("/api/admin/reset", { method: "POST", headers: bearer(adminBearer) }),
    run("/api/orders", { method: "POST", headers: bearer(adminBearer) }),
  ]);

  assertAllowed(productsWrite);
  assertAllowed(adminApi);
  assertAllowed(orders);
  for (const response of [productsWrite, adminApi, orders]) assertPrivateApiVary(response);
});

test("web cookie sessions remain unchanged and bearer tokens never authenticate page routes", async () => {
  const [shopOrdersApi, adminProductWrite, adminPage, shopProductsPage, shopBearerPage, adminBearerPage] = await Promise.all([
    run("/api/orders", { headers: cookie(shopCookie) }),
    run("/api/products", { method: "POST", headers: cookie(adminCookie) }),
    run("/admin/reset", { headers: cookie(adminCookie) }),
    run("/products", { headers: cookie(shopCookie) }),
    run("/orders", { headers: bearer(shopBearer) }),
    run("/products", { headers: bearer(adminBearer) }),
  ]);

  assertAllowed(shopOrdersApi);
  assertAllowed(adminProductWrite);
  assertPrivateApiVary(shopOrdersApi);
  assertPrivateApiVary(adminProductWrite);
  assertAllowed(adminPage);
  assert.equal(shopProductsPage.status, 307);
  assert.equal(new URL(shopProductsPage.headers.get("location")).pathname, "/");
  assert.equal(shopBearerPage.status, 307);
  assert.equal(new URL(shopBearerPage.headers.get("location")).pathname, "/login");
  assert.equal(adminBearerPage.status, 307);
  assert.equal(new URL(adminBearerPage.headers.get("location")).pathname, "/login");
});

test("public auth API responses still disable caching and vary by bearer and cookie credentials", async () => {
  const response = await run("/api/auth/me");
  assertAllowed(response);
  assertPrivateApiVary(response);
});
