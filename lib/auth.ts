import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "orderit_session";

export type Role = "ADMIN" | "SHOP";

export type SessionPayload = {
  sub: string; // user id
  role: Role;
  name: string;
};

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Generate one (e.g. `openssl rand -base64 32`) and add it to your environment variables."
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecretKey());
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (
      typeof payload.sub === "string" &&
      (payload.role === "ADMIN" || payload.role === "SHOP") &&
      typeof payload.name === "string"
    ) {
      return { sub: payload.sub, role: payload.role, name: payload.name };
    }
    return null;
  } catch {
    return null;
  }
}
