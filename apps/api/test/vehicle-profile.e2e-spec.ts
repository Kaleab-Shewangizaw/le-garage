import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";

// 1×1 PNG — real bytes, so the upload goes through MinIO like a phone photo would.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * Vehicle profiles with photo evidence, and the team-management rules a
 * fleet owner relies on when they hand day-to-day work to a supervisor
 * (docs/FLEET.md §5). The photo test needs MinIO running (like
 * security-hardening.e2e-spec.ts).
 */
describe("Vehicle profile, photo proof, and team roles", () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  let owner: { token: string; staffId: string };
  let supervisor: { token: string; staffId: string };
  let other: { token: string; email: string };

  async function register(label: string) {
    const email = `${label.toLowerCase().replace(/\s+/g, "-")}-${randomUUID().slice(0, 8)}@example.test`;
    const res = await api()
      .post("/api/v1/organizations")
      .send({ kind: "FLEET", organizationName: `${label} ${randomUUID().slice(0, 6)}`, ownerFullName: `${label} Owner`, ownerEmail: email, password: "password123" })
      .expect(201);
    return { token: res.body.accessToken as string, staffId: res.body.context.staffMemberId as string, email };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();

    owner = await register("Profile Fleet");
    other = await register("Other Fleet");
    const email = `supervisor-${randomUUID().slice(0, 8)}@example.test`;
    const invite = await api()
      .post("/api/v1/staff/invite")
      .set(auth(owner.token))
      .send({ fullName: "Sami Supervisor", email, role: "MANAGER", temporaryPassword: "password123" })
      .expect(201);
    const login = await api().post("/api/v1/auth/login").send({ identifier: email, password: "password123" }).expect(200);
    supervisor = { token: login.body.accessToken, staffId: invite.body.id };
  });

  afterAll(async () => {
    await app.close();
  });

  it("keeps a vehicle profile (driver, fuel, acquired date, notes) and can clear fields", async () => {
    const created = await api()
      .post("/api/v1/vehicles")
      .set(auth(supervisor.token))
      .send({
        licensePlate: `3-${randomUUID().slice(0, 5).toUpperCase()}`,
        make: "Isuzu",
        model: "NQR",
        vehicleType: "TRUCK",
        fuelType: "DIESEL",
        acquiredAt: "2023-03-01",
        driverName: "Abebe Girma",
        driverPhone: "+251911223344",
        notes: "Bole–Adama route",
      })
      .expect(201);
    expect(created.body).toMatchObject({ fuelType: "DIESEL", driverName: "Abebe Girma", notes: "Bole–Adama route" });
    expect(created.body.acquiredAt).toMatch(/^2023-03-01/);

    const cleared = await api()
      .patch(`/api/v1/vehicles/${created.body.id}`)
      .set(auth(supervisor.token))
      .send({ driverName: null, driverPhone: null, fuelType: "HYBRID" })
      .expect(200);
    expect(cleared.body).toMatchObject({ driverName: null, driverPhone: null, fuelType: "HYBRID", notes: "Bole–Adama route" });

    await api().patch(`/api/v1/vehicles/${created.body.id}`).set(auth(supervisor.token)).send({ fuelType: "STEAM" }).expect(400);
    await api().patch(`/api/v1/vehicles/${created.body.id}`).set(auth(supervisor.token)).send({ acquiredAt: "2999-01-01" }).expect(400);
    await api().patch(`/api/v1/vehicles/${created.body.id}`).set(auth(other.token)).send({ notes: "hijack" }).expect(404);
  });

  it("returns each service visit with its tagged photo proof, privately", async () => {
    const vehicle = await api()
      .post("/api/v1/vehicles")
      .set(auth(owner.token))
      .send({ licensePlate: `3-${randomUUID().slice(0, 5).toUpperCase()}`, make: "Toyota", model: "Hilux" })
      .expect(201);
    const job = await api().post("/api/v1/jobs").set(auth(owner.token)).send({ vehicleId: vehicle.body.id, complaint: "Brakes squeal" }).expect(201);

    const presign = await api()
      .post("/api/v1/files/presign")
      .set(auth(owner.token))
      .send({ entityType: "JOB", entityId: job.body.id, fileName: "before.png", mimeType: "image/png", sizeBytes: PNG.length })
      .expect(201);
    const put = await fetch(presign.body.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: PNG });
    expect(put.ok).toBe(true);
    const attachment = await api()
      .post("/api/v1/files")
      .set(auth(owner.token))
      .send({ objectKey: presign.body.objectKey, entityType: "JOB", entityId: job.body.id, mimeType: "image/png", sizeBytes: PNG.length, tag: "BEFORE_REPAIR", caption: "Pads worn to the metal" })
      .expect(201);
    expect(attachment.body).toMatchObject({ tag: "BEFORE_REPAIR", caption: "Pads worn to the metal" });

    const visits = await api().get(`/api/v1/vehicles/${vehicle.body.id}/visits`).set(auth(owner.token)).expect(200);
    expect(visits.body).toHaveLength(1);
    expect(visits.body[0]).toMatchObject({ id: job.body.id, complaint: "Brakes squeal", invoiceTotal: null });
    expect(visits.body[0].attachments[0]).toMatchObject({ id: attachment.body.id, tag: "BEFORE_REPAIR" });

    const relabeled = await api()
      .patch(`/api/v1/files/${attachment.body.id}`)
      .set(auth(owner.token))
      .send({ tag: "DAMAGE", caption: null })
      .expect(200);
    expect(relabeled.body).toMatchObject({ tag: "DAMAGE", caption: null });
    await api().patch(`/api/v1/files/${attachment.body.id}`).set(auth(owner.token)).send({ tag: "SELFIE" }).expect(400);

    // Another company can't see the visit history, the photo, or relabel it.
    await api().get(`/api/v1/vehicles/${vehicle.body.id}/visits`).set(auth(other.token)).expect(404);
    await api().get(`/api/v1/files/${attachment.body.id}/url`).set(auth(other.token)).expect(404);
    await api().patch(`/api/v1/files/${attachment.body.id}`).set(auth(other.token)).send({ tag: "AFTER_REPAIR" }).expect(404);
  });

  it("lets a supervisor run the team, but never make or change an owner", async () => {
    const invitedOwner = await api()
      .post("/api/v1/staff/invite")
      .set(auth(supervisor.token))
      .send({ fullName: "Sneaky Owner", email: `sneaky-${randomUUID().slice(0, 8)}@example.test`, role: "OWNER", temporaryPassword: "password123" })
      .expect(403);
    expect(invitedOwner.body.error.code).toBe("OWNER_ONLY");

    const coordinator = await api()
      .post("/api/v1/staff/invite")
      .set(auth(supervisor.token))
      .send({ fullName: "Coordinator", email: `coord-${randomUUID().slice(0, 8)}@example.test`, role: "FRONT_DESK", temporaryPassword: "password123" })
      .expect(201);
    await api().patch(`/api/v1/staff/${coordinator.body.id}`).set(auth(supervisor.token)).send({ role: "OWNER" }).expect(403);
    await api().patch(`/api/v1/staff/${coordinator.body.id}`).set(auth(supervisor.token)).send({ role: "TECHNICIAN" }).expect(200);
    await api().patch(`/api/v1/staff/${owner.staffId}`).set(auth(supervisor.token)).send({ active: false }).expect(403);
    await api().patch(`/api/v1/staff/${supervisor.staffId}`).set(auth(supervisor.token)).send({ role: "OWNER" }).expect(403);

    const self = await api().patch(`/api/v1/staff/${owner.staffId}`).set(auth(owner.token)).send({ active: false }).expect(403);
    expect(self.body.error.code).toBe("CANNOT_CHANGE_SELF");

    // An owner can promote — and with two owners, step the other one down.
    await api().patch(`/api/v1/staff/${supervisor.staffId}`).set(auth(owner.token)).send({ role: "OWNER" }).expect(200);
    await api().patch(`/api/v1/staff/${supervisor.staffId}`).set(auth(owner.token)).send({ role: "MANAGER" }).expect(200);
  });

  it("refuses to pull another company's employee into this account", async () => {
    const res = await api()
      .post("/api/v1/staff/invite")
      .set(auth(owner.token))
      .send({ fullName: "Someone Else", email: other.email, role: "FRONT_DESK", temporaryPassword: "password123" })
      .expect(409);
    expect(res.body.error.code).toBe("ACCOUNT_IN_USE");
  });
});
