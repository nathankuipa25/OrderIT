import { NativeModules, PermissionsAndroid, Platform } from "react-native";

const mediaStore = NativeModules.ShopMediaStore as {
  savePng(uri: string, filename: string): Promise<string>;
} | undefined;

function safeFilename(value: string): string {
  return `${value.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.png$/i, "") || "order"}.png`;
}

export async function saveOrderImage(uri: string, filename: string): Promise<string> {
  if (Platform.OS !== "android" || !mediaStore) throw new Error("Saving order images is not available on this device.");
  if (Number(Platform.Version) < 29) {
    const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE, {
      title: "Save order image",
      message: "Allow Shop Orders to save a copy of this order in Pictures.",
      buttonPositive: "Allow",
      buttonNegative: "Not now",
    });
    if (permission !== PermissionsAndroid.RESULTS.GRANTED) throw new Error("Storage permission is needed to save order images.");
  }
  return mediaStore.savePng(uri, safeFilename(filename));
}
