import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createDiagnosisSchema, type CreateDiagnosisInput } from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { DiagnosesService } from "./diagnoses.service";

@Controller("jobs/:jobId/diagnoses")
export class DiagnosesController {
  constructor(private readonly diagnosesService: DiagnosesService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload, @Param("jobId") jobId: string) {
    return this.diagnosesService.list(user.organizationId, jobId);
  }

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Body(new ZodValidationPipe(createDiagnosisSchema)) body: CreateDiagnosisInput,
  ) {
    return this.diagnosesService.create(user.organizationId, jobId, user.staffMemberId, user.sub, body);
  }
}
