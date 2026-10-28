export type MobileSessionIdentity = { sub: string; jti?: string };
export type MobileSessionRecord = {
  id: string;
  userId: string;
  expiresAt: Date | string;
  revokedAt: Date | string | null;
};
export function isMobileSessionActive(
  session: MobileSessionIdentity | null,
  findById: (jti: string) => Promise<MobileSessionRecord | null>,
  now?: number
): Promise<boolean>;
export function revokeMobileSession(
  session: MobileSessionIdentity | null,
  revokeOne: (identity: { id: string; userId: string }) => Promise<boolean>
): Promise<boolean>;
