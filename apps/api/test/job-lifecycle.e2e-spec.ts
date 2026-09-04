import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";

/**
 * End-to-end walk through the vertical slice this phase implements:
 * intake -> diagnosis -> estimate -> send -> approval -> job APPROVED
 * (docs/MVP.md §1). Also asserts the guardrails that make the estimate/
 * approval trail trustworthy (docs/SECURITY.md §3).
 */
describe("Job lifecycle: intake through approval", () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();

    const suffix = randomUUID().slice(0, 8);
    const res = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .send({
        organizationName: `Lifecycle Org ${suffix}`,
        garageName: `Lifecycle Garage ${suffix}`,
        ownerFullName: "Lifecycle Owner",
        ownerEmail: `lifecycle-${suffix}@example.test`,
        password: "password123",
      })
      .expect(201);
    accessToken = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  it("walks a job from intake to APPROVED", async () => {
    const jobRes = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set(auth())
      .send({
        newCustomer: { fullName: "Test Customer", phone: "+251911223344" },
        newVehicle: { licensePlate: "AA-77777", make: "Toyota", model: "Corolla", year: 2018 },
        complaint: "Engine makes a knocking sound",
        mileageAtIntake: 42000,
      })
      .expect(201);
    const jobId = jobRes.body.id;
    expect(jobRes.body.status).toBe("INTAKE");

    // Cannot skip straight to WAITING_APPROVAL.
    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(auth())
      .send({ toStatus: "WAITING_APPROVAL" })
      .expect(409);

    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(auth())
      .send({ toStatus: "DIAGNOSING" })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/diagnoses`)
      .set(auth())
      .send({ observedProblem: "Rod knock on cold start", severity: "HIGH" })
      .expect(201);

    // Cannot request approval before an estimate is sent.
    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(auth())
      .send({ toStatus: "WAITING_APPROVAL" })
      .expect(409);

    const estimateRes = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/estimates`)
      .set(auth())
      .send({
        items: [
          { type: "PART", description: "Engine oil", quantity: 4, unitPrice: 300, discount: 0 },
          { type: "LABOR", description: "Diagnostics + oil change", quantity: 1, unitPrice: 500, discount: 0 },
        ],
        taxTotal: 0,
      })
      .expect(201);
    expect(estimateRes.body.status).toBe("DRAFT");
    expect(estimateRes.body.total).toBe(4 * 300 + 500);

    const estimateId = estimateRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/estimates/${estimateId}/send`)
      .set(auth())
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(auth())
      .send({ toStatus: "WAITING_APPROVAL" })
      .expect(200);

    // Cannot mark APPROVED before a customer decision exists.
    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(auth())
      .send({ toStatus: "APPROVED" })
      .expect(409);

    const itemsRes = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/estimates/latest`)
      .set(auth())
      .expect(200);
    const itemIds = itemsRes.body.items.map((i: { id: string }) => i.id);

    await request(app.getHttpServer())
      .post(`/api/v1/estimates/${estimateId}/approvals`)
      .set(auth())
      .send({
        method: "VERBAL_LOGGED_BY_STAFF",
        note: "Customer approved by phone",
        itemDecisions: itemIds.map((id: string) => ({ estimateItemId: id, decision: "APPROVED" })),
      })
      .expect(201);

    const approvedStatusRes = await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(auth())
      .send({ toStatus: "APPROVED" })
      .expect(200);
    expect(approvedStatusRes.body.status).toBe("APPROVED");

    const finalEstimate = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/estimates/latest`)
      .set(auth())
      .expect(200);
    expect(finalEstimate.body.status).toBe("APPROVED");

    const events = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/events`)
      .set(auth())
      .expect(200);
    expect(events.body.map((e: { toStatus: string }) => e.toStatus)).toEqual([
      "INTAKE",
      "DIAGNOSING",
      "WAITING_APPROVAL",
      "APPROVED",
    ]);
  });

  it("versions an estimate instead of mutating it once SENT", async () => {
    const jobRes = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set(auth())
      .send({
        newCustomer: { fullName: "Second Customer", phone: "+251911223355" },
        newVehicle: { licensePlate: "AA-88888", make: "Hyundai", model: "Accent" },
        complaint: "AC not cooling",
      })
      .expect(201);
    const jobId = jobRes.body.id;

    const v1 = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/estimates`)
      .set(auth())
      .send({ items: [{ type: "PART", description: "Refrigerant", quantity: 1, unitPrice: 1000, discount: 0 }], taxTotal: 0 })
      .expect(201);
    expect(v1.body.version).toBe(1);

    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/estimates/${v1.body.id}/send`)
      .set(auth())
      .expect(201);

    // Further changes create a new version rather than mutating the SENT one.
    const v2 = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/estimates`)
      .set(auth())
      .send({
        items: [{ type: "PART", description: "Refrigerant + compressor", quantity: 1, unitPrice: 3000, discount: 0 }],
        taxTotal: 0,
      })
      .expect(201);
    expect(v2.body.version).toBe(2);
    expect(v2.body.status).toBe("DRAFT");

    const allVersions = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/estimates`)
      .set(auth())
      .expect(200);
    expect(allVersions.body).toHaveLength(2);
    const v1AfterV2 = allVersions.body.find((e: { version: number }) => e.version === 1);
    expect(v1AfterV2.status).toBe("SENT");
    expect(v1AfterV2.items[0].description).toBe("Refrigerant");
  });
});
