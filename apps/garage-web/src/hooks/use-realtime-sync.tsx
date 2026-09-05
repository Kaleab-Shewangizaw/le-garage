"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { tokenStore } from "@/lib/token-store";
import { useAuth } from "@/hooks/use-auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";
// The REST base includes /api/v1; Socket.IO connects at the server origin
// and addresses its own namespace separately.
const SOCKET_ORIGIN = API_URL.replace(/\/api\/v1\/?$/, "");

/**
 * Live updates only ever mean "go refetch" (docs/ARCHITECTURE.md
 * §"Realtime") — every event here triggers a TanStack Query invalidation,
 * never writes data into the cache directly. Mounted once in the
 * authenticated app shell; renders nothing.
 */
export function RealtimeSync() {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket: Socket = io(`${SOCKET_ORIGIN}/realtime`, {
      // Called fresh on every (re)connect, so a rotated access token is
      // picked up automatically without tearing down/rebuilding the socket.
      auth: (cb) => cb({ token: tokenStore.getAccessToken() }),
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("job:changed", ({ jobId }: { jobId: string }) => {
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId] });
      queryClient.invalidateQueries({ queryKey: ["jobs", jobId, "events"] });
    });

    socket.on("board:changed", () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated, queryClient]);

  void connected; // reserved for a future "live" indicator; not surfaced yet to avoid UI noise
  return null;
}
