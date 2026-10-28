import { Platform } from "react-native";
import Constants from "expo-constants";

const configuredUrl = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? "http://localhost:4000/api/v1";

/**
 * The Android emulator can't reach the host machine via `localhost` — it
 * needs the special `10.0.2.2` alias. iOS simulator and web both resolve
 * `localhost` fine. A physical device needs the host's real LAN IP, set
 * via `EXPO_PUBLIC_API_URL` (docs/DEVELOPMENT.md).
 */
function resolveApiUrl(): string {
  const override = process.env.EXPO_PUBLIC_API_URL;
  if (override) return override;
  if (Platform.OS === "android" && configuredUrl.includes("localhost")) {
    return configuredUrl.replace("localhost", "10.0.2.2");
  }
  return configuredUrl;
}

export const API_URL = resolveApiUrl();
