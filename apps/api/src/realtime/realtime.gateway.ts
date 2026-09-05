import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type { AccessTokenPayload } from "@le-garage/types";

/**
 * Live updates only ever tell a client "something changed, go refetch" —
 * they never carry authoritative data themselves. The REST API remains
 * the single source of truth (docs/ARCHITECTURE.md §"Realtime"); this is
 * purely so a garage-web tab doesn't need to be manually refreshed to see
 * a job another staff member just moved forward.
 *
 * Auth: the same access token used for REST calls is passed in the
 * socket handshake (`auth.token`) and verified here — a socket that can't
 * present a valid token is disconnected immediately. Each connection
 * joins a room scoped to its organizationId, so a broadcast can never
 * reach a different tenant (docs/SECURITY.md §2).
 */
@WebSocketGateway({
  cors: { origin: process.env.CORS_ORIGIN?.split(",") ?? true, credentials: true },
  namespace: "/realtime",
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;
  private readonly logger = new Logger("RealtimeGateway");

  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) throw new Error("missing token");
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
      client.data.organizationId = payload.organizationId;
      await client.join(this.orgRoom(payload.organizationId));
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect() {
    // Nothing to clean up — room membership is torn down automatically by socket.io on disconnect.
  }

  emitJobChanged(organizationId: string, jobId: string): void {
    this.server?.to(this.orgRoom(organizationId)).emit("job:changed", { jobId });
  }

  emitBoardChanged(organizationId: string): void {
    this.server?.to(this.orgRoom(organizationId)).emit("board:changed", {});
  }

  private orgRoom(organizationId: string): string {
    return `org:${organizationId}`;
  }
}
