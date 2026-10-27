import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyProductRows,
  parseProductCsv,
  serializeProductCsv,
  summarizeProductRows,
} from "../lib/product-csv.mjs";

test("parses quoted commas, escaped quotes, and multiline product names", () => {
  const parsed = parseProductCsv(
    'nAmE,enabled,Price\r\n"Tea, Earl Grey",false,2\r\n"Bar ""Special""",YES,3\r\n"Line one\nLine two",,4\r\n'
  );

  assert.equal(parsed.ok, true);
  assert.deepEqual(
    parsed.rows.map(({ name, active, errors }) => ({ name, active, errors })),
    [
      { name: "Tea, Earl Grey", active: false, errors: [] },
      { name: 'Bar "Special"', active: true, errors: [] },
      { name: "Line one\nLine two", active: true, errors: [] },
    ]
  );
});

test("detects Aronium-style semicolon files and matches headers without case sensitivity", () => {
  const parsed = parseProductCsv("\uFEFFnAmE;EnAbLeD;Price\r\nMilk;0;2.50\r\nBread;Yes;1.25\r\n");
  assert.equal(parsed.ok, true);
  assert.equal(parsed.delimiter, ";");
  assert.deepEqual(parsed.rows.map(({ name, active }) => [name, active]), [
    ["Milk", false],
    ["Bread", true],
  ]);
});

test("requires one Name header and reports ambiguous product headers", () => {
  assert.deepEqual(parseProductCsv("Product,Enabled\nTea,Yes\n"), {
    ok: false,
    error: 'The CSV must include a "Name" column.',
  });
  assert.deepEqual(parseProductCsv("Name,name,Enabled\nTea,Tea,Yes\n"), {
    ok: false,
    error: 'The CSV has more than one "Name" column.',
  });
  assert.deepEqual(parseProductCsv("Name,Enabled,enabled\nTea,Yes,Yes\n"), {
    ok: false,
    error: 'The CSV has more than one "Enabled" column.',
  });
});

test("validates blank names, unsupported Enabled values, and inconsistent column counts", () => {
  const parsed = parseProductCsv(
    "Name,Enabled,Code\n,yes,1\nSoup,maybe,2\nShort,yes\nExtra,yes,3,unexpected\n"
  );
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.rows.map((row) => row.errors.length), [1, 1, 1, 1]);
  assert.match(parsed.rows[0].errors[0], /Name.*required/);
  assert.match(parsed.rows[1].errors[0], /Enabled.*must be/);
  assert.match(parsed.rows[2].errors[0], /Expected 3 columns but found 2/);
  assert.match(parsed.rows[3].errors[0], /Expected 3 columns but found 4/);
  const classified = classifyProductRows(parsed.rows);
  assert.deepEqual(summarizeProductRows(classified), {
    total: 4,
    ready: 0,
    invalid: 4,
    alreadyExists: 0,
    duplicateFile: 0,
  });
});

test("classifies existing products, repeated CSV names, and ready products case-insensitively", () => {
  const parsed = parseProductCsv("Name,Enabled\nTea,yes\nTEA,false\nBread,no\nMilk,1\n");
  assert.equal(parsed.ok, true);
  const rows = classifyProductRows(parsed.rows, ["bread"]);
  assert.deepEqual(rows.map((row) => row.status), [
    "ready",
    "duplicate-file",
    "already-exists",
    "ready",
  ]);
  assert.deepEqual(summarizeProductRows(rows), {
    total: 4,
    ready: 2,
    invalid: 0,
    alreadyExists: 1,
    duplicateFile: 1,
  });
});

test("exports only Name and Enabled, escapes CSV values, and round-trips active state", () => {
  const csv = serializeProductCsv([
    { name: 'Tea, "Earl Grey"', active: true },
    { name: "Milk", active: false },
  ]);
  assert.equal(csv, '\uFEFFName,Enabled\r\n"Tea, ""Earl Grey""",TRUE\r\nMilk,FALSE\r\n');
  assert.match(csv.split("\r\n")[0], /^\uFEFFName,Enabled$/);
  assert.doesNotMatch(csv, /price|inventory|category/i);

  const parsed = parseProductCsv(csv);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.rows.map(({ name, active }) => [name, active]), [
    ['Tea, "Earl Grey"', true],
    ["Milk", false],
  ]);
});

test("rejects malformed quoted CSV instead of silently importing partial records", () => {
  const parsed = parseProductCsv('Name,Enabled\n"Unclosed,yes\n');
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /Could not read the CSV file/);
});
