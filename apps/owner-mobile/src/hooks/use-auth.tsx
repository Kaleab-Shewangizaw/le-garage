import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { tokenStore } from "@/lib/token-store";
import type { OwnerMe } from "@/lib/api-types";

interface AuthState {
  me: OwnerMe | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: { fullName: string; phone: string; email?: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  refetchMe: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<OwnerMe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const loadMe = useCallback(async () => {
    const accessToken = await tokenStore.getAccessToken();
    if (!accessToken) {
      setMe(null);
      return;
    }
    try {
      const user = await api.get<OwnerMe>("/owner/auth/me");
      setMe(user);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      await loadMe();
      if (!cancelled) setIsLoading(false);
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await api.post<{ accessToken: string; refreshToken: string }>("/owner/auth/login", { identifier, password });
      await tokenStore.setTokens(res.accessToken, res.refreshToken);
      await loadMe();
    },
    [loadMe],
  );

  const register = useCallback(
    async (input: { fullName: string; phone: string; email?: string; password: string }) => {
      const res = await api.post<{ accessToken: string; refreshToken: string }>("/owner/auth/register", input);
      await tokenStore.setTokens(res.accessToken, res.refreshToken);
      await loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    const refreshToken = await tokenStore.getRefreshToken();
    try {
      if (refreshToken) await api.post("/owner/auth/logout", { refreshToken });
    } catch {
      // Best-effort — clear local state regardless of whether the server call succeeded.
    }
    await tokenStore.clear();
    setMe(null);
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ me, isLoading, isAuthenticated: !!me, login, register, logout, refetchMe: loadMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
