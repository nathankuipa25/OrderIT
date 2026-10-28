import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const idempotencyMigrationPath = "prisma/migrations/20261027125000_add_order_idempotency_key/migration.sql";
const mobileSessionMigrationPath = "prisma/migrations/20261028231000_add_mobile_session_revocation/migration.sql";
const read = (path) => readFile(new URL(path, root), "utf8");

function workflowStep(workflow, name) {
  const marker = `- name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow must include step: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next === -1 ? undefined : next);
}

test("database update applies both approved additive migrations before Prisma push", async () => {
  const [workflow, idempotencyMigration, mobileSessionMigration] = await Promise.all([
    read(".github/workflows/prisma-db-push.yml"),
    read(idempotencyMigrationPath),
    read(mobileSessionMigrationPath),
  ]);

  assert.equal(
    idempotencyMigration.replace(/\s+/g, " ").trim(),
    'ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT; CREATE UNIQUE INDEX IF NOT EXISTS "Order_idempotencyKey_key" ON "Order" ("idempotencyKey");'
  );
  assert.match(mobileSessionMigration, /CREATE TABLE IF NOT EXISTS "MobileSession"/);
  assert.match(mobileSessionMigration, /CREATE INDEX IF NOT EXISTS "MobileSession_userId_revokedAt_idx"/);
  assert.match(mobileSessionMigration, /CREATE INDEX IF NOT EXISTS "MobileSession_expiresAt_idx"/);
  assert.match(mobileSessionMigration, /FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE CASCADE ON UPDATE CASCADE/);
  assert.doesNotMatch(mobileSessionMigration, /(^|\n)\s*(DROP\s+TABLE|DROP\s+COLUMN|DELETE\s+FROM)\b/i);

  assert.match(workflow, /paths:[\s\S]*?- "prisma\/migrations\/\*\*"/);
  const contractCheck = workflowStep(workflow, "Check migration workflow contract");
  const idempotencyStep = workflowStep(workflow, "Apply approved additive SQL migration");
  const mobileSessionStep = workflowStep(workflow, "Apply native session revocation migration");
  const pushStep = workflowStep(workflow, "Push schema to database");

  assert.match(contractCheck, /run: node --test tests\/prisma-db-push-workflow\.test\.mjs/);
  assert.match(idempotencyStep, new RegExp(`run: npx prisma db execute --schema prisma/schema\\.prisma --file ${idempotencyMigrationPath.replaceAll("/", "\\/")}`));
  assert.match(mobileSessionStep, new RegExp(`run: npx prisma db execute --schema prisma/schema\\.prisma --file ${mobileSessionMigrationPath.replaceAll("/", "\\/")}`));
  assert.match(pushStep, /run: npx prisma db push/);

  const contractIndex = workflow.indexOf("node --test tests/prisma-db-push-workflow.test.mjs");
  const idempotencyIndex = workflow.indexOf(`npx prisma db execute --schema prisma/schema.prisma --file ${idempotencyMigrationPath}`);
  const mobileSessionIndex = workflow.indexOf(`npx prisma db execute --schema prisma/schema.prisma --file ${mobileSessionMigrationPath}`);
  const pushIndex = workflow.indexOf("npx prisma db push");
  assert.ok(contractIndex < idempotencyIndex, "contract check must run before SQL migrations");
  assert.ok(idempotencyIndex < mobileSessionIndex, "existing order migration must run before the native-session migration");
  assert.ok(mobileSessionIndex < pushIndex, "native-session SQL migration must run before prisma db push");

  for (const [name, step] of [
    ["order idempotency migration", idempotencyStep],
    ["native session migration", mobileSessionStep],
    ["schema push", pushStep],
  ]) {
    assert.match(step, /DATABASE_URL:\s*\$\{\{ secrets\.DATABASE_URL \}\}/, `${name} must use the configured database secret`);
  }

  assert.doesNotMatch(workflow, /--accept-data-loss/);
  assert.doesNotMatch(workflow, /db:seed|prisma db seed|Seed demo/i);
});
