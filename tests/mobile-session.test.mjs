import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isMobileSessionActive, revokeMobileSession } from "../lib/mobile-session.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

function memoryStore(rows) {
  const sessions = new Map(rows.map((row) => [row.id, { ...row }]));
  return {
    sessions,
    findById: async (id) => sessions.get(id) || null,
    revokeOne: async ({ id, userId }) => {
      const row = sessions.get(id);
      if (!row || row.userId !== userId || row.revokedAt) return false;
      row.revokedAt = new Date("2026-10-28T00:00:00.000Z");
      return true;
    },
  };
}

test("revoking one mobile jti invalidates only that device and leaves sibling sessions active", async () => {
  const expiresAt = new Date("2026-11-30T00:00:00.000Z");
  const store = memoryStore([
    { id: "phone-a", userId: "shop-1", expiresAt, revokedAt: null },
    { id: "phone-b", userId: "shop-1", expiresAt, revokedAt: null },
  ]);
  const phoneA = { sub: "shop-1", jti: "phone-a" };
  const phoneB = { sub: "shop-1", jti: "phone-b" };

  assert.equal(await isMobileSessionActive(phoneA, store.findById, Date.parse("2026-10-28T12:00:00.000Z")), true);
  assert.equal(await isMobileSessionActive(phoneB, store.findById, Date.parse("2026-10-28T12:00:00.000Z")), true);
  assert.equal(await revokeMobileSession(phoneA, store.revokeOne), true);
  assert.equal(await isMobileSessionActive(phoneA, store.findById, Date.parse("2026-10-28T12:00:00.000Z")), false);
  assert.equal(await isMobileSessionActive(phoneB, store.findById, Date.parse("2026-10-28T12:00:00.000Z")), true);
  assert.equal(store.sessions.get("phone-b").revokedAt, null);
});

test("unknown, wrong-owner, expired, and revoked mobile sessions fail closed", async () => {
  const store = memoryStore([
    { id: "expired", userId: "shop-1", expiresAt: new Date("2026-10-01T00:00:00.000Z"), revokedAt: null },
    { id: "revoked", userId: "shop-1", expiresAt: new Date("2026-11-30T00:00:00.000Z"), revokedAt: new Date("2026-10-20T00:00:00.000Z") },
  ]);
  const now = Date.parse("2026-10-28T12:00:00.000Z");
  assert.equal(await isMobileSessionActive({ sub: "shop-1", jti: "missing" }, store.findById, now), false);
  assert.equal(await isMobileSessionActive({ sub: "other-shop", jti: "expired" }, store.findById, now), false);
  assert.equal(await isMobileSessionActive({ sub: "shop-1", jti: "expired" }, store.findById, now), false);
  assert.equal(await isMobileSessionActive({ sub: "shop-1", jti: "revoked" }, store.findById, now), false);
  assert.equal(await isMobileSessionActive({ sub: "shop-1" }, store.findById, now), false);
  assert.equal(await revokeMobileSession({ sub: "other-shop", jti: "expired" }, store.revokeOne), false);
  assert.equal(await revokeMobileSession({ sub: "shop-1" }, store.revokeOne), false);
});

test("login persists unique token records, logout scopes revocation to that jti, and the Prisma migration matches the model", async () => {
  const [login, logout, schema, migration, session] = await Promise.all([
    read("app/api/auth/mobile/login/route.ts"),
    read("app/api/auth/mobile/logout/route.ts"),
    read("prisma/schema.prisma"),
    read("prisma/migrations/20261028231000_add_mobile_session_revocation/migration.sql"),
    read("lib/session.ts"),
  ]);

  assert.match(login, /randomUUID\(\)/);
  assert.match(login, /prisma\.mobileSession\.create\(\{\s*data:\s*\{\s*id:\s*jti,\s*userId:\s*user\.id,\s*expiresAt\s*\}/);
  assert.match(logout, /revokeMobileSession\(session/);
  assert.match(logout, /where:\s*\{\s*id,\s*userId,\s*revokedAt:\s*null\s*\}/);
  assert.match(session, /isMobileSessionActive\(session/);
  assert.match(schema, /model MobileSession\s*\{[\s\S]*?revokedAt DateTime\?/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "MobileSession"/);
  assert.match(migration, /"MobileSession_userId_fkey"/);
});
