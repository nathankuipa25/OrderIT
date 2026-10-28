import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "orderit_session";
export const MOBILE_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type Role = "ADMIN" | "SHOP";

export type SessionPayload = {
  sub: string; // user id
  role: Role;
  name: string;
  jti?: string;
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

export async function signMobileSession(payload: SessionPayload, jti: string): Promise<string> {
  return new SignJWT({ ...payload, client: "native" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience("orderit-native")
    .setJti(jti)
    .setExpirationTime(`${MOBILE_SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());
}

export async function verifyMobileSession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { audience: "orderit-native" });
    if (
      payload.client === "native" &&
      typeof payload.sub === "string" &&
      (payload.role === "ADMIN" || payload.role === "SHOP") &&
      typeof payload.name === "string" &&
      typeof payload.jti === "string" &&
      payload.jti.length > 0
    ) {
      return { sub: payload.sub, role: payload.role, name: payload.name, jti: payload.jti };
    }
    return null;
  } catch {
    return null;
  }
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (payload.client === "native" || payload.aud !== undefined) return null;
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
