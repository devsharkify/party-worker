import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const REFRESH_KEY = "pw_refresh";
const isWeb = Platform.OS === "web";

/**
 * Refresh-token storage. Native keeps it in the secure keychain; web never
 * stores it in JS — the API sets it as an httpOnly cookie.
 */
export const tokenStore = {
  async getRefresh(): Promise<string | null> {
    if (isWeb) return null;
    try {
      return await SecureStore.getItemAsync(REFRESH_KEY);
    } catch {
      return null;
    }
  },
  async setRefresh(token: string | null): Promise<void> {
    if (isWeb) return;
    if (token) await SecureStore.setItemAsync(REFRESH_KEY, token);
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  },
};
