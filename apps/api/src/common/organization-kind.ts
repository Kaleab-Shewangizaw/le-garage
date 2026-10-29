import { OrganizationKind } from "@le-garage/database";
import type { PrismaService } from "./prisma/prisma.service";
import { AppError } from "./errors/app-error";

/**
 * Which side of a repair this tenant sits on (docs/FLEET.md). Read from
 * the database per request rather than carried in the JWT, so existing
 * tokens keep working and a kind can never be spoofed or go stale.
 * Organization is the tenant root itself (not a tenant-scoped model), and
 * the id comes from a verified token, so a by-id lookup is safe here.
 */
export async function getOrganizationKind(prisma: PrismaService, organizationId: string): Promise<OrganizationKind> {
  const organization = await prisma.client.organization.findUnique({
    where: { id: organizationId },
    select: { kind: true },
  });
  if (!organization) {
    throw AppError.notFound("ORGANIZATION_NOT_FOUND", "Organization not found");
  }
  return organization.kind;
}
