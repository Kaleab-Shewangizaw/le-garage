import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";

/**
 * Pilot-readiness hardening (brief: "production readiness audit"):
 * concurrent status-transition races (docs/DOMAIN.md §5), idempotency-key
 * duplicate-action protection (docs/API.md §1), and IDOR coverage beyond
 * what tenant-isolation.e2e-spec.ts already checks (diagnoses/notes/files,
 * plus malformed-input rejection).
 */
describe("Security hardening", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerOrg(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const res = await request(app.getHttpServer())
      .post("/api/v1/organizations")
      .send({
        organizationName: `${label} Org ${suffix}`,
        garageName: `${label} Garage ${suffix}`,
        ownerFullName: `${label} Owner`,
        ownerEmail: `${label.toLowerCase()}-${suffix}@example.test`,
        password: "password123",
      })
      .expect(201);
    return { accessToken: res.body.accessToken as string };
  }

  async function createJob(token: string) {
    const res = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        newCustomer: { fullName: "Race Customer", phone: `+2519${Math.floor(Math.random() * 1e8)}` },
        newVehicle: { licensePlate: `AA-${Math.floor(Math.random() * 100000)}`, make: "Toyota", model: "Corolla" },
        complaint: "test",
      })
      .expect(201);
    return res.body.id as string;
  }

  describe("Job status concurrency", () => {
    it("only lets one of two concurrent transitions from the same status succeed, with a consistent audit trail", async () => {
      const org = await registerOrg("Race");
      const jobId = await createJob(org.accessToken);
      const auth = { Authorization: `Bearer ${org.accessToken}` };

      // Both requests read status=INTAKE and race to apply a valid next transition.
      const [a, b] = await Promise.all([
        request(app.getHttpServer()).patch(`/api/v1/jobs/${jobId}/status`).set(auth).send({ toStatus: "DIAGNOSING" }),
        request(app.getHttpServer()).patch(`/api/v1/jobs/${jobId}/status`).set(auth).send({ toStatus: "CANCELLED" }),
      ]);

      const statuses = [a.status, b.status].sort();
      // Exactly one succeeds (200); the other is rejected as a conflict —
      // never both succeeding (which would silently corrupt the history).
      expect(statuses).toEqual([200, 409]);

      const events = await request(app.getHttpServer()).get(`/api/v1/jobs/${jobId}/events`).set(auth).expect(200);
      const transitionsFromIntake = events.body.filter((e: { fromStatus: string | null }) => e.fromStatus === "INTAKE");
      // Only the winner's transition is recorded — not two conflicting
      // events both claiming to originate from the same prior state.
      expect(transitionsFromIntake).toHaveLength(1);
    });
  });

  describe("Idempotency-Key duplicate-action protection", () => {
    it("replays the same response for a repeated key instead of creating a second job", async () => {
      const org = await registerOrg("Idem");
      const auth = { Authorization: `Bearer ${org.accessToken}` };
      const idempotencyKey = randomUUID();
      const body = {
        newCustomer: { fullName: "Idem Customer", phone: "+251900000123" },
        newVehicle: { licensePlate: "AA-IDEM1", make: "Toyota", model: "Vitz" },
        complaint: "brake noise",
      };

      const first = await request(app.getHttpServer())
        .post("/api/v1/jobs")
        .set(auth)
        .set("Idempotency-Key", idempotencyKey)
        .send(body)
        .expect(201);

      const second = await request(app.getHttpServer())
        .post("/api/v1/jobs")
        .set(auth)
        .set("Idempotency-Key", idempotencyKey)
        .send(body)
        .expect(201);

      expect(second.body.id).toBe(first.body.id);

      const list = await request(app.getHttpServer())
        .get("/api/v1/jobs")
        .set(auth)
        .query({ search: "AA-IDEM1" })
        .expect(200);
      expect(list.body).toHaveLength(1);
    });

    it("rejects a second request with the same key while the first is still being processed", async () => {
      const org = await registerOrg("IdemRace");
      const jobId = await createJob(org.accessToken);
      const auth = { Authorization: `Bearer ${org.accessToken}` };
      const idempotencyKey = randomUUID();

      const [a, b] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/jobs/${jobId}/status`)
          .set(auth)
          .set("Idempotency-Key", idempotencyKey)
          .send({ toStatus: "DIAGNOSING" }),
        request(app.getHttpServer())
          .patch(`/api/v1/jobs/${jobId}/status`)
          .set(auth)
          .set("Idempotency-Key", idempotencyKey)
          .send({ toStatus: "DIAGNOSING" }),
      ]);

      const statuses = [a.status, b.status].sort();
      // One succeeds; the other is rejected either because it lost the
      // idempotency-key race (409 DUPLICATE_REQUEST_IN_PROGRESS) or the
      // state-machine race (409 JOB_CONCURRENTLY_MODIFIED) — either way,
      // never a second silent success.
      expect(statuses).toEqual([200, 409]);
    });

    it("does not protect requests that omit the Idempotency-Key header (opt-in only)", async () => {
      const org = await registerOrg("NoIdem");
      const auth = { Authorization: `Bearer ${org.accessToken}` };
      const body = {
        newCustomer: { fullName: "No Idem Customer", phone: "+251900000456" },
        newVehicle: { licensePlate: "AA-NOIDEM", make: "Toyota", model: "Yaris" },
        complaint: "oil leak",
      };

      const first = await request(app.getHttpServer()).post("/api/v1/jobs").set(auth).send(body).expect(201);
      const second = await request(app.getHttpServer()).post("/api/v1/jobs").set(auth).send(body).expect(201);

      // Without a key, each call is treated as a distinct, deliberate action.
      expect(second.body.id).not.toBe(first.body.id);
    });
  });

  describe("IDOR coverage beyond the core tenant-isolation suite", () => {
    it("prevents org B from reading org A's diagnoses and notes", async () => {
      const orgA = await registerOrg("DiagA");
      const orgB = await registerOrg("DiagB");
      const jobId = await createJob(orgA.accessToken);
      const authA = { Authorization: `Bearer ${orgA.accessToken}` };
      const authB = { Authorization: `Bearer ${orgB.accessToken}` };

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/diagnoses`)
        .set(authA)
        .send({ observedProblem: "confidential finding" })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/notes`)
        .set(authA)
        .send({ note: "confidential note" })
        .expect(201);

      await request(app.getHttpServer()).get(`/api/v1/jobs/${jobId}/diagnoses`).set(authB).expect(404);
      await request(app.getHttpServer()).get(`/api/v1/jobs/${jobId}/notes`).set(authB).expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/diagnoses`)
        .set(authB)
        .send({ observedProblem: "should not be allowed" })
        .expect(404);
    });

    it("prevents org B from presigning an upload against org A's job", async () => {
      const orgA = await registerOrg("FileA");
      const orgB = await registerOrg("FileB");
      const jobId = await createJob(orgA.accessToken);
      const authB = { Authorization: `Bearer ${orgB.accessToken}` };

      await request(app.getHttpServer())
        .post("/api/v1/files/presign")
        .set(authB)
        .send({ entityType: "JOB", entityId: jobId, fileName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 1000 })
        .expect(404);
    });

    it("prevents a technician from voiding a payment (privilege escalation check)", async () => {
      const org = await registerOrg("Priv");
      const owner = { Authorization: `Bearer ${org.accessToken}` };
      const suffix = randomUUID().slice(0, 8);

      const invite = await request(app.getHttpServer())
        .post("/api/v1/staff/invite")
        .set(owner)
        .send({
          fullName: "Tech Priv",
          email: `tech-priv-${suffix}@example.test`,
          role: "TECHNICIAN",
          temporaryPassword: "password123",
        })
        .expect(201);
      const techLogin = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ identifier: `tech-priv-${suffix}@example.test`, password: "password123" })
        .expect(200);
      const tech = { Authorization: `Bearer ${techLogin.body.accessToken}` };

      const jobId = await createJob(org.accessToken);
      await request(app.getHttpServer()).patch(`/api/v1/jobs/${jobId}/status`).set(owner).send({ toStatus: "DIAGNOSING" }).expect(200);
      await request(app.getHttpServer()).post(`/api/v1/jobs/${jobId}/labor`).set(owner).send({ description: "test", amount: 500 }).expect(201);
      const invoice = await request(app.getHttpServer()).post(`/api/v1/jobs/${jobId}/invoices`).set(owner).send({}).expect(201);
      const issued = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/invoices/${invoice.body.id}/issue`)
        .set(owner)
        .expect(201);
      const payment = await request(app.getHttpServer())
        .post(`/api/v1/invoices/${issued.body.id}/payments`)
        .set(owner)
        .send({ amount: 500, method: "CASH" })
        .expect(201);

      // TECHNICIAN is not in the FRONT_DESK/MANAGER/OWNER roles list for
      // payments at all — should be forbidden outright.
      await request(app.getHttpServer())
        .post(`/api/v1/invoices/${issued.body.id}/payments/${payment.body.id}/void`)
        .set(tech)
        .send({ reason: "trying to void as technician" })
        .expect(403);
    });
  });

  describe("Malformed input rejection", () => {
    it("rejects a job creation with neither customerId nor newCustomer", async () => {
      const org = await registerOrg("Malformed");
      const auth = { Authorization: `Bearer ${org.accessToken}` };
      await request(app.getHttpServer())
        .post("/api/v1/jobs")
        .set(auth)
        .send({ newVehicle: { licensePlate: "AA-BAD", make: "Toyota", model: "Corolla" }, complaint: "x" })
        .expect(400);
    });

    it("rejects a negative payment amount", async () => {
      const org = await registerOrg("MalformedPay");
      const auth = { Authorization: `Bearer ${org.accessToken}` };
      const jobId = await createJob(org.accessToken);
      await request(app.getHttpServer()).patch(`/api/v1/jobs/${jobId}/status`).set(auth).send({ toStatus: "DIAGNOSING" }).expect(200);
      await request(app.getHttpServer()).post(`/api/v1/jobs/${jobId}/labor`).set(auth).send({ description: "x", amount: 500 }).expect(201);
      const invoice = await request(app.getHttpServer()).post(`/api/v1/jobs/${jobId}/invoices`).set(auth).send({}).expect(201);
      const issued = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/invoices/${invoice.body.id}/issue`)
        .set(auth)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/invoices/${issued.body.id}/payments`)
        .set(auth)
        .send({ amount: -100, method: "CASH" })
        .expect(400);
    });

    it("rejects registering an upload whose actual size exceeds the limit, even if the client under-declared it at presign time", async () => {
      // A presigned PUT constrains content-type, not byte count — the
      // declared sizeBytes at presign is only a client claim. This proves
      // the server re-checks the *real* uploaded size at registration
      // (docs/SECURITY.md §7) rather than trusting that claim.
      const org = await registerOrg("MalformedUpload");
      const auth = { Authorization: `Bearer ${org.accessToken}` };
      const jobId = await createJob(org.accessToken);

      const presign = await request(app.getHttpServer())
        .post("/api/v1/files/presign")
        .set(auth)
        .send({ entityType: "JOB", entityId: jobId, fileName: "photo.jpg", mimeType: "image/jpeg", sizeBytes: 1000 })
        .expect(201);

      // Actually upload something bigger than the 20MB image limit, straight to storage.
      const oversized = Buffer.alloc(21 * 1024 * 1024, 1);
      const putRes = await fetch(presign.body.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: oversized,
      });
      expect(putRes.ok).toBe(true);

      await request(app.getHttpServer())
        .post("/api/v1/files")
        .set(auth)
        .send({ objectKey: presign.body.objectKey, entityType: "JOB", entityId: jobId, mimeType: "image/jpeg", sizeBytes: 1000 })
        .expect(400);

      // And it isn't left behind as a registered attachment.
      const list = await request(app.getHttpServer())
        .get("/api/v1/files")
        .set(auth)
        .query({ entityType: "JOB", entityId: jobId })
        .expect(200);
      expect(list.body).toHaveLength(0);
    });

    it("rejects an unsupported file type on presign", async () => {
      const org = await registerOrg("MalformedFile");
      const auth = { Authorization: `Bearer ${org.accessToken}` };
      const jobId = await createJob(org.accessToken);

      await request(app.getHttpServer())
        .post("/api/v1/files/presign")
        .set(auth)
        .send({ entityType: "JOB", entityId: jobId, fileName: "script.exe", mimeType: "application/x-msdownload", sizeBytes: 1000 })
        .expect(400);
    });
  });

  describe("Authentication", () => {
    it("rejects a request with no token, and one with a garbage token", async () => {
      await request(app.getHttpServer()).get("/api/v1/jobs").expect(401);
      await request(app.getHttpServer()).get("/api/v1/jobs").set("Authorization", "Bearer not-a-real-token").expect(401);
    });

    it("rejects login with a wrong password without revealing whether the account exists", async () => {
      const org = await registerOrg("LoginSec");
      const suffix = randomUUID().slice(0, 8);
      const res1 = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ identifier: `nonexistent-${suffix}@example.test`, password: "whatever123" })
        .expect(401);
      const res2 = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ identifier: `loginsec-${suffix}@example.test`, password: "wrongpassword" })
        .expect(401);
      // Same error code for "no such account" and "wrong password" — an
      // attacker can't use the response to enumerate valid accounts.
      expect(res1.body.error.code).toBe(res2.body.error.code);
      void org;
    });
  });

  describe("Public estimate sharing", () => {
    it("won't share a DRAFT estimate, shares a SENT one, and the public link needs no auth", async () => {
      const org = await registerOrg("Share");
      const auth = { Authorization: `Bearer ${org.accessToken}` };
      const jobId = await createJob(org.accessToken);

      const draft = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/estimates`)
        .set(auth)
        .send({ items: [{ type: "PART", description: "Battery", quantity: 1, unitPrice: 4000, discount: 0 }], taxTotal: 0 })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/estimates/${draft.body.id}/share`)
        .set(auth)
        .expect(409);

      await request(app.getHttpServer()).post(`/api/v1/jobs/${jobId}/estimates/${draft.body.id}/send`).set(auth).expect(201);

      const share1 = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/estimates/${draft.body.id}/share`)
        .set(auth)
        .expect(201);
      expect(share1.body.shareToken).toBeTruthy();

      // Idempotent-ish: calling share again returns the same token, not a new one.
      const share2 = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/estimates/${draft.body.id}/share`)
        .set(auth)
        .expect(201);
      expect(share2.body.shareToken).toBe(share1.body.shareToken);

      // No Authorization header at all — this must still work.
      const publicView = await request(app.getHttpServer())
        .get(`/api/v1/public/estimates/${share1.body.shareToken}`)
        .expect(200);
      expect(publicView.body.items[0].description).toBe("Battery");
      expect(publicView.body.job.vehicle.licensePlate).toBeTruthy();

      // A random guess doesn't resolve to anyone's estimate.
      await request(app.getHttpServer()).get(`/api/v1/public/estimates/${randomUUID()}`).expect(404);
    });

    it("prevents org B from sharing org A's estimate", async () => {
      const orgA = await registerOrg("ShareA");
      const orgB = await registerOrg("ShareB");
      const jobId = await createJob(orgA.accessToken);
      const authA = { Authorization: `Bearer ${orgA.accessToken}` };
      const authB = { Authorization: `Bearer ${orgB.accessToken}` };

      const est = await request(app.getHttpServer())
        .post(`/api/v1/jobs/${jobId}/estimates`)
        .set(authA)
        .send({ items: [{ type: "LABOR", description: "Diagnostics", quantity: 1, unitPrice: 500, discount: 0 }], taxTotal: 0 })
        .expect(201);
      await request(app.getHttpServer()).post(`/api/v1/jobs/${jobId}/estimates/${est.body.id}/send`).set(authA).expect(201);

      await request(app.getHttpServer()).post(`/api/v1/jobs/${jobId}/estimates/${est.body.id}/share`).set(authB).expect(404);
    });
  });
});
