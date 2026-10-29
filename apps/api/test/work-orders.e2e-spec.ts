import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Work orders between two companies on Le Garage (docs/WORK-ORDERS.md): the
 * fleet sends a repair, the garage accepts and does the work in its own
 * account, the fleet approves and watches. Each side only ever reads its
 * own records; a third organization gets nothing. Needs Postgres + MinIO.
 */
describe("Work orders: fleet ↔ garage (docs/WORK-ORDERS.md)", () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  let fleet: { token: string; orgId: string; name: string };
  let garage: { token: string; orgId: string; name: string };
  let otherGarage: { token: string; orgId: string };
  let providerId: string;

  async function register(kind: "FLEET" | "GARAGE", label: string) {
    const suffix = randomUUID().slice(0, 6);
    const name = `${label} ${suffix}`;
    const res = await api()
      .post("/api/v1/organizations")
      .send({
        kind,
        organizationName: name,
        ...(kind === "GARAGE" ? { garageName: name, garagePhone: "+251911000999" } : {}),
        ownerFullName: `${label} Owner`,
        ownerEmail: `${label.toLowerCase().replace(/\s+/g, "-")}-${suffix}@example.test`,
        password: "password123",
      })
      .expect(201);
    return { token: res.body.accessToken as string, orgId: res.body.organization.id as string, name };
  }

  async function newRequest(complaint: string) {
    const vehicle = await api()
      .post("/api/v1/vehicles")
      .set(auth(fleet.token))
      .send({ licensePlate: `3-${randomUUID().slice(0, 5).toUpperCase()}`, make: "Isuzu", model: "NPR", vehicleType: "TRUCK" })
      .expect(201);
    const job = await api()
      .post("/api/v1/jobs")
      .set(auth(fleet.token))
      .send({ vehicleId: vehicle.body.id, complaint, mileageAtIntake: 150000, serviceProviderId: providerId })
      .expect(201);
    return { vehicleId: vehicle.body.id as string, fleetJobId: job.body.id as string };
  }

  const fleetJob = async (id: string) => (await api().get(`/api/v1/jobs/${id}`).set(auth(fleet.token)).expect(200)).body;
  const garageMove = (jobId: string, toStatus: string, expected = 200) =>
    api().patch(`/api/v1/jobs/${jobId}/status`).set(auth(garage.token)).send({ toStatus }).expect(expected);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
    fleet = await register("FLEET", "WO Fleet");
    garage = await register("GARAGE", "WO Garage");
    otherGarage = await register("GARAGE", "Other Garage");
  });

  afterAll(async () => {
    await app.close();
  });

  it("lets a fleet find a garage on Le Garage and connect it as a provider", async () => {
    const directory = await api().get(`/api/v1/service-providers/directory?search=${encodeURIComponent(garage.name)}`).set(auth(fleet.token)).expect(200);
    expect(directory.body).toEqual([expect.objectContaining({ organizationId: garage.orgId, name: garage.name, serviceProviderId: null })]);
    expect(Object.keys(directory.body[0]).sort()).toEqual(["address", "city", "name", "organizationId", "phone", "serviceProviderId"]);

    const provider = await api()
      .post("/api/v1/service-providers")
      .set(auth(fleet.token))
      .send({ name: garage.name, garageOrganizationId: garage.orgId })
      .expect(201);
    providerId = provider.body.id;
    await api().post("/api/v1/service-providers").set(auth(fleet.token)).send({ name: "Dup", garageOrganizationId: garage.orgId }).expect(409);
    await api().post("/api/v1/service-providers").set(auth(fleet.token)).send({ name: "Fake", garageOrganizationId: fleet.orgId }).expect(404);
  });

  it("runs a repair end to end: send → accept → garage works → fleet approves and watches → back in service", async () => {
    const { vehicleId, fleetJobId } = await newRequest("Alternator warning light on");

    // 1. Fleet sends it; the garage is notified (in-app + SMS/email via the dev log adapter).
    const sent = await api().post(`/api/v1/jobs/${fleetJobId}/work-order`).set(auth(fleet.token)).send({ message: "Needed back by Friday" }).expect(201);
    await api().post(`/api/v1/jobs/${fleetJobId}/work-order`).set(auth(fleet.token)).send({}).expect(409);
    const incoming = await api().get("/api/v1/work-orders?status=SENT").set(auth(garage.token)).expect(200);
    expect(incoming.body).toEqual([expect.objectContaining({ id: sent.body.id, side: "GARAGE", fleetName: fleet.name, complaint: "Alternator warning light on", jobId: null })]);
    const garageInbox = await api().get("/api/v1/notifications").set(auth(garage.token)).expect(200);
    expect(garageInbox.body[0].title).toContain(`New work order from ${fleet.name}`);

    // Nobody else can see or answer it.
    expect((await api().get("/api/v1/work-orders").set(auth(otherGarage.token)).expect(200)).body).toHaveLength(0);
    await api().post(`/api/v1/work-orders/${sent.body.id}/accept`).set(auth(otherGarage.token)).expect(404);
    await api().post(`/api/v1/work-orders/${sent.body.id}/accept`).set(auth(fleet.token)).expect(404);

    // 2. Garage accepts → its own job, filed under the fleet as customer.
    const accepted = await api().post(`/api/v1/work-orders/${sent.body.id}/accept`).set(auth(garage.token)).expect(201);
    const garageJobId = accepted.body.jobId as string;
    const gJob = (await api().get(`/api/v1/jobs/${garageJobId}`).set(auth(garage.token)).expect(200)).body;
    expect(gJob.customer.fullName).toBe(fleet.name);
    expect(gJob.complaint).toContain("Needed back by Friday");
    expect(gJob.workOrder).toMatchObject({ side: "GARAGE", partnerName: fleet.name, status: "ACCEPTED" });
    expect((await fleetJob(fleetJobId)).workOrder).toMatchObject({ side: "FLEET", partnerName: garage.name, status: "ACCEPTED" });

    // Each company still only reads its own job.
    await api().get(`/api/v1/jobs/${garageJobId}`).set(auth(fleet.token)).expect(404);
    await api().get(`/api/v1/jobs/${fleetJobId}`).set(auth(garage.token)).expect(404);

    // The fleet can't do the garage's part any more.
    const locked = await api()
      .post(`/api/v1/jobs/${fleetJobId}/estimates`)
      .set(auth(fleet.token))
      .send({ items: [{ type: "PART", description: "x", unitPrice: 1 }] })
      .expect(409);
    expect(locked.body.error.code).toBe("HANDLED_BY_GARAGE");
    await api().patch(`/api/v1/jobs/${fleetJobId}/status`).set(auth(fleet.token)).send({ toStatus: "DIAGNOSING" }).expect(409);
    await api().post(`/api/v1/jobs/${fleetJobId}/parts`).set(auth(fleet.token)).send({ name: "x", unitPrice: 1 }).expect(409);

    // 3. Garage diagnoses, photographs, and sends an estimate.
    await garageMove(garageJobId, "DIAGNOSING");
    await api().post(`/api/v1/jobs/${garageJobId}/diagnoses`).set(auth(garage.token)).send({ observedProblem: "Regulator failed", severity: "MEDIUM" }).expect(201);
    const presign = await api()
      .post("/api/v1/files/presign")
      .set(auth(garage.token))
      .send({ entityType: "JOB", entityId: garageJobId, fileName: "alt.png", mimeType: "image/png", sizeBytes: PNG.length })
      .expect(201);
    expect((await fetch(presign.body.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: PNG })).ok).toBe(true);
    await api()
      .post("/api/v1/files")
      .set(auth(garage.token))
      .send({ objectKey: presign.body.objectKey, entityType: "JOB", entityId: garageJobId, mimeType: "image/png", sizeBytes: PNG.length, tag: "BEFORE_REPAIR", caption: "11.8 V at idle" })
      .expect(201);
    const estimate = await api()
      .post(`/api/v1/jobs/${garageJobId}/estimates`)
      .set(auth(garage.token))
      .send({ items: [{ type: "PART", description: "Alternator (rebuilt)", unitPrice: 950_000 }, { type: "LABOR", description: "Fit alternator", unitPrice: 250_000 }] })
      .expect(201);
    await api().post(`/api/v1/jobs/${garageJobId}/estimates/${estimate.body.id}/send`).set(auth(garage.token)).expect(201);
    await garageMove(garageJobId, "WAITING_APPROVAL");

    // The fleet has its own copy: findings, photo, estimate — and the repair now waits for its approver.
    let f = await fleetJob(fleetJobId);
    expect(f.status).toBe("WAITING_APPROVAL");
    expect(f.diagnoses[0].observedProblem).toBe("Regulator failed");
    expect(f.estimates[0]).toMatchObject({ status: "SENT", total: 1_200_000 });
    const fleetPhotos = await api().get(`/api/v1/files?entityType=JOB&entityId=${fleetJobId}`).set(auth(fleet.token)).expect(200);
    expect(fleetPhotos.body[0]).toMatchObject({ tag: "BEFORE_REPAIR", caption: "11.8 V at idle" });
    expect(fleetPhotos.body[0].objectKey.startsWith(`${fleet.orgId}/`)).toBe(true);
    await api().get(`/api/v1/files/${fleetPhotos.body[0].id}/url`).set(auth(fleet.token)).expect(200);
    const fleetInbox = await api().get("/api/v1/notifications").set(auth(fleet.token)).expect(200);
    expect(fleetInbox.body.map((n: { type: string }) => n.type)).toEqual(expect.arrayContaining(["WORK_ORDER_ACCEPTED", "ESTIMATE_RECEIVED"]));

    // Only the fleet approves — the garage can't log an approval for them.
    const garageApproval = await api()
      .post(`/api/v1/estimates/${estimate.body.id}/approvals`)
      .set(auth(garage.token))
      .send({ method: "PHONE", note: "they said yes", itemDecisions: [{ estimateItemId: estimate.body.items[0].id, decision: "APPROVED" }] })
      .expect(409);
    expect(garageApproval.body.error.code).toBe("APPROVAL_BY_FLEET");
    await api()
      .post(`/api/v1/estimates/${estimate.body.id}/approvals`)
      .set(auth(garage.token))
      .send({ method: "FLEET_PORTAL", itemDecisions: [{ estimateItemId: estimate.body.items[0].id, decision: "APPROVED" }] })
      .expect(400);

    // 4. Fleet approves the part, rejects the labour line → recorded on the garage's estimate too.
    const [copyPart, copyLabor] = f.estimates[0].items;
    await api()
      .post(`/api/v1/estimates/${f.estimates[0].id}/approvals`)
      .set(auth(fleet.token))
      .send({
        method: "STAFF_DECISION",
        note: "Our mechanic will fit it",
        itemDecisions: [
          { estimateItemId: copyPart.id, decision: "APPROVED" },
          { estimateItemId: copyLabor.id, decision: "REJECTED" },
        ],
      })
      .expect(201);
    expect((await fleetJob(fleetJobId)).status).toBe("APPROVED");
    const garageApprovals = (await api().get(`/api/v1/jobs/${garageJobId}/approvals`).set(auth(garage.token)).expect(200)).body;
    expect(garageApprovals).toHaveLength(1);
    expect(garageApprovals[0]).toMatchObject({ method: "FLEET_PORTAL", note: "Our mechanic will fit it", loggedByStaffId: null });
    const decided = Object.fromEntries(garageApprovals[0].itemDecisions.map((d: { estimateItemId: string; decision: string }) => [d.estimateItemId, d.decision]));
    expect(decided).toEqual({ [estimate.body.items[0].id]: "APPROVED", [estimate.body.items[1].id]: "REJECTED" });

    // 5. Garage works; the fleet's repair follows each step.
    await garageMove(garageJobId, "APPROVED");
    await garageMove(garageJobId, "IN_PROGRESS");
    expect((await fleetJob(fleetJobId)).status).toBe("IN_PROGRESS");
    await garageMove(garageJobId, "QUALITY_CHECK");
    await garageMove(garageJobId, "READY");
    expect((await fleetJob(fleetJobId)).status).toBe("READY");

    // 6. Garage bills; the fleet gets a copy it records payments against.
    await api().post(`/api/v1/jobs/${garageJobId}/parts`).set(auth(garage.token)).send({ name: "Alternator (rebuilt)", unitPrice: 950_000 }).expect(201);
    const draft = await api().post(`/api/v1/jobs/${garageJobId}/invoices`).set(auth(garage.token)).send({}).expect(201);
    await api().post(`/api/v1/jobs/${garageJobId}/invoices/${draft.body.id}/issue`).set(auth(garage.token)).expect(201);
    f = await fleetJob(fleetJobId);
    expect(f.invoices[0]).toMatchObject({ status: "ISSUED", total: 950_000 });
    await api().post(`/api/v1/invoices/${f.invoices[0].id}/payments`).set(auth(fleet.token)).send({ amount: 950_000, method: "BANK_TRANSFER", reference: "CBE-1" }).expect(201);

    // 7. Garage hands the vehicle back → the fleet's repair closes, history is written, the vehicle is back in service.
    await garageMove(garageJobId, "COLLECTED");
    expect((await fleetJob(fleetJobId)).status).toBe("CLOSED");
    const vehicle = (await api().get(`/api/v1/vehicles/${vehicleId}`).set(auth(fleet.token)).expect(200)).body;
    expect(vehicle.status).toBe("ACTIVE");
    const history = (await api().get(`/api/v1/vehicles/${vehicleId}/service-history`).set(auth(fleet.token)).expect(200)).body;
    expect(history[0].summary.invoice).toMatchObject({ total: 950_000, amountPaid: 950_000, balance: 0 });

    // The fleet's spend report counts it (from its own copy).
    const from = new Date(Date.now() - 3600_000).toISOString();
    const to = new Date(Date.now() + 3600_000).toISOString();
    const spend = (await api().get(`/api/v1/reports/spend?from=${from}&to=${to}`).set(auth(fleet.token)).expect(200)).body;
    expect(spend.byProvider).toEqual([expect.objectContaining({ name: garage.name, invoicedTotal: 950_000 })]);
  });

  it("handles declines, re-sends, and cancellations", async () => {
    const { fleetJobId } = await newRequest("Brakes squeal");
    const first = await api().post(`/api/v1/jobs/${fleetJobId}/work-order`).set(auth(fleet.token)).send({}).expect(201);
    await api().post(`/api/v1/work-orders/${first.body.id}/decline`).set(auth(garage.token)).send({ reason: "x" }).expect(400);
    await api().post(`/api/v1/work-orders/${first.body.id}/decline`).set(auth(garage.token)).send({ reason: "Fully booked this week" }).expect(201);
    await api().post(`/api/v1/work-orders/${first.body.id}/accept`).set(auth(garage.token)).expect(409);
    expect((await fleetJob(fleetJobId)).workOrder).toMatchObject({ status: "DECLINED", declineReason: "Fully booked this week" });

    // Declined → the fleet can send it again, then call it off before it's accepted.
    const second = await api().post(`/api/v1/jobs/${fleetJobId}/work-order`).set(auth(fleet.token)).send({}).expect(201);
    await api().post(`/api/v1/work-orders/${second.body.id}/cancel`).set(auth(garage.token)).expect(404);
    await api().post(`/api/v1/work-orders/${second.body.id}/cancel`).set(auth(fleet.token)).expect(201);
    await api().post(`/api/v1/work-orders/${second.body.id}/accept`).set(auth(garage.token)).expect(409);

    // Cancelling the repair itself while a request is still pending withdraws it too.
    const third = await api().post(`/api/v1/jobs/${fleetJobId}/work-order`).set(auth(fleet.token)).send({}).expect(201);
    await api().patch(`/api/v1/jobs/${fleetJobId}/status`).set(auth(fleet.token)).send({ toStatus: "CANCELLED" }).expect(200);
    const list = (await api().get("/api/v1/work-orders").set(auth(garage.token)).expect(200)).body;
    expect(list.find((w: { id: string }) => w.id === third.body.id).status).toBe("CANCELLED");
  });

  it("refuses work orders to unconnected providers and from garages", async () => {
    const offline = await api().post("/api/v1/service-providers").set(auth(fleet.token)).send({ name: "Offline Garage" }).expect(201);
    const vehicle = await api()
      .post("/api/v1/vehicles")
      .set(auth(fleet.token))
      .send({ licensePlate: `3-${randomUUID().slice(0, 5).toUpperCase()}`, make: "Toyota", model: "Hiace" })
      .expect(201);
    const job = await api().post("/api/v1/jobs").set(auth(fleet.token)).send({ vehicleId: vehicle.body.id, complaint: "Service", serviceProviderId: offline.body.id }).expect(201);
    const res = await api().post(`/api/v1/jobs/${job.body.id}/work-order`).set(auth(fleet.token)).send({}).expect(400);
    expect(res.body.error.code).toBe("PROVIDER_NOT_CONNECTED");
    // Offline providers keep the manager-led flow: the fleet records the estimate itself.
    await api().patch(`/api/v1/jobs/${job.body.id}/status`).set(auth(fleet.token)).send({ toStatus: "DIAGNOSING" }).expect(200);

    const garageJob = await api()
      .post("/api/v1/jobs")
      .set(auth(garage.token))
      .send({ newCustomer: { fullName: "Walk-in", phone: "+251911000111" }, newVehicle: { licensePlate: "AA-11111", make: "Toyota", model: "Vitz" }, complaint: "x" })
      .expect(201);
    await api().post(`/api/v1/jobs/${garageJob.body.id}/work-order`).set(auth(garage.token)).send({}).expect(400);
  });
});
