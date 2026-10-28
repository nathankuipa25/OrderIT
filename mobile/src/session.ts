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
