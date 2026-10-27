export type ParsedProductRow = {
  line: number;
  rowNumber: number;
  name: string;
  active: boolean;
  errors: string[];
};

export type ProductRowStatus = "invalid" | "duplicate-file" | "already-exists" | "ready";
export type ClassifiedProductRow = ParsedProductRow & { status: ProductRowStatus };

export type ProductRowSummary = {
  total: number;
  ready: number;
  invalid: number;
  alreadyExists: number;
  duplicateFile: number;
};

export type ProductCsvParseResult =
  | { ok: true; delimiter: string; rows: ParsedProductRow[] }
  | { ok: false; error: string };

export function parseProductCsv(input: unknown): ProductCsvParseResult;
export function classifyProductRows(
  rows: ParsedProductRow[],
  existingNames?: string[]
): ClassifiedProductRow[];
export function summarizeProductRows(rows: ClassifiedProductRow[]): ProductRowSummary;
export function serializeProductCsv(products: Array<{ name: string; active: boolean }>): string;
