export async function isMobileSessionActive(session, findById, now = Date.now()) {
  if (!session || typeof session.sub !== "string" || typeof session.jti !== "string" || !session.jti) return false;
  const record = await findById(session.jti);
  if (!record || record.id !== session.jti || record.userId !== session.sub || record.revokedAt != null) return false;
  const expiresAt = record.expiresAt instanceof Date ? record.expiresAt.getTime() : Date.parse(record.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export async function revokeMobileSession(session, revokeOne) {
  if (!session || typeof session.sub !== "string" || typeof session.jti !== "string" || !session.jti) return false;
  return Boolean(await revokeOne({ id: session.jti, userId: session.sub }));
}
