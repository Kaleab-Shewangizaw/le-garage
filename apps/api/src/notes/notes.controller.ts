import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createJobNoteSchema, type CreateJobNoteInput } from "@le-garage/validation";
import type { AccessTokenPayload } from "@le-garage/types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { NotesService } from "./notes.service";

@Controller("jobs/:jobId/notes")
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  async list(@CurrentUser() user: AccessTokenPayload, @Param("jobId") jobId: string) {
    return this.notesService.list(user.organizationId, jobId);
  }

  @Post()
  async create(
    @CurrentUser() user: AccessTokenPayload,
    @Param("jobId") jobId: string,
    @Body(new ZodValidationPipe(createJobNoteSchema)) body: CreateJobNoteInput,
  ) {
    return this.notesService.create(user.organizationId, jobId, user.staffMemberId, user.sub, body);
  }
}
