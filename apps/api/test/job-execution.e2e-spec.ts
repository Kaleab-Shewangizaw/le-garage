import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";

/**
 * Covers the second half of the job lifecycle that docs/job-lifecycle
 * e2e-spec.ts stops short of: technician assignment/notes, parts, labor,
 * invoice generation/issue/void, payments, and the COLLECTED -> CLOSED
 * auto-finalization that writes a vehicle ServiceRecord
 * (docs/DOMAIN.md §5/§12, docs/MVP.md §1 "Complete job" step).
 */
describe("Job execution: technician work through service history", () => {
  let app: INestApplication;
  let ownerToken: string;
  let techToken: string;
  let techStaffId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();

    const suffix = randomUUID().slice(0, 8);
    const reg = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .send({
        organizationName: `Execution Org ${suffix}`,
        garageName: `Execution Garage ${suffix}`,
        ownerFullName: "Execution Owner",
        ownerEmail: `execution-${suffix}@example.test`,
        password: "password123",
      })
      .expect(201);
    ownerToken = reg.body.accessToken;

    const invite = await request(app.getHttpServer())
      .post("/api/v1/staff/invite")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        fullName: "Test Technician",
        email: `tech-${suffix}@example.test`,
        role: "TECHNICIAN",
        temporaryPassword: "password123",
      })
      .expect(201);
    techStaffId = invite.body.id;

    const techLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ identifier: `tech-${suffix}@example.test`, password: "password123" })
      .expect(200);
    techToken = techLogin.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const owner = () => ({ Authorization: `Bearer ${ownerToken}` });
  const tech = () => ({ Authorization: `Bearer ${techToken}` });

  it("walks a job from assignment through invoice, payment, collection, and service history", async () => {
    const jobRes = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set(owner())
      .send({
        newCustomer: { fullName: "Execution Customer", phone: "+251911998877" },
        newVehicle: { licensePlate: "AA-55555", make: "Isuzu", model: "NPR", year: 2016 },
        complaint: "Brakes squeal",
        mileageAtIntake: 120000,
      })
      .expect(201);
    const jobId = jobRes.body.id;
    const vehicleId = jobRes.body.vehicleId;

    // --- assignment ---
    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/assign`)
      .set(owner())
      .send({ staffMemberId: techStaffId })
      .expect(200);

    // Technician's "my jobs" list includes it.
    const mine = await request(app.getHttpServer())
      .get("/api/v1/jobs?mine=true")
      .set(tech())
      .expect(200);
    expect(mine.body.map((j: { id: string }) => j.id)).toContain(jobId);

    // --- diagnosis + technician note ---
    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(owner())
      .send({ toStatus: "DIAGNOSING" })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/diagnoses`)
      .set(tech())
      .send({ observedProblem: "Worn brake pads", severity: "MEDIUM" })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/notes`)
      .set(tech())
      .send({ note: "Test driving after pad replacement to confirm noise is gone" })
      .expect(201);

    // --- estimate, send, approve, move to APPROVED ---
    const estimate = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/estimates`)
      .set(owner())
      .send({
        items: [{ type: "PART", description: "Brake pads (front)", quantity: 1, unitPrice: 2500, discount: 0 }],
        taxTotal: 0,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/estimates/${estimate.body.id}/send`)
      .set(owner())
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(owner())
      .send({ toStatus: "WAITING_APPROVAL" })
      .expect(200);
    const itemId = estimate.body.items[0].id;
    await request(app.getHttpServer())
      .post(`/api/v1/estimates/${estimate.body.id}/approvals`)
      .set(owner())
      .send({ method: "VERBAL_LOGGED_BY_STAFF", note: "Approved by phone", itemDecisions: [{ estimateItemId: itemId, decision: "APPROVED" }] })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(owner())
      .send({ toStatus: "APPROVED" })
      .expect(200);

    // --- repair execution: parts + labor (technician-recorded) ---
    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(owner())
      .send({ toStatus: "IN_PROGRESS" })
      .expect(200);

    const partRes = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/parts`)
      .set(tech())
      .send({
        name: "Brake pads",
        partNumber: "BP-4421",
        brand: "Bosch",
        condition: "NEW",
        source: "GARAGE_SUPPLIED",
        quantity: 1,
        unitCost: 1800,
        unitPrice: 2500,
        warrantyMonths: 6,
      })
      .expect(201);
    expect(partRes.body.unitPrice).toBe(2500);

    const laborRes = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/labor`)
      .set(tech())
      .send({ description: "Replace front brake pads", technicianStaffId: techStaffId, hours: 1, rate: 500, amount: 500 })
      .expect(201);
    expect(laborRes.body.amount).toBe(500);

    // Technician cannot delete a financial line item (front-office only).
    await request(app.getHttpServer())
      .delete(`/api/v1/jobs/${jobId}/parts/${partRes.body.id}`)
      .set(tech())
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(owner())
      .send({ toStatus: "QUALITY_CHECK" })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(owner())
      .send({ toStatus: "READY", note: "Road tested, no more noise" })
      .expect(200);

    // --- invoice: generate from actual parts/labor, then issue ---
    const invoiceDraft = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/invoices`)
      .set(owner())
      .send({ taxTotal: 0, discountTotal: 0 })
      .expect(201);
    expect(invoiceDraft.body.status).toBe("DRAFT");
    expect(invoiceDraft.body.total).toBe(2500 + 500); // part + labor, no floats anywhere
    expect(invoiceDraft.body.version).toBe(1);

    const invoiceIssued = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/invoices/${invoiceDraft.body.id}/issue`)
      .set(owner())
      .expect(201);
    expect(invoiceIssued.body.status).toBe("ISSUED");
    const invoiceId = invoiceIssued.body.id;

    // Parts/labor are now locked — invoice accuracy is protected.
    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/parts`)
      .set(tech())
      .send({ name: "Extra part", unitPrice: 100 })
      .expect(409);

    // --- payments: partial, then remainder ---
    const partial = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(owner())
      .send({ amount: 2000, method: "CASH" })
      .expect(201);
    expect(partial.body.amount).toBe(2000);

    const balanceAfterPartial = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}/payments/balance`)
      .set(owner())
      .expect(200);
    expect(balanceAfterPartial.body.balance).toBe(1000);

    // Overpayment is rejected.
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(owner())
      .send({ amount: 5000, method: "TELEBIRR" })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set(owner())
      .send({ amount: 1000, method: "TELEBIRR", reference: "TX-99" })
      .expect(201);

    const balanceAfterFull = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoiceId}/payments/balance`)
      .set(owner())
      .expect(200);
    expect(balanceAfterFull.body.balance).toBe(0);

    // --- collection: triggers auto-close + service record ---
    const collected = await request(app.getHttpServer())
      .patch(`/api/v1/jobs/${jobId}/status`)
      .set(owner())
      .send({ toStatus: "COLLECTED" })
      .expect(200);
    // The job is auto-finalized straight to CLOSED (docs/DOMAIN.md §5).
    expect(collected.body.status).toBe("CLOSED");

    const events = await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/events`)
      .set(owner())
      .expect(200);
    expect(events.body.map((e: { toStatus: string }) => e.toStatus)).toEqual(
      expect.arrayContaining(["COLLECTED", "CLOSED"]),
    );

    const history = await request(app.getHttpServer())
      .get(`/api/v1/vehicles/${vehicleId}/service-history`)
      .set(owner())
      .expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0].mileage).toBe(120000);
    expect(history.body[0].summary.invoice.total).toBe(3000);
    expect(history.body[0].summary.invoice.balance).toBe(0);
    expect(history.body[0].summary.workPerformed.parts).toHaveLength(1);
    expect(history.body[0].summary.workPerformed.labor).toHaveLength(1);
  });

  it("blocks voiding an invoice that still has payments, and enforces tenant isolation on the new resources", async () => {
    const suffix = randomUUID().slice(0, 8);
    const regA = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .send({
        organizationName: `Void Org A ${suffix}`,
        garageName: `Void Garage A ${suffix}`,
        ownerFullName: "Owner A",
        ownerEmail: `voida-${suffix}@example.test`,
        password: "password123",
      })
      .expect(201);
    const regB = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .send({
        organizationName: `Void Org B ${suffix}`,
        garageName: `Void Garage B ${suffix}`,
        ownerFullName: "Owner B",
        ownerEmail: `voidb-${suffix}@example.test`,
        password: "password123",
      })
      .expect(201);
    const tokenA = regA.body.accessToken;
    const tokenB = regB.body.accessToken;

    const jobRes = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({
        newCustomer: { fullName: "Isolation Customer", phone: "+251911000099" },
        newVehicle: { licensePlate: "AA-66666", make: "Toyota", model: "Hilux" },
        complaint: "Oil change",
      })
      .expect(201);
    const jobId = jobRes.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/labor`)
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({ description: "Oil change", amount: 800 })
      .expect(201);

    const invoice = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/invoices`)
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({})
      .expect(201);
    const issued = await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/invoices/${invoice.body.id}/issue`)
      .set({ Authorization: `Bearer ${tokenA}` })
      .expect(201);

    // Org B cannot see or act on org A's job/invoice at all.
    await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}/invoices/latest`)
      .set({ Authorization: `Bearer ${tokenB}` })
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${issued.body.id}/payments`)
      .set({ Authorization: `Bearer ${tokenB}` })
      .send({ amount: 100, method: "CASH" })
      .expect(404);

    await request(app.getHttpServer())
      .post(`/api/v1/invoices/${issued.body.id}/payments`)
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({ amount: 800, method: "CASH" })
      .expect(201);

    // Cannot void an issued invoice that has payments recorded.
    await request(app.getHttpServer())
      .post(`/api/v1/jobs/${jobId}/invoices/${issued.body.id}/void`)
      .set({ Authorization: `Bearer ${tokenA}` })
      .send({ reason: "test" })
      .expect(409);
  });
});
