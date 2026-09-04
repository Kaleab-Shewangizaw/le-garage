import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";

/**
 * The release-gate suite promised in docs/SECURITY.md §2: for every
 * tenant-scoped resource type, org A's token must not be able to
 * read/write org B's records. Requires a running Postgres reachable via
 * DATABASE_URL with migrations applied — see docs/DEVELOPMENT.md.
 */
describe("Tenant isolation (docs/SECURITY.md §2)", () => {
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
    return { accessToken: res.body.accessToken as string, orgId: res.body.organization.id as string };
  }

  it("prevents org B from reading org A's customer", async () => {
    const orgA = await registerOrg("A");
    const orgB = await registerOrg("B");

    const createRes = await request(app.getHttpServer())
      .post("/api/v1/customers")
      .set("Authorization", `Bearer ${orgA.accessToken}`)
      .send({ fullName: "Org A Customer", phone: "+251900000001" })
      .expect(201);

    const customerId = createRes.body.id as string;

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set("Authorization", `Bearer ${orgA.accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/v1/customers/${customerId}`)
      .set("Authorization", `Bearer ${orgB.accessToken}`)
      .expect(404);
  });

  it("prevents org B from updating org A's vehicle", async () => {
    const orgA = await registerOrg("A");
    const orgB = await registerOrg("B");

    const createRes = await request(app.getHttpServer())
      .post("/api/v1/vehicles")
      .set("Authorization", `Bearer ${orgA.accessToken}`)
      .send({ licensePlate: "AA-99999", make: "Toyota", model: "Vitz" })
      .expect(201);

    const vehicleId = createRes.body.id as string;

    await request(app.getHttpServer())
      .patch(`/api/v1/vehicles/${vehicleId}`)
      .set("Authorization", `Bearer ${orgB.accessToken}`)
      .send({ color: "Red" })
      .expect(404);
  });

  it("prevents org B from seeing org A's job in a list or by id", async () => {
    const orgA = await registerOrg("A");
    const orgB = await registerOrg("B");

    const jobRes = await request(app.getHttpServer())
      .post("/api/v1/jobs")
      .set("Authorization", `Bearer ${orgA.accessToken}`)
      .send({
        newCustomer: { fullName: "Jane", phone: "+251900000002" },
        newVehicle: { licensePlate: "AA-11111", make: "Isuzu", model: "Truck" },
        complaint: "Brakes squeak",
      })
      .expect(201);

    const jobId = jobRes.body.id as string;

    await request(app.getHttpServer())
      .get(`/api/v1/jobs/${jobId}`)
      .set("Authorization", `Bearer ${orgB.accessToken}`)
      .expect(404);

    const listRes = await request(app.getHttpServer())
      .get("/api/v1/jobs")
      .set("Authorization", `Bearer ${orgB.accessToken}`)
      .expect(200);

    expect(listRes.body.find((j: { id: string }) => j.id === jobId)).toBeUndefined();
  });

  it("rejects requests with no token at all", async () => {
    await request(app.getHttpServer()).get("/api/v1/jobs").expect(401);
  });
});
