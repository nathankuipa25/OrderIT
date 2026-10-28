import { cookies, headers } from "next/headers";
import { prisma } from "./prisma";
import { SESSION_COOKIE, SessionPayload, signSession, verifyMobileSession, verifySession } from "./auth";
import { isMobileSessionActive } from "./mobile-session.mjs";

export async function getSession(): Promise<SessionPayload | null> {
  const authorization = headers().get("authorization");
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return null;
    const session = await verifyMobileSession(match[1]);
    if (!session) return null;
    const active = await isMobileSessionActive(session, (id) =>
      prisma.mobileSession.findUnique({
        where: { id },
        select: { id: true, userId: true, expiresAt: true, revokedAt: true },
      })
    );
    return active ? session : null;
  }
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** Call from a Route Handler response after building it, or use with `cookies().set` directly. */
export async function createSessionCookie(payload: SessionPayload) {
  const token = await signSession(payload);
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  };
}
