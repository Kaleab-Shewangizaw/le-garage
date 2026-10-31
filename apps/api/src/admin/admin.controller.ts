import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { OrganizationKind, Role } from "@le-garage/database";
import {
  adminUpdateStaffSchema,
  suspendOrganizationSchema,
  type AdminUpdateStaffInput,
  type SuspendOrganizationInput,
} from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Idempotent } from "../common/decorators/idempotent.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AdminService } from "./admin.service";

/** Cross-tenant platform console — PLATFORM_ADMIN only (docs/ADMIN.md). */
@Controller("admin")
@Roles(Role.PLATFORM_ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("overview")
  async overview() {
    return this.adminService.overview();
  }

  @Get("organizations")
  async listOrganizations(@Query("search") search?: string, @Query("kind") kind?: string) {
    const kindFilter = kind && kind in OrganizationKind ? (kind as OrganizationKind) : undefined;
    return this.adminService.listOrganizations(search, kindFilter);
  }

  @Get("organizations/:id")
  async getOrganization(@Param("id") id: string) {
    return this.adminService.getOrganization(id);
  }

  @Post("organizations/:id/suspend")
  @Idempotent()
  async suspend(
    @CurrentUser() user: AccessTokenPayload,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(suspendOrganizationSchema)) body: SuspendOrganizationInput,
  ) {
    return this.adminService.suspendOrganization(id, user.sub, body);
  }

  @Post("organizations/:id/reactivate")
  @Idempotent()
  async reactivate(@CurrentUser() user: AccessTokenPayload, @Param("id") id: string) {
    return this.adminService.reactivateOrganization(id, user.sub);
  }

  @Patch("staff/:staffId")
  async updateStaff(
    @CurrentUser() user: AccessTokenPayload,
    @Param("staffId") staffId: string,
    @Body(new ZodValidationPipe(adminUpdateStaffSchema)) body: AdminUpdateStaffInput,
  ) {
    return this.adminService.updateStaff(staffId, user.sub, body);
  }

  @Get("audit")
  async audit(
    @Query("organizationId") organizationId?: string,
    @Query("action") action?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.auditLog(organizationId, action, limit ? Number(limit) : undefined);
  }
}
