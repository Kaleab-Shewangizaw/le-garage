import type { AccessTokenPayload } from "@le-garage/types";

const ACCESS_KEY = "legarage.accessToken";
const REFRESH_KEY = "legarage.refreshToken";

type Listener = () => void;
const listeners = new Set<Listener>();

function decodePayload(token: string): AccessTokenPayload | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

/**
 * Minimal client-side token store (docs/AUTH.md §5). Access token kept in
 * memory + localStorage (so a refresh survives a tab reload); no cookies
 * in MVP, matching the API's stated auth transport. Not a full state
 * management library — this is deliberately small.
 */
export const tokenStore = {
  getAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(ACCESS_KEY);
  },
  getRefreshToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(REFRESH_KEY);
  },
  getUser(): AccessTokenPayload | null {
    const token = this.getAccessToken();
    return token ? decodePayload(token) : null;
  },
  setTokens(accessToken: string, refreshToken: string) {
    localStorage.setItem(ACCESS_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    listeners.forEach((l) => l());
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    listeners.forEach((l) => l());
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
