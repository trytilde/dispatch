import * as SecureStore from "expo-secure-store";

const controlOriginKey = "openbot.control-origin.v1";

export function loadControlOrigin(): Promise<string | null> {
  return SecureStore.getItemAsync(controlOriginKey);
}

export function saveControlOrigin(origin: string): Promise<void> {
  return SecureStore.setItemAsync(controlOriginKey, origin, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export function clearControlOrigin(): Promise<void> {
  return SecureStore.deleteItemAsync(controlOriginKey);
}
