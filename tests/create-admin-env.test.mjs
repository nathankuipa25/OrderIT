import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("documented npm admin-bootstrap command loads DATABASE_URL from .env", async () => {
  const tempProject = await mkdtemp(join(tmpdir(), "orderit-admin-env-test-"));
  try {
    await mkdir(join(tempProject, "prisma"));
    const script = await readFile(join(projectRoot, "prisma/create-admin.js"), "utf8");
    await writeFile(join(tempProject, "prisma/create-admin.js"), script);
    await writeFile(
      join(tempProject, "package.json"),
      JSON.stringify({
        private: true,
        scripts: { "db:create-admin": "node prisma/create-admin.js" },
      })
    );
    const testDatabaseUrl = "postgresql://local-env-test.invalid:5432/not_a_real_database";
    await writeFile(join(tempProject, ".env"), `DATABASE_URL="${testDatabaseUrl}"\n`);
    const preload = join(tempProject, "mock-prisma.cjs");
    await writeFile(preload, `
      const Module = require("node:module");
      const originalLoad = Module._load;
      Module._load = function(request, parent, isMain) {
        if (request === "@prisma/client") {
          return { PrismaClient: class {
            constructor() {
              if (process.env.DATABASE_URL !== ${JSON.stringify(testDatabaseUrl)}) {
                throw new Error("DATABASE_URL was not loaded from .env");
              }
              this.user = {
                findUnique: async () => null,
                create: async ({ data }) => ({ id: "test-admin", ...data }),
              };
            }
            async $disconnect() {}
          } };
        }
        return originalLoad.call(this, request, parent, isMain);
      };
    `);

    const env = {
      ...process.env,
      NODE_PATH: [join(projectRoot, "node_modules"), process.env.NODE_PATH]
        .filter(Boolean)
        .join(delimiter),
      NODE_OPTIONS: `--require=${preload}`,
      ADMIN_USERNAME: "review-test-admin",
      ADMIN_NAME: "Review Test Admin",
      ADMIN_PASSWORD: "a-test-password-123",
    };
    delete env.DATABASE_URL;
    const result = spawnSync("npm", ["run", "db:create-admin"], {
      cwd: tempProject,
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.error, undefined, result.error?.message);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Created admin account review-test-admin/);
  } finally {
    await rm(tempProject, { recursive: true, force: true });
  }
});
