export const RESET_CONFIRMATION: "RESET PRODUCTS AND ORDERS";
export const RESET_BACKUP_FORMAT: "orderit-reset-backup";
export const RESET_BACKUP_TTL_MS: number;

export type ResetSnapshot = {
  products: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown> & { items?: Array<Record<string, unknown>> }>;
};
export function getResetAvailability(input: {
  nodeEnv: string;
  enabledFlag?: string;
  secretConfigured: boolean;
}): { available: true } | { available: false; reason: string };
export function getSnapshotDigest(snapshot: ResetSnapshot): string;
export function createResetBackup(
  snapshot: ResetSnapshot,
  secret: string,
  now?: number
): {
  token: string;
  backup: {
    format: string;
    version: number;
    createdAt: string;
    scope: {
      removed: string[];
      orderItems: string;
      preserved: string[];
    };
    counts: { products: number; orders: number; orderItems: number };
    snapshotSha256: string;
    data: ResetSnapshot;
  };
};
export type BackupVerification =
  | { ok: true }
  | { ok: false; status: 400 | 409; error: string };
export function verifyResetBackup(
  token: string,
  secret: string,
  currentSnapshot: ResetSnapshot,
  now?: number
): BackupVerification;
export function validateResetConfirmation(value: unknown): boolean;
export function validateBackupAcknowledgement(value: unknown): boolean;
export function executeScopedReset(tx: {
  order: { deleteMany(args: Record<string, never>): Promise<{ count: number }> };
  product: { deleteMany(args: Record<string, never>): Promise<{ count: number }> };
}): Promise<{ orders: number; products: number }>;
