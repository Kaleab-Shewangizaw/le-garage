import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "./common/decorators/public.decorator";
import { PrismaService } from "./common/prisma/prisma.service";

/**
 * Answers the two questions docs/OPEN_QUESTIONS.md / the pilot-readiness
 * brief actually need: "is Le Garage working?" and, if not, roughly
 * where. Deliberately not a full observability stack — one endpoint,
 * checked dependency by dependency.
 */
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(@Res() res: Response) {
    const checks: Record<string, "ok" | "error"> = { api: "ok", database: "ok" };

    try {
      // Unscoped by design: a raw connectivity probe, not a tenant-scoped read.
      await this.prisma.unscopedClient.$queryRaw`SELECT 1`;
    } catch {
      checks.database = "error";
    }

    const healthy = Object.values(checks).every((v) => v === "ok");
    res
      .status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
      .json({ status: healthy ? "ok" : "degraded", service: "le-garage-api", checks, timestamp: new Date().toISOString() });
  }
}
