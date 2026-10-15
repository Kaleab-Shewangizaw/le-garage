import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const ACCESS_KEY = "legarage.owner.accessToken";
const REFRESH_KEY = "legarage.owner.refreshToken";

/**
 * expo-secure-store backs onto iOS Keychain / Android Keystore — never
 * plain storage — since these tokens are bearer credentials
 * (docs/OWNER-APP.md §"Security", brief §24: "never rely on the mobile
 * app for authorization," but the tokens still deserve real protection at
 * rest). expo-secure-store has no web implementation at all, so web (used
 * only for local dev preview, never shipped) falls back to localStorage.
 */
const getItem = (key: string) =>
  Platform.OS === "web" ? Promise.resolve(localStorage.getItem(key)) : SecureStore.getItemAsync(key);

const setItem = (key: string, value: string) =>
  Platform.OS === "web" ? Promise.resolve(localStorage.setItem(key, value)) : SecureStore.setItemAsync(key, value);

const deleteItem = (key: string) =>
  Platform.OS === "web" ? Promise.resolve(localStorage.removeItem(key)) : SecureStore.deleteItemAsync(key);

export const tokenStore = {
  async getAccessToken() {
    return getItem(ACCESS_KEY);
  },
  async getRefreshToken() {
    return getItem(REFRESH_KEY);
  },
  async setTokens(accessToken: string, refreshToken: string) {
    await Promise.all([setItem(ACCESS_KEY, accessToken), setItem(REFRESH_KEY, refreshToken)]);
  },
  async clear() {
    await Promise.all([deleteItem(ACCESS_KEY), deleteItem(REFRESH_KEY)]);
  },
};
