import { parse } from "csv-parse/sync";

const MAX_RECORD_SIZE = 256 * 1024;
const DELIMITERS = [",", ";", "\t"];
const ENABLED_VALUES = new Map([
  ["true", true],
  ["1", true],
  ["yes", true],
  ["y", true],
  ["enabled", true],
  ["active", true],
  ["false", false],
  ["0", false],
  ["no", false],
  ["n", false],
  ["disabled", false],
  ["inactive", false],
]);

function normalizeHeader(value) {
  return String(value ?? "").replace(/^\uFEFF/, "").trim().toLowerCase();
}

function normalizeProductName(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en-US");
}

function parseRecords(text, delimiter) {
  return parse(text, {
    bom: true,
    delimiter,
    info: true,
    max_record_size: MAX_RECORD_SIZE,
    relax_column_count: true,
    skip_empty_lines: true,
  });
}

function detectDelimiter(text) {
  let winner = { delimiter: ",", columns: -1 };
  for (const delimiter of DELIMITERS) {
    try {
      const first = parseRecords(text, delimiter)[0];
      if (!first) continue;
      const headers = first.record.map(normalizeHeader);
      if (!headers.includes("name")) continue;
      if (headers.length > winner.columns) {
        winner = { delimiter, columns: headers.length };
      }
    } catch {
      // Try the remaining common export delimiters; the selected parse below
      // will return the actionable parser error if none is valid.
    }
  }
  return winner.delimiter;
}

function parseEnabled(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return { ok: true, value: true };
  if (!ENABLED_VALUES.has(normalized)) return { ok: false };
  return { ok: true, value: ENABLED_VALUES.get(normalized) };
}

/** Parse a product CSV. The header must include Name; Enabled is optional. */
export function parseProductCsv(input) {
  if (typeof input !== "string" || !input.trim()) {
    return { ok: false, error: "The CSV file is empty." };
  }

  let records;
  const delimiter = detectDelimiter(input);
  try {
    records = parseRecords(input, delimiter);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid CSV format.";
    return { ok: false, error: `Could not read the CSV file: ${message}` };
  }

  if (records.length === 0) {
    return { ok: false, error: "The CSV file is empty." };
  }

  const headers = records[0].record.map(normalizeHeader);
  const nameIndexes = headers.flatMap((header, index) => header === "name" ? [index] : []);
  if (nameIndexes.length === 0) {
    return { ok: false, error: 'The CSV must include a "Name" column.' };
  }
  if (nameIndexes.length > 1) {
    return { ok: false, error: 'The CSV has more than one "Name" column.' };
  }

  const enabledIndexes = headers.flatMap((header, index) => header === "enabled" ? [index] : []);
  if (enabledIndexes.length > 1) {
    return { ok: false, error: 'The CSV has more than one "Enabled" column.' };
  }

  const nameIndex = nameIndexes[0];
  const enabledIndex = enabledIndexes[0] ?? -1;
  const rows = records.slice(1).map(({ record, info }, index) => {
    const errors = [];
    if (record.length !== headers.length) {
      errors.push(`Expected ${headers.length} columns but found ${record.length}.`);
    }

    const name = String(record[nameIndex] ?? "").trim();
    if (!name) errors.push('"Name" is required.');

    let active = true;
    if (enabledIndex >= 0) {
      const enabled = parseEnabled(record[enabledIndex]);
      if (!enabled.ok) {
        errors.push('"Enabled" must be Yes/No, True/False, 1/0, Active/Inactive, or Enabled/Disabled.');
      } else {
        active = enabled.value;
      }
    }

    return {
      line: info.lines,
      rowNumber: index + 2,
      name,
      active,
      errors,
    };
  });

  return { ok: true, delimiter, rows };
}

/** Assign each parsed row a clear import outcome without mutating data. */
export function classifyProductRows(rows, existingNames = []) {
  const existing = new Set(existingNames.map(normalizeProductName));
  const seen = new Set();
  return rows.map((row) => {
    if (row.errors.length > 0) return { ...row, status: "invalid" };

    const key = normalizeProductName(row.name);
    if (seen.has(key)) return { ...row, status: "duplicate-file" };
    seen.add(key);
    if (existing.has(key)) return { ...row, status: "already-exists" };
    return { ...row, status: "ready" };
  });
}

export function summarizeProductRows(rows) {
  return rows.reduce((summary, row) => {
    summary.total += 1;
    if (row.status === "ready") summary.ready += 1;
    else if (row.status === "invalid") summary.invalid += 1;
    else if (row.status === "already-exists") summary.alreadyExists += 1;
    else if (row.status === "duplicate-file") summary.duplicateFile += 1;
    return summary;
  }, { total: 0, ready: 0, invalid: 0, alreadyExists: 0, duplicateFile: 0 });
}

function escapeCsv(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Export only product fields OrderIT stores, using Aronium's Enabled label. */
export function serializeProductCsv(products) {
  const rows = ["Name,Enabled"];
  for (const product of products) {
    rows.push(`${escapeCsv(product.name)},${product.active ? "TRUE" : "FALSE"}`);
  }
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}
