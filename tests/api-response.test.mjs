import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const root = fileURLToPath(new URL("../", import.meta.url));
const tempDir = await mkdtemp(path.join(os.tmpdir(), "orderit-api-response-"));
after(() => rm(tempDir, { recursive: true, force: true }));

const helperSource = await readFile(path.join(root, "lib/api-response.ts"), "utf8");
const helperJs = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const helperPath = path.join(tempDir, "api-response.mjs");
await writeFile(helperPath, helperJs);
const { withPrivateApiHeaders } = await import(pathToFileURL(helperPath).href);

async function listRouteFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return listRouteFiles(file);
    return entry.isFile() && entry.name === "route.ts" ? [file] : [];
  }));
  return files.flat();
}

test("API response wrapper preserves existing Vary members and adds credential variance", async () => {
  const handler = withPrivateApiHeaders(async () => new Response("forbidden", {
    status: 403,
    headers: { Vary: "RSC, Next-Router-State-Tree", "Cache-Control": "public, max-age=600" },
  }));
  const response = await handler();

  assert.equal(response.status, 403);
  assert.equal(await response.text(), "forbidden");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.deepEqual(
    new Set((response.headers.get("Vary") || "").split(",").map((name) => name.trim().toLowerCase())),
    new Set(["rsc", "next-router-state-tree", "authorization", "cookie"]),
  );
});

test("every API route method uses the response wrapper", async () => {
  const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]);
  const files = await listRouteFiles(path.join(root, "app/api"));
  const uncovered = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && methods.has(statement.name.text) && statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        uncovered.push(`${path.relative(root, file)}:${statement.name.text}`);
      }
      if (!ts.isVariableStatement(statement) || !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !methods.has(declaration.name.text)) continue;
        const initializer = declaration.initializer;
        const isWrapped = initializer && ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression) && initializer.expression.text === "withPrivateApiHeaders";
        if (!isWrapped) uncovered.push(`${path.relative(root, file)}:${declaration.name.text}`);
      }
    }
  }

  assert.deepEqual(uncovered, []);
});
