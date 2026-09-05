import argon2 from "argon2";
import { PrismaClient, Role, JobStatus, EstimateStatus, EstimateItemType } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash("password123");

  const organization = await prisma.organization.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Demo Garage Org",
    },
  });

  const garage = await prisma.garage.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: {
      organizationId: organization.id,
      name: "Bole Auto Care",
      phone: "+251911000000",
      address: "Bole Road, Addis Ababa",
      city: "Addis Ababa",
    },
  });

  const ownerUser = await prisma.user.upsert({
    where: { email: "owner@legarage.dev" },
    update: {},
    create: {
      email: "owner@legarage.dev",
      phone: "+251911000001",
      fullName: "Abebe Kebede",
      passwordHash,
    },
  });

  await prisma.staffMember.upsert({
    where: { garageId_userId: { garageId: garage.id, userId: ownerUser.id } },
    update: {},
    create: {
      organizationId: organization.id,
      garageId: garage.id,
      userId: ownerUser.id,
      role: Role.OWNER,
    },
  });

  const techUser = await prisma.user.upsert({
    where: { email: "tech@legarage.dev" },
    update: {},
    create: {
      email: "tech@legarage.dev",
      phone: "+251911000002",
      fullName: "Kebede Alemu",
      passwordHash,
    },
  });

  await prisma.staffMember.upsert({
    where: { garageId_userId: { garageId: garage.id, userId: techUser.id } },
    update: {},
    create: {
      organizationId: organization.id,
      garageId: garage.id,
      userId: techUser.id,
      role: Role.TECHNICIAN,
    },
  });

  const customer = await prisma.customer.upsert({
    where: { id: "00000000-0000-0000-0000-000000000010" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000010",
      organizationId: organization.id,
      fullName: "Sara Tesfaye",
      phone: "+251922000000",
    },
  });

  const vehicle = await prisma.vehicle.upsert({
    where: { id: "00000000-0000-0000-0000-000000000020" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000020",
      organizationId: organization.id,
      licensePlate: "AA-12345",
      make: "Toyota",
      model: "Corolla",
      year: 2015,
      color: "White",
      lastKnownMileage: 85000,
    },
  });

  await prisma.vehicleOwnerHistory.upsert({
    where: { id: "00000000-0000-0000-0000-000000000030" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000030",
      vehicleId: vehicle.id,
      customerId: customer.id,
    },
  });

  // Owner-mobile demo identity (docs/OWNER-APP.md). Deliberately named
  // "driver", not "owner" — this repo already uses Role.OWNER for the
  // *garage's* business owner (see `ownerUser` above); a vehicle owner is
  // an entirely different, cross-org identity with no staff membership.
  const driverUser = await prisma.user.upsert({
    where: { email: "driver@legarage.dev" },
    update: {},
    create: {
      email: "driver@legarage.dev",
      phone: customer.phone, // matches the seeded Customer, so the phone-based linking flow finds a real record
      fullName: "Sara Tesfaye",
      passwordHash,
    },
  });

  await prisma.customerLink.upsert({
    where: { userId_customerId: { userId: driverUser.id, customerId: customer.id } },
    update: {},
    create: {
      userId: driverUser.id,
      customerId: customer.id,
      organizationId: organization.id,
    },
  });

  // A demo job in flight, waiting on the driver's approval — so a fresh
  // owner-mobile login has something real to show on the home screen
  // without needing to hand-walk through intake first.
  const now = Date.now();
  const job = await prisma.job.upsert({
    where: { id: "00000000-0000-0000-0000-000000000040" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000040",
      organizationId: organization.id,
      garageId: garage.id,
      customerId: customer.id,
      vehicleId: vehicle.id,
      status: JobStatus.WAITING_APPROVAL,
      complaint: "Makes a knocking sound when turning left",
      mileageAtIntake: 84500,
      intakeAt: new Date(now - 3 * 3600_000),
      diagnosingAt: new Date(now - 2 * 3600_000),
      waitingApprovalAt: new Date(now - 1 * 3600_000),
    },
  });

  await prisma.jobStatusEvent.createMany({
    skipDuplicates: true,
    data: [
      { jobId: job.id, toStatus: JobStatus.INTAKE, actorUserId: ownerUser.id, createdAt: new Date(now - 3 * 3600_000) },
      { jobId: job.id, fromStatus: JobStatus.INTAKE, toStatus: JobStatus.DIAGNOSING, actorUserId: techUser.id, createdAt: new Date(now - 2 * 3600_000) },
      {
        jobId: job.id,
        fromStatus: JobStatus.DIAGNOSING,
        toStatus: JobStatus.WAITING_APPROVAL,
        actorUserId: techUser.id,
        createdAt: new Date(now - 1 * 3600_000),
      },
    ],
  });

  await prisma.diagnosis.upsert({
    where: { id: "00000000-0000-0000-0000-000000000050" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000050",
      organizationId: organization.id,
      jobId: job.id,
      authorStaffId: techUser.id,
      observedProblem: "Worn front brake pads, rotor scoring",
      recommendedRepair: "Replace front brake pads and resurface rotors",
      severity: "MEDIUM",
      createdAt: new Date(now - 2 * 3600_000 + 600_000),
    },
  });

  const estimate = await prisma.estimate.upsert({
    where: { id: "00000000-0000-0000-0000-000000000060" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000060",
      organizationId: organization.id,
      jobId: job.id,
      version: 1,
      status: EstimateStatus.SENT,
      subtotal: 170000,
      total: 170000,
      createdByStaffId: techUser.id,
      sentAt: new Date(now - 1 * 3600_000),
    },
  });

  await prisma.estimateItem.createMany({
    skipDuplicates: true,
    data: [
      {
        id: "00000000-0000-0000-0000-000000000061",
        estimateId: estimate.id,
        type: EstimateItemType.PART,
        description: "Front brake pads (pair)",
        quantity: 1,
        unitPrice: 120000,
        lineTotal: 120000,
      },
      {
        id: "00000000-0000-0000-0000-000000000062",
        estimateId: estimate.id,
        type: EstimateItemType.LABOR,
        description: "Replace pads, resurface rotors",
        quantity: 1,
        unitPrice: 50000,
        lineTotal: 50000,
      },
    ],
  });

  console.log("Seed complete.");
  console.log(`  Organization: ${organization.name} (${organization.id})`);
  console.log(`  Garage: ${garage.name} (${garage.id})`);
  console.log(`  Login: owner@legarage.dev / password123 (OWNER, garage-web)`);
  console.log(`  Login: tech@legarage.dev / password123 (TECHNICIAN, garage-web)`);
  console.log(`  Login: driver@legarage.dev / password123 (vehicle owner, owner-mobile)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
