import * as Keychain from "react-native-keychain";
import type { ShopUser } from "./nativeStore";

const SERVICE = "com.orderit.shop.native-session";

export type NativeSession = { token: string; user: ShopUser };

export async function readNativeSession(): Promise<NativeSession | null> {
  const stored = await Keychain.getGenericPassword({ service: SERVICE });
  if (!stored) return null;
  try {
    const session = JSON.parse(stored.password) as NativeSession;
    if (typeof session.token !== "string" || !session.token || typeof session.user?.id !== "string" || session.user.role !== "SHOP") return null;
    return session;
  } catch {
    return null;
  }
}

export async function saveNativeSession(session: NativeSession): Promise<void> {
  await Keychain.setGenericPassword("shop", JSON.stringify(session), {
    service: SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearNativeSession(): Promise<void> {
  await Keychain.resetGenericPassword({ service: SERVICE });
}

export async function revokeNativeSession(token: string, apiBaseUrl: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/api/auth/mobile/logout`, {
    method: "POST",
    cache: "no-store",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) return; // Expired or already revoked; the token is no longer usable.
  if (!response.ok) throw new Error("The shop service could not confirm secure sign-out.");
}
