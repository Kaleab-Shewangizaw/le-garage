import argon2 from "argon2";
import { PrismaClient, Role } from "@prisma/client";

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

  console.log("Seed complete.");
  console.log(`  Organization: ${organization.name} (${organization.id})`);
  console.log(`  Garage: ${garage.name} (${garage.id})`);
  console.log(`  Login: owner@legarage.dev / password123 (OWNER)`);
  console.log(`  Login: tech@legarage.dev / password123 (TECHNICIAN)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
