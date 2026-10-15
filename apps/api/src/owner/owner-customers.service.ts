import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppError } from "../common/errors/app-error";
import { AuditService } from "../audit/audit.service";
import { OwnerAccessService } from "./owner-access.service";

/**
 * Connecting an owner-mobile identity to garage-side Customer records
 * (docs/OWNER-APP.md §"Owner/garage relationship", resolving
 * docs/OPEN_QUESTIONS.md #3). Matched by phone number, never auto-merged —
 * `matches()` only *surfaces* candidates; `confirm()` is the explicit,
 * owner-initiated action that actually creates the link.
 */
@Injectable()
export class OwnerCustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: OwnerAccessService,
  ) {}

  /** Customer records across any organization matching this owner's own phone, not yet linked. */
  async matches(ownerId: string) {
    const user = await this.prisma.unscopedClient.user.findUnique({ where: { id: ownerId } });
    if (!user?.phone) return [];

    const [alreadyLinked, candidates] = await Promise.all([
      this.access.linkedCustomerIds(ownerId),
      this.prisma.unscopedClient.customer.findMany({
        where: { phone: user.phone, deletedAt: null },
        include: { organization: { include: { garage: true } } },
      }),
    ]);
    const linkedSet = new Set(alreadyLinked);

    return candidates
      .filter((c) => !linkedSet.has(c.id))
      .map((c) => ({
        customerId: c.id,
        organizationId: c.organizationId,
        customerFullName: c.fullName,
        garageName: c.organization.garage?.name ?? c.organization.name,
      }));
  }

  async myLinks(ownerId: string) {
    const links = await this.prisma.unscopedClient.customerLink.findMany({
      where: { userId: ownerId },
      include: { customer: { include: { organization: { include: { garage: true } } } } },
    });
    return links.map((l) => ({
      customerId: l.customerId,
      organizationId: l.organizationId,
      customerFullName: l.customer.fullName,
      garageName: l.customer.organization.garage?.name ?? l.customer.organization.name,
      linkedAt: l.createdAt,
    }));
  }

  async confirm(ownerId: string, customerId: string) {
    const user = await this.prisma.unscopedClient.user.findUnique({ where: { id: ownerId } });
    const customer = await this.prisma.unscopedClient.customer.findFirst({
      where: { id: customerId, deletedAt: null },
    });
    if (!customer) {
      throw AppError.notFound("CUSTOMER_NOT_FOUND", "Customer record not found");
    }
    // The phone match is the trust boundary here (docs/OPEN_QUESTIONS.md
    // #3) — without it, any owner could link themselves to any garage's
    // customer just by knowing/guessing a customerId.
    if (!user?.phone || user.phone !== customer.phone) {
      throw AppError.forbidden(
        "PHONE_DOES_NOT_MATCH",
        "This customer record's phone number doesn't match your account",
      );
    }

    const link = await this.prisma.unscopedClient.customerLink.upsert({
      where: { userId_customerId: { userId: ownerId, customerId } },
      update: {},
      create: { userId: ownerId, customerId, organizationId: customer.organizationId },
    });

    await this.audit.record({
      organizationId: customer.organizationId,
      entityType: "CustomerLink",
      entityId: link.id,
      action: "OWNER_CUSTOMER_LINK_CONFIRMED",
      actorUserId: ownerId,
      afterState: { customerId, organizationId: customer.organizationId },
    });

    return link;
  }
}
