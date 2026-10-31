"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccessTokenPayload } from "@le-garage/types";
import type { LoginInput, RegisterOrganizationInput } from "@le-garage/validation";
import { api } from "@/lib/api-client";
import { tokenStore } from "@/lib/token-store";
import type { Garage, Organization, StaffMember, StaffUser } from "@/lib/api-types";

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface MeResponse {
  user: StaffUser;
  staffMember: (StaffMember & { garage: Garage; organization: Organization }) | null;
}

interface AuthContextValue {
  user: AccessTokenPayload | null;
  me: MeResponse | undefined;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<void>;
  registerOrganization: (input: RegisterOrganizationInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AccessTokenPayload | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // `react-hooks/refs`-adjacent lint note: `useSyncExternalStore` would
    // be the textbook fit for syncing from `tokenStore`, but `getUser()`
    // decodes a fresh object on every call rather than returning a cached
    // snapshot reference — useSyncExternalStore requires a stable
    // reference when nothing changed, or it re-renders in a loop. Fixing
    // that means adding memoization to tokenStore itself; not worth the
    // risk to already-verified auth bootstrapping for a lint rule.
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setUser(tokenStore.getUser());
    setHydrated(true);
    return tokenStore.subscribe(() => setUser(tokenStore.getUser()));
  }, []);

  const meQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => api.get<MeResponse>("/auth/me"),
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  const login = useCallback(async (input: LoginInput) => {
    const res = await api.post<TokenPair>("/auth/login", input);
    tokenStore.setTokens(res.accessToken, res.refreshToken);
  }, []);

  const registerOrganization = useCallback(async (input: RegisterOrganizationInput) => {
    const res = await api.post<TokenPair>("/organizations", input);
    tokenStore.setTokens(res.accessToken, res.refreshToken);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokenStore.getRefreshToken();
    tokenStore.clear();
    queryClient.clear();
    if (refreshToken) {
      try {
        await api.post("/auth/logout", { refreshToken });
      } catch {
        // best-effort — the client-side token is already cleared
      }
    }
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        user,
        me: meQuery.data,
        isAuthenticated: !!user,
        isLoading: !hydrated,
        login,
        registerOrganization,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
