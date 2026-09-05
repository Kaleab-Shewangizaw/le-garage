import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";

/**
 * The owner-mobile release-gate suite (docs/OWNER-APP.md, brief §33):
 * "Can an owner access another owner's vehicle/job/history? The answer
 * must always be no" — and the two token kinds (staff vs. owner) must
 * never be usable against one another's routes, not even by accident.
 */
describe("Owner app: auth, linking, and cross-owner isolation", () => {
  let app: INestApplication;
  let staffToken: string;

  async function registerOrg() {
    const suffix = randomUUID().slice(0, 8);
    const res = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .send({
        organizationName: `Owner Test Org ${suffix}`,
        garageName: `Owner Test Garage ${suffix}`,
        ownerFullName: "Garage Owner",
        ownerEmail: `garage-owner-${suffix}@example.test`,
        password: "password123",
      })
      .expect(201);
    return res.body.accessToken as string;
  }

  async function registerOwner(phone: string, fullName = "Test Driver") {
    const res = await request(app.getHttpServer())
      .post("/api/v1/owner/auth/register")
      .send({ fullName, phone, password: "password123" })
      .expect(201);
    return { accessToken: res.body.accessToken as string, refreshToken: res.body.refreshToken as string, userId: res.body.userId as string };
  }

  /** Full flow: staff creates a job+estimate for a customer with the given phone, and sends it. Returns the ids the test needs. */
  async function createSentEstimateForCustomer(token: string, phone: string) {
    const jobRes = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set({ Authorization: `Bearer ${token}` })
      .send({
        newCustomer: { fullName: "Phone Match Customer", phone },
        newVehicle: { licensePlate: `AA-${randomUUID().slice(0, 5)}`, make: "Toyota", model: "Corolla", year: 2019 },
        complaint: "Strange noise",
        mileageAtIntake: 50000,
      })
      .expect(201);
    const jobId = jobRes.body.id;

    const estimateRes = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/estimates`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ items: [{ type: "PART", description: "Brake pads", quantity: 1, unitPrice: 1000, discount: 0 }], taxTotal: 0 })
      .expect(201);
    const estimateId = estimateRes.body.id;
    const estimateItemId = estimateRes.body.items[0].id;

    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/estimates/${estimateId}/send`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(201);

    return { jobId, estimateId, estimateItemId, vehicleId: jobRes.body.vehicleId as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    staffToken = await registerOrg();
  });

  afterAll(async () => {
    await app.close();
  });

  it("registers, finds a phone-matched customer record, and confirms the link", async () => {
    const phone = `+2519${randomUUID().slice(0, 8)}`;
    const owner = await registerOwner(phone);

    // No garage record exists for this phone yet.
    const noMatches = await request(app.getHttpServer())
      .get("/api/v1/owner/customer-matches")
      .set({ Authorization: `Bearer ${owner.accessToken}` })
      .expect(200);
    expect(noMatches.body).toEqual([]);

    const { jobId, estimateId, estimateItemId, vehicleId } = await createSentEstimateForCustomer(staffToken, phone);

    const matches = await request(app.getHttpServer())
      .get("/api/v1/owner/customer-matches")
      .set({ Authorization: `Bearer ${owner.accessToken}` })
      .expect(200);
    expect(matches.body).toHaveLength(1);
    const customerId = matches.body[0].customerId as string;

    await request(app.getHttpServer())
      .post("/api/v1/owner/customer-links")
      .set({ Authorization: `Bearer ${owner.accessToken}` })
      .send({ customerId })
      .expect(201);

    // Vehicle and job are now visible.
    const vehicles = await request(app.getHttpServer())
      .get("/api/v1/owner/vehicles")
      .set({ Authorization: `Bearer ${owner.accessToken}` })
      .expect(200);
    expect(vehicles.body.map((v: { id: string }) => v.id)).toContain(vehicleId);

    await request(app.getHttpServer())
      .get(`/api/v1/owner/jobs/${jobId}`)
      .set({ Authorization: `Bearer ${owner.accessToken}` })
      .expect(200);

    // Approve the estimate as the owner — decidedByCustomerId must be set.
    const decision = await request(app.getHttpServer())
      .post(`/api/v1/owner/estimates/${estimateId}/decide`)
      .set({ Authorization: `Bearer ${owner.accessToken}` })
      .send({ itemDecisions: [{ estimateItemId, decision: "APPROVED" }] })
      .expect(201);
    expect(decision.body.method).toBe("IN_APP");
    expect(decision.body.decidedByCustomerId).toBe(customerId);

    const jobAfter = await request(app.getHttpServer())
      .get(`/api/v1/owner/jobs/${jobId}`)
      .set({ Authorization: `Bearer ${owner.accessToken}` })
      .expect(200);
    expect(jobAfter.body.estimates[0].status).toBe("APPROVED");
  });

  it("refuses to link a customer whose phone doesn't match the owner's account", async () => {
    const owner = await registerOwner(`+2519${randomUUID().slice(0, 8)}`);
    await createSentEstimateForCustomer(staffToken, `+2519${randomUUID().slice(0, 8)}`);

    // Grab any real customerId belonging to someone else via the staff API.
    const customersRes = await request(app.getHttpServer())
      .get("/api/v1/customers")
      .set({ Authorization: `Bearer ${staffToken}` })
      .expect(200);
    const someoneElsesCustomerId = customersRes.body[0].id;

    await request(app.getHttpServer())
      .post("/api/v1/owner/customer-links")
      .set({ Authorization: `Bearer ${owner.accessToken}` })
      .send({ customerId: someoneElsesCustomerId })
      .expect(403);
  });

  it("never lets one owner see another owner's vehicle, job, or estimate — by id, not just by list", async () => {
    const phoneA = `+2519${randomUUID().slice(0, 8)}`;
    const phoneB = `+2519${randomUUID().slice(0, 8)}`;
    const ownerA = await registerOwner(phoneA, "Owner A");
    const ownerB = await registerOwner(phoneB, "Owner B");

    const { jobId, estimateId, vehicleId } = await createSentEstimateForCustomer(staffToken, phoneA);
    const matches = await request(app.getHttpServer())
      .get("/api/v1/owner/customer-matches")
      .set({ Authorization: `Bearer ${ownerA.accessToken}` })
      .expect(200);
    await request(app.getHttpServer())
      .post("/api/v1/owner/customer-links")
      .set({ Authorization: `Bearer ${ownerA.accessToken}` })
      .send({ customerId: matches.body[0].customerId })
      .expect(201);

    // Owner A can see it.
    await request(app.getHttpServer())
      .get(`/api/v1/owner/vehicles/${vehicleId}`)
      .set({ Authorization: `Bearer ${ownerA.accessToken}` })
      .expect(200);

    // Owner B, who has no link to this customer at all, gets 404 — not
    // 403 — for every resource type, matching the staff tenant-isolation
    // convention (docs/SECURITY.md §2).
    await request(app.getHttpServer())
      .get(`/api/v1/owner/vehicles/${vehicleId}`)
      .set({ Authorization: `Bearer ${ownerB.accessToken}` })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/owner/jobs/${jobId}`)
      .set({ Authorization: `Bearer ${ownerB.accessToken}` })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/owner/estimates/${estimateId}/decide`)
      .set({ Authorization: `Bearer ${ownerB.accessToken}` })
      .send({ itemDecisions: [{ estimateItemId: randomUUID(), decision: "APPROVED" }] })
      .expect(404);

    // Owner B's own vehicle list is empty, not an error and not A's data.
    const bVehicles = await request(app.getHttpServer())
      .get("/api/v1/owner/vehicles")
      .set({ Authorization: `Bearer ${ownerB.accessToken}` })
      .expect(200);
    expect(bVehicles.body).toEqual([]);
  });

  it("keeps staff and owner sessions on strictly separate tokens", async () => {
    const owner = await registerOwner(`+2519${randomUUID().slice(0, 8)}`);

    // A staff token must not authenticate an owner route.
    await request(app.getHttpServer())
      .get("/api/v1/owner/vehicles")
      .set({ Authorization: `Bearer ${staffToken}` })
      .expect(401);

    // An owner token must not authenticate a staff route.
    await request(app.getHttpServer())
      .get("/api/v1/jobs")
      .set({ Authorization: `Bearer ${owner.accessToken}` })
      .expect(401);
  });

  it("rejects registering a duplicate identifier, and rejects wrong-password login", async () => {
    const phone = `+2519${randomUUID().slice(0, 8)}`;
    await registerOwner(phone);

    await request(app.getHttpServer())
      .post("/api/v1/owner/auth/register")
      .send({ fullName: "Dup", phone, password: "password123" })
      .expect(409);

    await request(app.getHttpServer())
      .post("/api/v1/owner/auth/login")
      .send({ identifier: phone, password: "wrong-password" })
      .expect(401);
  });

  it("rotates owner refresh tokens and revokes the family on reuse", async () => {
    const owner = await registerOwner(`+2519${randomUUID().slice(0, 8)}`);

    const refreshed = await request(app.getHttpServer())
      .post("/api/v1/owner/auth/refresh")
      .send({ refreshToken: owner.refreshToken })
      .expect(200);
    expect(refreshed.body.accessToken).toBeDefined();

    // Reusing the already-rotated token is a reuse-detection event, not a
    // normal auth failure (docs/AUTH.md §5) — same behavior as staff.
    await request(app.getHttpServer())
      .post("/api/v1/owner/auth/refresh")
      .send({ refreshToken: owner.refreshToken })
      .expect(401);

    // ...and the replacement token is now revoked too, since the whole
    // family gets burned on reuse.
    await request(app.getHttpServer())
      .post("/api/v1/owner/auth/refresh")
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });
});
