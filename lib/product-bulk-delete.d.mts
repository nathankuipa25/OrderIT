export type BulkDeletionProduct = {
  id: string;
  name: string;
  _count?: { items?: number };
};

export type BulkDeletionTransaction = {
  findProducts: (ids: string[]) => Promise<BulkDeletionProduct[]>;
  deleteProducts: (ids: string[]) => Promise<{ count: number }>;
};

export type BulkDeletionResult =
  | { ok: true; status: 200; deleted: number }
  | { ok: false; status: 400 | 401 | 403 | 409; error: string };

export function bulkDeleteProducts(options: {
  session: { role?: string } | null | undefined;
  ids: unknown;
  transaction: (
    work: (tx: BulkDeletionTransaction) => Promise<number>
  ) => Promise<number>;
}): Promise<BulkDeletionResult>;
