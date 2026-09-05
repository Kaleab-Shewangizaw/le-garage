import { Injectable } from "@nestjs/common";
import type { OwnerEstimateDecisionInput } from "@le-garage/validation";
import { ApprovalsService } from "../approvals/approvals.service";
import { OwnerAccessService } from "./owner-access.service";

/**
 * The owner-app approval flow reuses ApprovalsService.create verbatim
 * (docs/OWNER-APP.md §"Approval flow", brief §2/§25 — don't duplicate
 * backend logic) rather than re-implementing the estimate-decision
 * transaction. The only owner-specific pieces are: access is verified
 * against CustomerLink instead of a staff role, `method` is always
 * IN_APP, and `decidedByCustomerId` is set to the *verified* linked
 * customer — the strongest form of approval evidence this system
 * records (brief §11: "the garage cannot silently add work").
 */
@Injectable()
export class OwnerEstimatesService {
  constructor(
    private readonly approvals: ApprovalsService,
    private readonly access: OwnerAccessService,
  ) {}

  async decide(ownerId: string, estimateId: string, input: OwnerEstimateDecisionInput) {
    const estimate = await this.access.assertEstimateAccess(ownerId, estimateId);

    return this.approvals.create(
      estimate.organizationId,
      estimateId,
      null,
      ownerId,
      { method: "IN_APP", note: input.note, itemDecisions: input.itemDecisions },
      estimate.job.customerId,
    );
  }
}
