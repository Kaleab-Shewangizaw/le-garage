import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import * as argon2 from "argon2";
import { prismaUnscoped, OrganizationKind, Role } from "@le-garage/database";
import { AppModule } from "../src/app.module";

/**
 * The PLATFORM_ADMIN console (docs/ADMIN.md): cross-tenant visibility for
 * Le Garage staff, access control (suspend an organization, deactivate a
 * person) that takes effect immediately, nothing for anyone else, and an
 * audit entry for every admin write. Admins are provisioned directly in
 * the database (docs/AUTH.md §8) — there is deliberately no API for it.
 */
describe("Platform admin console (docs/ADMIN.md)", () => {
  let app: INestApplication;
  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  let adminToken: string;
  let adminStaffId: string;
  let platformOrgId: string;
  let fleet: { token: string; orgId: string; email: string };

  async function login(identifier: string) {
    const res = await api().post("/api/v1/auth/login").send({ identifier, password: "password123" });
    return res;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    await app.init();

    const suffix = randomUUID().slice(0, 8);
    const platform = await prismaUnscoped.organization.create({
      data: { name: `Platform ${suffix}`, kind: OrganizationKind.PLATFORM },
    });
    platformOrgId = platform.id;
    const workspace = await prismaUnscoped.garage.create({ data: { organizationId: platform.id, name: platform.name } });
    const adminEmail = `admin-${suffix}@example.test`;
    const adminUser = await prismaUnscoped.user.create({
      data: { email: adminEmail, fullName: "Test Admin", passwordHash: await argon2.hash("password123") },
    });
    const adminStaff = await prismaUnscoped.staffMember.create({
      data: { organizationId: platform.id, garageId: workspace.id, userId: adminUser.id, role: Role.PLATFORM_ADMIN },
    });
    adminStaffId = adminStaff.id;
    adminToken = (await login(adminEmail)).body.accessToken;

    const fleetEmail = `fleet-${suffix}@example.test`;
    const reg = await api()
      .post("/api/v1/organizations")
      .send({ kind: "FLEET", organizationName: `Admin Test Fleet ${suffix}`, ownerFullName: "Fleet Owner", ownerEmail: fleetEmail, password: "password123" })
      .expect(201);
    fleet = { token: reg.body.accessToken, orgId: reg.body.organization.id, email: fleetEmail };
  });

  afterAll(async () => {
    await app.close();
  });

  it("is PLATFORM_ADMIN-only", async () => {
    await api().get("/api/v1/admin/overview").set(auth(fleet.token)).expect(403);
    await api().get("/api/v1/admin/organizations").set(auth(fleet.token)).expect(403);
    await api().post(`/api/v1/admin/organizations/${fleet.orgId}/suspend`).set(auth(fleet.token)).send({ reason: "nope nope" }).expect(403);
    await api().get("/api/v1/admin/overview").expect(401);
  });

  it("sees every tenant, but never lists the platform's own organization", async () => {
    const list = await api().get("/api/v1/admin/organizations").set(auth(adminToken)).expect(200);
    const ids = list.body.map((o: { id: string }) => o.id);
    expect(ids).toContain(fleet.orgId);
    expect(ids).not.toContain(platformOrgId);

    const fleetsOnly = await api().get("/api/v1/admin/organizations?kind=FLEET").set(auth(adminToken)).expect(200);
    expect(fleetsOnly.body.every((o: { kind: string }) => o.kind === "FLEET")).toBe(true);

    const detail = await api().get(`/api/v1/admin/organizations/${fleet.orgId}`).set(auth(adminToken)).expect(200);
    expect(detail.body.kind).toBe("FLEET");
    expect(detail.body.staff[0].user.email).toBe(fleet.email);

    const overview = await api().get("/api/v1/admin/overview").set(auth(adminToken)).expect(200);
    expect(overview.body.organizationsByKind.FLEET).toBeGreaterThanOrEqual(1);
    expect(overview.body.organizationsByKind.PLATFORM).toBeUndefined();
  });

  it("suspends an organization immediately — existing tokens and new logins — then restores it", async () => {
    await api().post(`/api/v1/admin/organizations/${fleet.orgId}/suspend`).set(auth(adminToken)).send({ reason: "x" }).expect(400);
    await api()
      .post(`/api/v1/admin/organizations/${fleet.orgId}/suspend`)
      .set(auth(adminToken))
      .send({ reason: "Unpaid subscription — pilot paused" })
      .expect(201);

    const blocked = await api().get("/api/v1/vehicles").set(auth(fleet.token)).expect(403);
    expect(blocked.body.error.code).toBe("ORGANIZATION_SUSPENDED");
    const relogin = await login(fleet.email);
    expect(relogin.status).toBe(403);
    expect(relogin.body.error.code).toBe("ORGANIZATION_SUSPENDED");

    await api().post(`/api/v1/admin/organizations/${fleet.orgId}/suspend`).set(auth(adminToken)).send({ reason: "again please" }).expect(409);
    await api().post(`/api/v1/admin/organizations/${fleet.orgId}/reactivate`).set(auth(adminToken)).expect(201);
    await api().get("/api/v1/vehicles").set(auth(fleet.token)).expect(200);

    const audit = await api().get(`/api/v1/admin/audit?organizationId=${fleet.orgId}&action=ADMIN_`).set(auth(adminToken)).expect(200);
    const actions = audit.body.map((a: { action: string }) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["ADMIN_ORGANIZATION_SUSPENDED", "ADMIN_ORGANIZATION_REACTIVATED"]));
    expect(audit.body[0].actorUser.fullName).toBe("Test Admin");
  });

  it("deactivates one person immediately (admin or owner) and protects platform accounts", async () => {
    const email = `coord-${randomUUID().slice(0, 8)}@example.test`;
    const invite = await api()
      .post("/api/v1/staff/invite")
      .set(auth(fleet.token))
      .send({ fullName: "Coordinator", email, role: "FRONT_DESK", temporaryPassword: "password123" })
      .expect(201);
    const coordToken = (await login(email)).body.accessToken;
    await api().get("/api/v1/jobs").set(auth(coordToken)).expect(200);

    await api().patch(`/api/v1/admin/staff/${invite.body.id}`).set(auth(adminToken)).send({ active: false, reason: "Left the company" }).expect(200);
    const revoked = await api().get("/api/v1/jobs").set(auth(coordToken)).expect(401);
    expect(revoked.body.error.code).toBe("STAFF_DEACTIVATED");
    expect((await login(email)).status).toBe(401);

    await api().patch(`/api/v1/admin/staff/${invite.body.id}`).set(auth(adminToken)).send({ active: true, reason: "Rehired in error" }).expect(200);
    const again = await login(email);
    expect(again.status).toBe(200);

    // The same immediacy applies when a tenant owner deactivates their own staff.
    await api().patch(`/api/v1/staff/${invite.body.id}`).set(auth(fleet.token)).send({ active: false }).expect(200);
    await api().get("/api/v1/jobs").set(auth(again.body.accessToken)).expect(401);

    await api().patch(`/api/v1/admin/staff/${adminStaffId}`).set(auth(adminToken)).send({ active: false, reason: "lock myself out" }).expect(403);
    await api().post(`/api/v1/admin/organizations/${platformOrgId}/suspend`).set(auth(adminToken)).send({ reason: "suspend the platform" }).expect(403);
  });
});
