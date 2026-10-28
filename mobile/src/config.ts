import { NativeModules } from "react-native";

export const DEFAULT_API_BASE_URL = "https://orderit-ruddy.vercel.app";

export async function getApiBaseUrl(): Promise<string> {
  try {
    const configured = await NativeModules.ShopAppConfig?.getApiBaseUrl?.();
    if (typeof configured === "string" && /^https:\/\//i.test(configured)) {
      return configured.replace(/\/+$/, "");
    }
  } catch {}
  return DEFAULT_API_BASE_URL;
}
