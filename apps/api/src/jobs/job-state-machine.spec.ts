import { JobStatus, Role } from "@le-garage/database";
import { findTransition } from "./job-state-machine";

describe("job state machine (docs/DOMAIN.md §5)", () => {
  it("allows INTAKE -> DIAGNOSING for any staff role", () => {
    const t = findTransition(JobStatus.INTAKE, JobStatus.DIAGNOSING);
    expect(t).toBeDefined();
    expect(t!.allowedRoles).toEqual(
      expect.arrayContaining([Role.OWNER, Role.MANAGER, Role.FRONT_DESK, Role.TECHNICIAN]),
    );
  });

  it("rejects skipping straight from INTAKE to READY", () => {
    expect(findTransition(JobStatus.INTAKE, JobStatus.READY)).toBeUndefined();
  });

  it("rejects moving out of a terminal state", () => {
    expect(findTransition(JobStatus.CANCELLED, JobStatus.DIAGNOSING)).toBeUndefined();
    expect(findTransition(JobStatus.CLOSED, JobStatus.READY)).toBeUndefined();
  });

  it("restricts READY -> COLLECTED to front-office roles (release/payment handling)", () => {
    const t = findTransition(JobStatus.READY, JobStatus.COLLECTED);
    expect(t).toBeDefined();
    expect(t!.allowedRoles).not.toContain(Role.TECHNICIAN);
  });

  it("allows a workshop role to send a job back from QUALITY_CHECK to IN_PROGRESS on failed QC", () => {
    const t = findTransition(JobStatus.QUALITY_CHECK, JobStatus.IN_PROGRESS);
    expect(t).toBeDefined();
    expect(t!.allowedRoles).toContain(Role.TECHNICIAN);
  });

  it("does not allow IN_PROGRESS to jump directly back to WAITING_APPROVAL", () => {
    // Mid-repair scope changes use a new Estimate/Approval, not a status
    // rollback (docs/DOMAIN.md §5) — the job can stay IN_PROGRESS while
    // that happens.
    expect(findTransition(JobStatus.IN_PROGRESS, JobStatus.WAITING_APPROVAL)).toBeUndefined();
  });
});
