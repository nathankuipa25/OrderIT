import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migrationPath = "prisma/migrations/20261027125000_add_order_idempotency_key/migration.sql";
const read = (path) => readFile(new URL(path, root), "utf8");

function workflowStep(workflow, name) {
  const marker = `- name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `workflow must include step: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next === -1 ? undefined : next);
}

test("database update applies only the approved idempotent migration before Prisma push", async () => {
  const [workflow, migration] = await Promise.all([
    read(".github/workflows/prisma-db-push.yml"),
    read(migrationPath),
  ]);

  assert.equal(
    migration.replace(/\s+/g, " ").trim(),
    'ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT; CREATE UNIQUE INDEX IF NOT EXISTS "Order_idempotencyKey_key" ON "Order" ("idempotencyKey");'
  );

  assert.match(workflow, /paths:[\s\S]*?- "prisma\/migrations\/\*\*"/);
  const contractCheck = workflowStep(workflow, "Check migration workflow contract");
  const migrationStep = workflowStep(workflow, "Apply approved additive SQL migration");
  const pushStep = workflowStep(workflow, "Push schema to database");

  assert.match(contractCheck, /run: node --test tests\/prisma-db-push-workflow\.test\.mjs/);
  assert.match(migrationStep, new RegExp(`run: npx prisma db execute --schema prisma/schema\\.prisma --file ${migrationPath.replaceAll("/", "\\/")}`));
  assert.match(pushStep, /run: npx prisma db push/);
  assert.ok(
    workflow.indexOf("node --test tests/prisma-db-push-workflow.test.mjs") <
      workflow.indexOf(`npx prisma db execute --schema prisma/schema.prisma --file ${migrationPath}`),
    "contract check must run before the SQL migration"
  );
  assert.ok(
    workflow.indexOf(`npx prisma db execute --schema prisma/schema.prisma --file ${migrationPath}`) <
      workflow.indexOf("npx prisma db push"),
    "SQL migration must run before prisma db push"
  );

  for (const [name, step] of [["migration", migrationStep], ["schema push", pushStep]]) {
    assert.match(step, /DATABASE_URL:\s*\$\{\{ secrets\.DATABASE_URL \}\}/, `${name} must use the configured database secret`);
  }

  assert.doesNotMatch(workflow, /--accept-data-loss/);
  assert.doesNotMatch(workflow, /db:seed|prisma db seed|Seed demo/i);
});
