import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";

/**
 * The fleet-maintenance vertical slice (docs/FLEET.md): a company reports
 * a problem on one of its own vehicles, a garage's estimate is approved by
 * a fleet manager (and only a fleet manager), the repair is tracked to
 * completion with final costs, and the vehicle's availability, history,
 * and spend report reflect it. Also covers the isolation and input
 * validation guarantees the pilot depends on. Requires Postgres (see
 * docs/DEVELOPMENT.md) — MinIO is not needed.
 */
describe("Fleet maintenance (docs/FLEET.md)", () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());

  type Session = { token: string; staffId: string };
  let owner: Session;
  let manager: Session;
  let coordinator: Session;
  let mechanic: Session;
  let otherFleet: Session;
  let garage: Session;
  let garageTech: Session;

  const auth = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

  async function registerOrg(kind: "FLEET" | "GARAGE", label: string): Promise<Session> {
    const suffix = randomUUID().slice(0, 8);
    const res = await api()
      .post("/api/v1/organizations")
      .send({
        kind,
        organizationName: `${label} ${suffix}`,
        ...(kind === "GARAGE" ? { garageName: `${label} Garage ${suffix}` } : {}),
        ownerFullName: `${label} Owner`,
        ownerEmail: `${label.toLowerCase().replace(/\s/g, "-")}-${suffix}@example.test`,
        password: "password123",
      })
      .expect(201);
    return { token: res.body.accessToken, staffId: res.body.context.staffMemberId };
  }

  async function invite(by: Session, role: string): Promise<Session> {
    const email = `${role.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`;
    const inv = await api()
      .post("/api/v1/staff/invite")
      .set(auth(by))
      .send({ fullName: `Fleet ${role}`, email, role, temporaryPassword: "password123" })
      .expect(201);
    const login = await api().post("/api/v1/auth/login").send({ identifier: email, password: "password123" }).expect(200);
    return { token: login.body.accessToken, staffId: inv.body.id };
  }

  async function createVehicle(by: Session, overrides: Record<string, unknown> = {}) {
    const res = await api()
      .post("/api/v1/vehicles")
      .set(auth(by))
      .send({
        licensePlate: `3-${randomUUID().slice(0, 5).toUpperCase()}`,
        make: "Isuzu",
        model: "FSR",
        year: 2019,
        vehicleType: "TRUCK",
        ...overrides,
      })
      .expect(201);
    return res.body as { id: string; status: string };
  }

  async function reportProblem(by: Session, vehicleId: string, extra: Record<string, unknown> = {}) {
    const res = await api()
      .post("/api/v1/jobs")
      .set(auth(by))
      .send({ vehicleId, complaint: "Overheating on long routes", mileageAtIntake: 182000, ...extra })
      .expect(201);
    return res.body as { id: string; customerId: string | null; serviceProviderId: string | null };
  }

  async function moveTo(by: Session, jobId: string, toStatus: string, expected = 200) {
    return api().patch(`/api/v1/jobs/${jobId}/status`).set(auth(by)).send({ toStatus }).expect(expected);
  }

  /** Estimate with two lines, sent, and the job moved to WAITING_APPROVAL. */
  async function submitEstimateForApproval(jobId: string) {
    await moveTo(coordinator, jobId, "DIAGNOSING");
    const estimate = await api()
      .post(`/api/v1/jobs/${jobId}/estimates`)
      .set(auth(coordinator))
      .send({
        items: [
          { type: "PART", description: "Radiator", quantity: 1, unitPrice: 1_800_000 },
          { type: "LABOR", description: "Replace radiator and flush coolant", quantity: 1, unitPrice: 350_000 },
        ],
      })
      .expect(201);
    await api().post(`/api/v1/jobs/${jobId}/estimates/${estimate.body.id}/send`).set(auth(coordinator)).expect(201);
    await moveTo(coordinator, jobId, "WAITING_APPROVAL");
    return estimate.body as { id: string; items: [{ id: string; type: string }, { id: string; type: string }] };
  }

  const getVehicle = async (by: Session, id: string) =>
    (await api().get(`/api/v1/vehicles/${id}`).set(auth(by)).expect(200)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();

    owner = await registerOrg("FLEET", "Fleet A");
    manager = await invite(owner, "MANAGER");
    coordinator = await invite(owner, "FRONT_DESK");
    mechanic = await invite(owner, "TECHNICIAN");
    otherFleet = await registerOrg("FLEET", "Fleet B");
    garage = await registerOrg("GARAGE", "Garage C");
    garageTech = await invite(garage, "TECHNICIAN");
  });

  afterAll(async () => {
    await app.close();
  });

  it("identifies the organization as a fleet in /auth/me", async () => {
    const me = await api().get("/api/v1/auth/me").set(auth(manager)).expect(200);
    expect(me.body.staffMember.organization.kind).toBe("FLEET");
    expect(me.body.staffMember.role).toBe("MANAGER");
  });

  it("walks a repair from reported problem to manager approval, completion, history, and spend", async () => {
    const provider = await api()
      .post("/api/v1/service-providers")
      .set(auth(coordinator))
      .send({ name: "Kality Truck Service", phone: "+251911223344" })
      .expect(201);

    const vehicle = await createVehicle(coordinator);
    expect(vehicle.status).toBe("ACTIVE");

    // 1. Report a problem — no customer; the vehicle goes into maintenance.
    const job = await reportProblem(coordinator, vehicle.id, { serviceProviderId: provider.body.id });
    expect(job.customerId).toBeNull();
    expect(job.serviceProviderId).toBe(provider.body.id);
    expect((await getVehicle(manager, vehicle.id)).status).toBe("IN_MAINTENANCE");

    // 2. Diagnosis + estimate submitted for approval.
    const estimate = await submitEstimateForApproval(job.id);
    await api()
      .post(`/api/v1/jobs/${job.id}/diagnoses`)
      .set(auth(mechanic))
      .send({ observedProblem: "Radiator core leaking", severity: "HIGH" })
      .expect(201);

    const [partItem, laborItem] = estimate.items;
    const decisions = [
      { estimateItemId: partItem.id, decision: "APPROVED" },
      { estimateItemId: laborItem.id, decision: "APPROVED" },
    ];

    // 3. Only an owner/manager may approve spend.
    const byCoordinator = await api()
      .post(`/api/v1/estimates/${estimate.id}/approvals`)
      .set(auth(coordinator))
      .send({ method: "STAFF_DECISION", itemDecisions: decisions })
      .expect(403);
    expect(byCoordinator.body.error.code).toBe("APPROVER_ROLE_REQUIRED");
    await api()
      .post(`/api/v1/estimates/${estimate.id}/approvals`)
      .set(auth(mechanic))
      .send({ method: "STAFF_DECISION", itemDecisions: decisions })
      .expect(403);
    const wrongMethod = await api()
      .post(`/api/v1/estimates/${estimate.id}/approvals`)
      .set(auth(manager))
      .send({ method: "VERBAL_LOGGED_BY_STAFF", note: "ok", itemDecisions: decisions })
      .expect(400);
    expect(wrongMethod.body.error.code).toBe("INVALID_APPROVAL_METHOD");

    // A fleet's internal repair costs never go out on an unauthenticated public link.
    const share = await api().post(`/api/v1/jobs/${job.id}/estimates/${estimate.id}/share`).set(auth(owner)).expect(409);
    expect(share.body.error.code).toBe("SHARE_NOT_AVAILABLE");

    const approval = await api()
      .post(`/api/v1/estimates/${estimate.id}/approvals`)
      .set(auth(manager))
      .send({ method: "STAFF_DECISION", note: "Within budget", itemDecisions: decisions })
      .expect(201);
    expect(approval.body.decidedByStaffId).toBe(manager.staffId);
    expect(approval.body.loggedByStaffId).toBeNull();

    // Approval moves the repair forward on its own, and records who approved.
    const approvedJob = await api().get(`/api/v1/jobs/${job.id}`).set(auth(owner)).expect(200);
    expect(approvedJob.body.status).toBe("APPROVED");
    expect(approvedJob.body.approvals[0].decidedByStaff.user.fullName).toBe("Fleet MANAGER");
    expect(approvedJob.body.serviceProvider.name).toBe("Kality Truck Service");

    // 4. Repair progress.
    await moveTo(manager, job.id, "IN_PROGRESS");
    await moveTo(manager, job.id, "QUALITY_CHECK");
    await moveTo(manager, job.id, "READY");

    // 5. Final costs from the provider's bill → issued invoice → partial payment.
    await api()
      .post(`/api/v1/jobs/${job.id}/parts`)
      .set(auth(coordinator))
      .send({ name: "Radiator", quantity: 1, unitPrice: 1_750_000, warrantyMonths: 12 })
      .expect(201);
    await api()
      .post(`/api/v1/jobs/${job.id}/labor`)
      .set(auth(coordinator))
      .send({ description: "Radiator replacement", amount: 350_000 })
      .expect(201);
    const draft = await api()
      .post(`/api/v1/jobs/${job.id}/invoices`)
      .set(auth(coordinator))
      .send({ taxTotal: 0, discountTotal: 0 })
      .expect(201);
    expect(draft.body.total).toBe(2_100_000);
    expect(draft.body.items.map((i: { type: string }) => i.type).sort()).toEqual(["LABOR", "PART"]);
    const issued = await api()
      .post(`/api/v1/jobs/${job.id}/invoices/${draft.body.id}/issue`)
      .set(auth(coordinator))
      .expect(201);
    await api()
      .post(`/api/v1/invoices/${issued.body.id}/payments`)
      .set(auth(coordinator))
      .send({ amount: 1_000_000, method: "BANK_TRANSFER", reference: "CBE-0042" })
      .expect(201);

    // 6. Returned to service → closed, vehicle active again, history recorded.
    await moveTo(manager, job.id, "COLLECTED");
    const closed = await api().get(`/api/v1/jobs/${job.id}`).set(auth(owner)).expect(200);
    expect(closed.body.status).toBe("CLOSED");
    expect((await getVehicle(manager, vehicle.id)).status).toBe("ACTIVE");

    const history = await api().get(`/api/v1/vehicles/${vehicle.id}/service-history`).set(auth(manager)).expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].summary.invoice).toMatchObject({ total: 2_100_000, amountPaid: 1_000_000, balance: 1_100_000 });
    expect(history.body[0].summary.diagnoses[0].severity).toBe("HIGH");

    // 7. Spend report reflects exactly what was recorded.
    const from = new Date(Date.now() - 24 * 3600_000).toISOString();
    const to = new Date(Date.now() + 24 * 3600_000).toISOString();
    const report = await api().get(`/api/v1/reports/spend?from=${from}&to=${to}`).set(auth(manager)).expect(200);
    const row = report.body.perVehicle.find((r: { vehicleId: string }) => r.vehicleId === vehicle.id);
    expect(row).toMatchObject({ invoicedTotal: 2_100_000, paidTotal: 1_000_000, partsTotal: 1_750_000, laborTotal: 350_000, repairsOpened: 1 });
    expect(row.downtimeHours).toBeGreaterThanOrEqual(0);
    expect(report.body.byProvider).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Kality Truck Service", invoicedTotal: 2_100_000, invoices: 1 })]),
    );
    expect(report.body.totals.completedRepairs).toBeGreaterThanOrEqual(1);
    expect(report.body.totals.averageTurnaroundHours).not.toBeNull();
  });

  it("keeps a rejected estimate from unlocking the repair, and frees the vehicle when cancelled", async () => {
    const vehicle = await createVehicle(coordinator);
    const job = await reportProblem(coordinator, vehicle.id);
    const estimate = await submitEstimateForApproval(job.id);

    await api()
      .post(`/api/v1/estimates/${estimate.id}/approvals`)
      .set(auth(owner))
      .send({
        method: "STAFF_DECISION",
        note: "Too expensive — get a second quote",
        itemDecisions: estimate.items.map((i) => ({ estimateItemId: i.id, decision: "REJECTED" })),
      })
      .expect(201);

    const after = await api().get(`/api/v1/jobs/${job.id}`).set(auth(owner)).expect(200);
    expect(after.body.status).toBe("WAITING_APPROVAL");
    expect(after.body.estimates[0].status).toBe("REJECTED");

    const forced = await moveTo(coordinator, job.id, "APPROVED", 409);
    expect(forced.body.error.code).toBe("APPROVAL_REQUIRED");

    await moveTo(coordinator, job.id, "CANCELLED");
    expect((await getVehicle(manager, vehicle.id)).status).toBe("ACTIVE");
  });

  it("never lets an approval of an earlier estimate version unlock a revised one", async () => {
    const res = await api()
      .post("/api/v1/jobs")
      .set(auth(garage))
      .send({
        newCustomer: { fullName: "Stale Approval Customer", phone: "+251911000777" },
        newVehicle: { licensePlate: `AA-${randomUUID().slice(0, 5)}`, make: "Toyota", model: "Vitz" },
        complaint: "Noise",
      })
      .expect(201);
    const jobId = res.body.id;
    await moveTo(garage, jobId, "DIAGNOSING");
    const v1 = await api()
      .post(`/api/v1/jobs/${jobId}/estimates`)
      .set(auth(garage))
      .send({ items: [{ type: "LABOR", description: "Inspection", unitPrice: 50_000 }] })
      .expect(201);
    await api().post(`/api/v1/jobs/${jobId}/estimates/${v1.body.id}/send`).set(auth(garage)).expect(201);
    await moveTo(garage, jobId, "WAITING_APPROVAL");
    await api()
      .post(`/api/v1/estimates/${v1.body.id}/approvals`)
      .set(auth(garage))
      .send({ method: "PHONE", note: "Approved on call", itemDecisions: [{ estimateItemId: v1.body.items[0].id, decision: "APPROVED" }] })
      .expect(201);

    // Scope changes before the job is marked approved: a bigger v2 is sent.
    await moveTo(garage, jobId, "DIAGNOSING");
    const v2 = await api()
      .post(`/api/v1/jobs/${jobId}/estimates`)
      .set(auth(garage))
      .send({ items: [{ type: "PART", description: "Gearbox", unitPrice: 9_000_000 }] })
      .expect(201);
    await api().post(`/api/v1/jobs/${jobId}/estimates/${v2.body.id}/send`).set(auth(garage)).expect(201);
    await moveTo(garage, jobId, "WAITING_APPROVAL");

    const res2 = await moveTo(garage, jobId, "APPROVED", 409);
    expect(res2.body.error.code).toBe("APPROVAL_REQUIRED");
  });

  it("isolates one fleet company's vehicles, repairs, providers, approvals, and spend from another's", async () => {
    const provider = await api().post("/api/v1/service-providers").set(auth(owner)).send({ name: "Private Provider" }).expect(201);
    const vehicle = await createVehicle(owner);
    const job = await reportProblem(owner, vehicle.id, { serviceProviderId: provider.body.id });
    const estimate = await submitEstimateForApproval(job.id);

    await api().get(`/api/v1/jobs/${job.id}`).set(auth(otherFleet)).expect(404);
    await api().get(`/api/v1/vehicles/${vehicle.id}`).set(auth(otherFleet)).expect(404);
    await api().get(`/api/v1/vehicles/${vehicle.id}/service-history`).set(auth(otherFleet)).expect(404);
    await api().get(`/api/v1/service-providers/${provider.body.id}`).set(auth(otherFleet)).expect(404);
    await api()
      .patch(`/api/v1/service-providers/${provider.body.id}`)
      .set(auth(otherFleet))
      .send({ name: "Hijacked" })
      .expect(404);
    await api()
      .post(`/api/v1/estimates/${estimate.id}/approvals`)
      .set(auth(otherFleet))
      .send({ method: "STAFF_DECISION", itemDecisions: [{ estimateItemId: estimate.items[0].id, decision: "APPROVED" }] })
      .expect(404);
    await moveTo(otherFleet, job.id, "CANCELLED", 404);

    // Can't open a repair on A's vehicle, or attach A's provider to B's own repair.
    await api().post("/api/v1/jobs").set(auth(otherFleet)).send({ vehicleId: vehicle.id, complaint: "x" }).expect(404);
    const bVehicle = await createVehicle(otherFleet);
    await api()
      .post("/api/v1/jobs")
      .set(auth(otherFleet))
      .send({ vehicleId: bVehicle.id, complaint: "x", serviceProviderId: provider.body.id })
      .expect(404);
    const bJob = await reportProblem(otherFleet, bVehicle.id);
    await api()
      .patch(`/api/v1/jobs/${bJob.id}/service-provider`)
      .set(auth(otherFleet))
      .send({ serviceProviderId: provider.body.id })
      .expect(404);

    // Lists and reports only ever contain the caller's own records.
    const bProviders = await api().get("/api/v1/service-providers").set(auth(otherFleet)).expect(200);
    expect(bProviders.body.map((p: { id: string }) => p.id)).not.toContain(provider.body.id);
    const bJobs = await api().get("/api/v1/jobs").set(auth(otherFleet)).expect(200);
    expect(bJobs.body.map((j: { id: string }) => j.id)).not.toContain(job.id);
    const summary = await api().get("/api/v1/reports/fleet-summary").set(auth(otherFleet)).expect(200);
    expect(summary.body.awaitingApproval.map((a: { jobId: string }) => a.jobId)).not.toContain(job.id);
    const from = new Date(Date.now() - 24 * 3600_000).toISOString();
    const to = new Date(Date.now() + 24 * 3600_000).toISOString();
    const bSpend = await api().get(`/api/v1/reports/spend?from=${from}&to=${to}`).set(auth(otherFleet)).expect(200);
    expect(bSpend.body.perVehicle.map((r: { vehicleId: string }) => r.vehicleId)).not.toContain(vehicle.id);
    expect(bSpend.body.totals.invoicedTotal).toBe(0);
  });

  it("restricts spend reports to owners/managers and vehicle status changes away from mechanics", async () => {
    const range = `from=${new Date(Date.now() - 3600_000).toISOString()}&to=${new Date().toISOString()}`;
    await api().get(`/api/v1/reports/spend?${range}`).set(auth(coordinator)).expect(403);
    await api().get(`/api/v1/reports/spend?${range}`).set(auth(mechanic)).expect(403);
    await api().get(`/api/v1/reports/spend?${range}`).set(auth(manager)).expect(200);
    await api().get("/api/v1/reports/fleet-summary").set(auth(coordinator)).expect(200);
    await api().get("/api/v1/reports/fleet-summary").set(auth(mechanic)).expect(403);

    const vehicle = await createVehicle(coordinator);
    await api().patch(`/api/v1/vehicles/${vehicle.id}`).set(auth(mechanic)).send({ status: "UNAVAILABLE" }).expect(403);
    await api().post("/api/v1/service-providers").set(auth(mechanic)).send({ name: "Nope Motors" }).expect(403);
  });

  it("keeps manual vehicle status decisions and blocks repairs on retired vehicles", async () => {
    const vehicle = await createVehicle(coordinator);
    await api().patch(`/api/v1/vehicles/${vehicle.id}`).set(auth(manager)).send({ status: "UNAVAILABLE" }).expect(200);
    // An open repair doesn't overwrite a manager's UNAVAILABLE call...
    const job = await reportProblem(coordinator, vehicle.id);
    expect((await getVehicle(manager, vehicle.id)).status).toBe("UNAVAILABLE");
    // ...and closing it doesn't silently put the vehicle back on the road.
    await moveTo(coordinator, job.id, "CANCELLED");
    expect((await getVehicle(manager, vehicle.id)).status).toBe("UNAVAILABLE");

    await api().patch(`/api/v1/vehicles/${vehicle.id}`).set(auth(manager)).send({ status: "RETIRED" }).expect(200);
    const retired = await api()
      .post("/api/v1/jobs")
      .set(auth(coordinator))
      .send({ vehicleId: vehicle.id, complaint: "Flat tyre" })
      .expect(409);
    expect(retired.body.error.code).toBe("VEHICLE_RETIRED");
  });

  it("rejects invalid fleet and garage inputs", async () => {
    const vehicle = await createVehicle(coordinator);

    const withCustomer = await api()
      .post("/api/v1/jobs")
      .set(auth(coordinator))
      .send({ vehicleId: vehicle.id, complaint: "x", newCustomer: { fullName: "Someone", phone: "+251911000000" } })
      .expect(400);
    expect(withCustomer.body.error.code).toBe("FLEET_JOB_HAS_NO_CUSTOMER");

    await api().post("/api/v1/jobs").set(auth(coordinator)).send({ vehicleId: vehicle.id, complaint: "" }).expect(400);
    await api()
      .post("/api/v1/jobs")
      .set(auth(coordinator))
      .send({ vehicleId: vehicle.id, complaint: "x", mileageAtIntake: -5 })
      .expect(400);
    await api().post("/api/v1/vehicles").set(auth(coordinator)).send({ licensePlate: "X", make: "A", model: "B" }).expect(400);
    await api()
      .post("/api/v1/vehicles")
      .set(auth(coordinator))
      .send({ licensePlate: "3-ABCDE", make: "A", model: "B", vehicleType: "SPACESHIP" })
      .expect(400);
    await api().post("/api/v1/service-providers").set(auth(coordinator)).send({ name: "A" }).expect(400);

    const job = await reportProblem(coordinator, vehicle.id);
    await moveTo(coordinator, job.id, "DIAGNOSING");
    await api()
      .post(`/api/v1/jobs/${job.id}/estimates`)
      .set(auth(coordinator))
      .send({ items: [{ type: "PART", description: "Pads", quantity: 1, unitPrice: -100 }] })
      .expect(400);
    await api()
      .post(`/api/v1/jobs/${job.id}/estimates`)
      .set(auth(coordinator))
      .send({ items: [{ type: "PART", description: "Pads", quantity: 0, unitPrice: 100 }] })
      .expect(400);

    await api().get("/api/v1/reports/spend?from=2026-10-10&to=2026-10-01").set(auth(manager)).expect(400);
    await api().get("/api/v1/reports/spend?from=2024-01-01&to=2026-01-01").set(auth(manager)).expect(400);
    await api().get("/api/v1/reports/spend?from=nonsense&to=2026-01-01").set(auth(manager)).expect(400);

    // Garage rules are unchanged: a customer is required, and providers/STAFF_DECISION are fleet-only.
    const noCustomer = await api()
      .post("/api/v1/jobs")
      .set(auth(garage))
      .send({ newVehicle: { licensePlate: "AA-99999", make: "Toyota", model: "Corolla" }, complaint: "x" })
      .expect(400);
    expect(noCustomer.body.error.code).toBe("CUSTOMER_REQUIRED");
    await api()
      .patch(`/api/v1/jobs/${job.id}/service-provider`)
      .set(auth(garage))
      .send({ serviceProviderId: null })
      .expect(400);
  });

  it("stops garage technicians from recording approvals, and rejects STAFF_DECISION for garages", async () => {
    const jobRes = await api()
      .post("/api/v1/jobs")
      .set(auth(garage))
      .send({
        newCustomer: { fullName: "Garage Customer", phone: "+251911000555" },
        newVehicle: { licensePlate: `AA-${randomUUID().slice(0, 5)}`, make: "Toyota", model: "Hilux" },
        complaint: "Brakes",
      })
      .expect(201);
    const jobId = jobRes.body.id;
    await moveTo(garage, jobId, "DIAGNOSING");
    const estimate = await api()
      .post(`/api/v1/jobs/${jobId}/estimates`)
      .set(auth(garage))
      .send({ items: [{ type: "PART", description: "Pads", unitPrice: 250_000 }] })
      .expect(201);
    await api().post(`/api/v1/jobs/${jobId}/estimates/${estimate.body.id}/send`).set(auth(garage)).expect(201);
    const itemDecisions = [{ estimateItemId: estimate.body.items[0].id, decision: "APPROVED" }];

    await api()
      .post(`/api/v1/estimates/${estimate.body.id}/approvals`)
      .set(auth(garageTech))
      .send({ method: "PHONE", note: "Customer said yes", itemDecisions })
      .expect(403);
    const staffDecision = await api()
      .post(`/api/v1/estimates/${estimate.body.id}/approvals`)
      .set(auth(garage))
      .send({ method: "STAFF_DECISION", itemDecisions })
      .expect(400);
    expect(staffDecision.body.error.code).toBe("INVALID_APPROVAL_METHOD");
  });

  it("allows the same VIN in two different organizations' registers", async () => {
    const vin = `VIN${randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase()}`;
    await createVehicle(owner, { vin });
    await createVehicle(otherFleet, { vin });
    // ...but still rejects a duplicate within one organization.
    await api()
      .post("/api/v1/vehicles")
      .set(auth(owner))
      .send({ licensePlate: "3-DUPLI", make: "Isuzu", model: "FSR", vin })
      .expect(409);
  });
});
