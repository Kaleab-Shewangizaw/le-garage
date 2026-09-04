import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { prisma, prismaUnscoped, type PrismaClient, type TenantScopedPrismaClient } from "@le-garage/database";

/**
 * Thin Nest wrapper around the shared, tenant-scope-guarded Prisma client
 * (@le-garage/database) so it participates in Nest's DI/lifecycle.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /** Tenant-scope-guarded client — use this everywhere by default. */
  readonly client: TenantScopedPrismaClient = prisma;

  /** Unguarded client — ONLY for identity->tenant bootstrapping in auth. See @le-garage/database's prismaUnscoped doc comment. */
  readonly unscopedClient: PrismaClient = prismaUnscoped;

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
