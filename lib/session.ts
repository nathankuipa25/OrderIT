import { cookies } from "next/headers";
import { SESSION_COOKIE, SessionPayload, signSession, verifySession } from "./auth";

export async function getSession(): Promise<SessionPayload | null> {
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
