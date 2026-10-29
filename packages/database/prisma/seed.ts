import argon2 from "argon2";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import path from "path";
import { CreateBucketCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  AttachmentEntityType,
  AttachmentTag,
  FuelType,
  PrismaClient,
  Role,
  JobStatus,
  EstimateStatus,
  EstimateItemType,
  ApprovalMethod,
  InvoiceStatus,
  OrganizationKind,
  PaymentMethod,
  VehicleStatus,
  VehicleType,
} from "@prisma/client";

/**
 * Development/demo seed (docs/WALKTHROUGH.md walks through every persona
 * using exactly this data). Every tenant created here has "(demo data)" or
 * a .dev login in it so nobody mistakes it for a real customer's records.
 *
 *  - Le Garage Platform (internal) — PLATFORM_ADMIN console (docs/ADMIN.md)
 *  - Demo Logistics PLC — a fleet company with repairs at every stage and
 *    two months of completed, invoiced history (docs/FLEET.md)
 *  - Addis Water Delivery — a second, small fleet (isolation/admin demo)
 *  - Bole Auto Care — a garage, plus an owner-app customer (docs/OWNER-APP.md)
 *
 * Runs against an empty database only: `pnpm db:reset` drops, migrates
 * and re-seeds. Repairs are built by `createRepair`, which writes the same
 * rows the API would at each stage, so demo screens behave like real ones.
 *
 * Photos come from prisma/seed-media/ — illustrations stamped "DEMO IMAGE",
 * never real photos — and are uploaded to the same object storage the API
 * uses (MinIO locally; S3_* env vars, same defaults as apps/api/.env.example).
 * If storage isn't reachable the seed still runs, just without photos.
 */

const prisma = new PrismaClient();

const HOUR = 3600_000;
const now = Date.now();
const at = (daysAgo: number, plusHours = 0) => new Date(now - daysAgo * 24 * HOUR + plusHours * HOUR);
const etb = (birr: number) => Math.round(birr * 100); // money is stored in santim (docs/DATABASE.md §2)

let passwordHash = "";

// ─────────────────────────────────────────────────────────────────────────
// Demo photos
// ─────────────────────────────────────────────────────────────────────────

const MEDIA_DIR = path.join(__dirname, "seed-media");
const BUCKET = process.env.S3_BUCKET ?? "legarage-attachments";
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  region: process.env.S3_REGION ?? "us-east-1",
  forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true") === "true",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "legarage", secretAccessKey: process.env.S3_SECRET_KEY ?? "legarage123" },
});
let mediaEnabled = true;
let photosUploaded = 0;

async function prepareStorage() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET })).catch(async () => {
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    });
  } catch (err) {
    mediaEnabled = false;
    console.warn(`⚠ Object storage not reachable (${(err as Error).message}) — seeding without photos. Start MinIO and re-seed to get them.`);
  }
}

/** Uploads one demo image and registers it as an Attachment, exactly as the API's upload flow would. */
async function addPhoto(
  ws: Workspace,
  target: { jobId: string } | { vehicleId: string },
  photo: { file: string; tag: AttachmentTag; caption: string; at: Date; byKey: string },
) {
  if (!mediaEnabled) return;
  const body = readFileSync(path.join(MEDIA_DIR, photo.file));
  const entityType = "jobId" in target ? AttachmentEntityType.JOB : AttachmentEntityType.VEHICLE;
  const entityId = "jobId" in target ? target.jobId : target.vehicleId;
  const objectKey = `${ws.organizationId}/${entityType.toLowerCase()}/${entityId}/${randomUUID()}.jpg`;
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, Body: body, ContentType: "image/jpeg" }));
  await prisma.attachment.create({
    data: {
      organizationId: ws.organizationId,
      entityType,
      ...target,
      objectKey,
      mimeType: "image/jpeg",
      sizeBytes: body.length,
      uploadedByStaffId: ws.staff[photo.byKey]!.userId,
      tag: photo.tag,
      caption: photo.caption,
      createdAt: photo.at,
    },
  });
  photosUploaded += 1;
}

// ─────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────

interface Workspace {
  organizationId: string;
  garageId: string;
  staff: Record<string, { userId: string; staffId: string; fullName: string }>;
}

async function createOrganization(opts: {
  name: string;
  kind: OrganizationKind;
  phone?: string;
  address?: string;
  createdDaysAgo: number;
  staff: { key: string; email: string; phone: string; fullName: string; role: Role; active?: boolean }[];
}): Promise<Workspace> {
  const organization = await prisma.organization.create({
    data: { name: opts.name, kind: opts.kind, createdAt: at(opts.createdDaysAgo) },
  });
  // Every StaffMember/Job hangs off one Garage row; for a fleet or the
  // platform it's simply the organization's workspace (docs/FLEET.md §2).
  const garage = await prisma.garage.create({
    data: { organizationId: organization.id, name: opts.name, phone: opts.phone, address: opts.address },
  });
  const staff: Workspace["staff"] = {};
  for (const s of opts.staff) {
    const user = await prisma.user.create({
      data: { email: s.email, phone: s.phone, fullName: s.fullName, passwordHash, createdAt: at(opts.createdDaysAgo) },
    });
    const member = await prisma.staffMember.create({
      data: { organizationId: organization.id, garageId: garage.id, userId: user.id, role: s.role, active: s.active ?? true, createdAt: at(opts.createdDaysAgo) },
    });
    staff[s.key] = { userId: user.id, staffId: member.id, fullName: s.fullName };
  }
  return { organizationId: organization.id, garageId: garage.id, staff };
}

type Line = { type: EstimateItemType; description: string; unitPrice: number; quantity?: number; warrantyMonths?: number };

/** How far along the workflow a seeded repair is (docs/FLEET.md §3). */
type Stage = "REPORTED" | "INSPECTION" | "AWAITING_APPROVAL" | "IN_PROGRESS" | "REPAIR_COMPLETE" | "CLOSED";

const STAGE_ORDER: Stage[] = ["REPORTED", "INSPECTION", "AWAITING_APPROVAL", "IN_PROGRESS", "REPAIR_COMPLETE", "CLOSED"];
const reached = (stage: Stage, target: Stage) => STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(target);

async function createRepair(
  ws: Workspace,
  opts: {
    vehicleId: string;
    customerId?: string;
    serviceProviderId?: string;
    assignedTechnicianKey?: string;
    complaint: string;
    odometer: number;
    reportedDaysAgo: number;
    /** Hours from report to returned-to-service, for CLOSED repairs. */
    durationHours?: number;
    stage: Stage;
    diagnosis?: { observedProblem: string; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; recommendedRepair: string; confirmedCause?: string };
    estimate?: Line[];
    /** Indexes of estimate lines the approver rejected. */
    rejected?: number[];
    approval: { method: ApprovalMethod; byKey: string; note: string };
    /** What was actually billed; defaults to the approved estimate lines. */
    finalLines?: Line[];
    payment?: { method: PaymentMethod; fraction: number; reference?: string };
    reporterKey: string;
    notes?: string[];
    /** Demo photos for this visit; `hours` is when they were taken, relative to the request. */
    photos?: { file: string; tag: AttachmentTag; caption: string; hours: number; byKey?: string }[];
  },
) {
  const t0 = at(opts.reportedDaysAgo);
  const h = (hours: number) => new Date(t0.getTime() + hours * HOUR);
  const total = opts.durationHours ?? 48;
  const times = {
    intakeAt: t0,
    diagnosingAt: h(1.5),
    waitingApprovalAt: h(5),
    approvedAt: h(7),
    inProgressAt: h(Math.min(20, total * 0.3)),
    qualityCheckAt: h(total - 6),
    readyAt: h(total - 4),
    collectedAt: h(total),
  };
  const s = opts.stage;
  const reporter = ws.staff[opts.reporterKey]!;
  const approver = ws.staff[opts.approval.byKey]!;
  const mechanic = ws.staff[opts.assignedTechnicianKey ?? "mechanic"] ?? reporter;

  const status: JobStatus = {
    REPORTED: JobStatus.INTAKE,
    INSPECTION: JobStatus.DIAGNOSING,
    AWAITING_APPROVAL: JobStatus.WAITING_APPROVAL,
    IN_PROGRESS: JobStatus.IN_PROGRESS,
    REPAIR_COMPLETE: JobStatus.READY,
    CLOSED: JobStatus.CLOSED,
  }[s];

  const job = await prisma.job.create({
    data: {
      organizationId: ws.organizationId,
      garageId: ws.garageId,
      vehicleId: opts.vehicleId,
      customerId: opts.customerId ?? null,
      serviceProviderId: opts.serviceProviderId ?? null,
      assignedTechnicianId: opts.assignedTechnicianKey ? ws.staff[opts.assignedTechnicianKey]!.staffId : null,
      status,
      complaint: opts.complaint,
      mileageAtIntake: opts.odometer,
      intakeAt: times.intakeAt,
      createdAt: times.intakeAt,
      diagnosingAt: reached(s, "INSPECTION") ? times.diagnosingAt : null,
      waitingApprovalAt: reached(s, "AWAITING_APPROVAL") ? times.waitingApprovalAt : null,
      approvedAt: reached(s, "IN_PROGRESS") ? times.approvedAt : null,
      inProgressAt: reached(s, "IN_PROGRESS") ? times.inProgressAt : null,
      qualityCheckAt: reached(s, "REPAIR_COMPLETE") ? times.qualityCheckAt : null,
      readyAt: reached(s, "REPAIR_COMPLETE") ? times.readyAt : null,
      collectedAt: reached(s, "CLOSED") ? times.collectedAt : null,
    },
  });

  // Status history, in the same shape JobsService.transitionStatus writes.
  const events: { from: JobStatus | null; to: JobStatus; at: Date; actor: string; note?: string }[] = [
    { from: null, to: JobStatus.INTAKE, at: times.intakeAt, actor: reporter.userId },
  ];
  if (reached(s, "INSPECTION")) events.push({ from: JobStatus.INTAKE, to: JobStatus.DIAGNOSING, at: times.diagnosingAt, actor: reporter.userId });
  if (reached(s, "AWAITING_APPROVAL")) events.push({ from: JobStatus.DIAGNOSING, to: JobStatus.WAITING_APPROVAL, at: times.waitingApprovalAt, actor: reporter.userId });
  if (reached(s, "IN_PROGRESS")) {
    events.push({ from: JobStatus.WAITING_APPROVAL, to: JobStatus.APPROVED, at: times.approvedAt, actor: approver.userId, note: opts.approval.method === ApprovalMethod.STAFF_DECISION ? "Approved by fleet manager" : undefined });
    events.push({ from: JobStatus.APPROVED, to: JobStatus.IN_PROGRESS, at: times.inProgressAt, actor: mechanic.userId });
  }
  if (reached(s, "REPAIR_COMPLETE")) {
    events.push({ from: JobStatus.IN_PROGRESS, to: JobStatus.QUALITY_CHECK, at: times.qualityCheckAt, actor: mechanic.userId });
    events.push({ from: JobStatus.QUALITY_CHECK, to: JobStatus.READY, at: times.readyAt, actor: mechanic.userId });
  }
  if (reached(s, "CLOSED")) {
    events.push({ from: JobStatus.READY, to: JobStatus.COLLECTED, at: times.collectedAt, actor: reporter.userId });
    events.push({ from: JobStatus.COLLECTED, to: JobStatus.CLOSED, at: times.collectedAt, actor: reporter.userId, note: "Auto-closed after service record was created" });
  }
  await prisma.jobStatusEvent.createMany({
    data: events.map((e) => ({ jobId: job.id, fromStatus: e.from, toStatus: e.to, actorUserId: e.actor, note: e.note, createdAt: e.at })),
  });

  if (opts.diagnosis && reached(s, "INSPECTION")) {
    await prisma.diagnosis.create({
      data: { organizationId: ws.organizationId, jobId: job.id, authorStaffId: mechanic.staffId, ...opts.diagnosis, createdAt: h(3) },
    });
  }
  for (const [i, note] of (opts.notes ?? []).entries()) {
    await prisma.jobNote.create({ data: { organizationId: ws.organizationId, jobId: job.id, authorStaffId: reporter.staffId, note, createdAt: h(4 + i) } });
  }

  // Estimate → approval.
  let approvedLines: Line[] = [];
  if (opts.estimate && reached(s, "AWAITING_APPROVAL")) {
    const lines = opts.estimate;
    const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * (l.quantity ?? 1), 0);
    const rejected = new Set(opts.rejected ?? []);
    const decided = reached(s, "IN_PROGRESS");
    const estimate = await prisma.estimate.create({
      data: {
        organizationId: ws.organizationId,
        jobId: job.id,
        version: 1,
        status: !decided ? EstimateStatus.SENT : rejected.size === 0 ? EstimateStatus.APPROVED : EstimateStatus.SENT,
        subtotal,
        total: subtotal,
        createdByStaffId: reporter.staffId,
        createdAt: h(4),
        sentAt: times.waitingApprovalAt,
        decidedAt: decided && rejected.size === 0 ? times.approvedAt : null,
      },
    });
    const items = await prisma.estimateItem.createManyAndReturn({
      data: lines.map((l) => ({
        estimateId: estimate.id,
        type: l.type,
        description: l.description,
        quantity: l.quantity ?? 1,
        unitPrice: l.unitPrice,
        lineTotal: l.unitPrice * (l.quantity ?? 1),
      })),
    });
    if (decided) {
      const isStaffDecision = opts.approval.method === ApprovalMethod.STAFF_DECISION;
      const approval = await prisma.approval.create({
        data: {
          organizationId: ws.organizationId,
          jobId: job.id,
          estimateId: estimate.id,
          method: opts.approval.method,
          note: opts.approval.note,
          decidedByStaffId: isStaffDecision ? approver.staffId : null,
          loggedByStaffId: isStaffDecision || opts.approval.method === ApprovalMethod.IN_APP ? null : approver.staffId,
          decidedByCustomerId: opts.approval.method === ApprovalMethod.IN_APP ? opts.customerId : null,
          createdAt: times.approvedAt,
        },
      });
      await prisma.approvalItemDecision.createMany({
        data: items.map((item, i) => ({ approvalId: approval.id, estimateItemId: item.id, decision: rejected.has(i) ? "REJECTED" : "APPROVED" })),
      });
      approvedLines = lines.filter((_, i) => !rejected.has(i));
    }
  }

  // Work actually done: parts/labor recorded during the repair.
  const finalLines = opts.finalLines ?? approvedLines;
  if (reached(s, "REPAIR_COMPLETE") && finalLines.length > 0) {
    for (const l of finalLines) {
      if (l.type === EstimateItemType.PART) {
        await prisma.jobPart.create({
          data: { organizationId: ws.organizationId, jobId: job.id, name: l.description, quantity: l.quantity ?? 1, unitPrice: l.unitPrice, warrantyMonths: l.warrantyMonths, createdAt: times.qualityCheckAt },
        });
      } else {
        await prisma.jobLabor.create({
          data: { organizationId: ws.organizationId, jobId: job.id, description: l.description, amount: l.unitPrice * (l.quantity ?? 1), createdAt: times.qualityCheckAt },
        });
      }
    }
  }

  // Issued invoice + payments + permanent service record (closed repairs only).
  if (reached(s, "CLOSED")) {
    const lineItems = finalLines.map((l) => ({
      type: l.type,
      description: l.description,
      quantity: l.quantity ?? 1,
      unitPrice: l.unitPrice,
      discount: 0,
      lineTotal: l.unitPrice * (l.quantity ?? 1),
    }));
    const invoiceTotal = lineItems.reduce((sum, i) => sum + i.lineTotal, 0);
    const invoice = await prisma.invoice.create({
      data: {
        organizationId: ws.organizationId,
        jobId: job.id,
        version: 1,
        status: InvoiceStatus.ISSUED,
        subtotal: invoiceTotal,
        total: invoiceTotal,
        createdByStaffId: reporter.staffId,
        issuedAt: times.readyAt,
        createdAt: times.readyAt,
        items: { create: lineItems },
      },
    });
    const paidAmount = opts.payment ? Math.round(invoiceTotal * opts.payment.fraction) : 0;
    if (paidAmount > 0) {
      await prisma.payment.create({
        data: {
          organizationId: ws.organizationId,
          invoiceId: invoice.id,
          amount: paidAmount,
          method: opts.payment!.method,
          reference: opts.payment!.reference,
          paidAt: times.collectedAt,
          recordedByStaffId: reporter.staffId,
        },
      });
    }
    const warrantyMonths = finalLines.reduce((max, l) => Math.max(max, l.warrantyMonths ?? 0), 0);
    await prisma.serviceRecord.create({
      data: {
        jobId: job.id,
        vehicleId: opts.vehicleId,
        organizationId: ws.organizationId,
        garageId: ws.garageId,
        serviceDate: times.collectedAt,
        mileage: opts.odometer,
        summary: {
          complaint: opts.complaint,
          diagnoses: opts.diagnosis
            ? [{ observedProblem: opts.diagnosis.observedProblem, confirmedCause: opts.diagnosis.confirmedCause ?? null, recommendedRepair: opts.diagnosis.recommendedRepair, severity: opts.diagnosis.severity, createdAt: h(3).toISOString() }]
            : [],
          notes: (opts.notes ?? []).map((note, i) => ({ note, createdAt: h(4 + i).toISOString() })),
          workPerformed: {
            parts: finalLines
              .filter((l) => l.type === EstimateItemType.PART)
              .map((l) => ({ name: l.description, partNumber: null, brand: null, condition: "NEW", quantity: l.quantity ?? 1, warrantyMonths: l.warrantyMonths ?? null })),
            labor: finalLines.filter((l) => l.type === EstimateItemType.LABOR).map((l) => ({ description: l.description, hours: null })),
          },
          estimateApproved: opts.estimate
            ? { version: 1, total: opts.estimate.reduce((sum, l) => sum + l.unitPrice * (l.quantity ?? 1), 0), items: opts.estimate.map((l) => ({ description: l.description, type: l.type })) }
            : null,
          invoice: { total: invoiceTotal, currency: "ETB", amountPaid: paidAmount, balance: invoiceTotal - paidAmount },
          warrantyMonths: warrantyMonths || null,
        },
      },
    });
  }

  for (const photo of opts.photos ?? []) {
    await addPhoto(ws, { jobId: job.id }, { ...photo, at: h(photo.hours), byKey: photo.byKey ?? opts.reporterKey });
  }

  return job;
}

const P = EstimateItemType.PART;
const T = AttachmentTag;
const L = EstimateItemType.LABOR;

// ─────────────────────────────────────────────────────────────────────────
// Tenants
// ─────────────────────────────────────────────────────────────────────────

async function seedPlatform() {
  await createOrganization({
    name: "Le Garage Platform (internal)",
    kind: OrganizationKind.PLATFORM,
    createdDaysAgo: 120,
    staff: [{ key: "admin", email: "admin@legarage.dev", phone: "+251911000005", fullName: "Le Garage Support", role: Role.PLATFORM_ADMIN }],
  });
}

async function seedFleet(garageOrganizationId: string) {
  const ws = await createOrganization({
    name: "Demo Logistics PLC (demo data)",
    kind: OrganizationKind.FLEET,
    phone: "+251911500000",
    address: "Kaliti, Addis Ababa",
    createdDaysAgo: 75,
    staff: [
      // The owner holds the account and oversees; the supervisor (Role.MANAGER)
      // runs day-to-day and approves spend (docs/FLEET.md §5).
      { key: "owner", email: "fleet-owner@legarage.dev", phone: "+251911500001", fullName: "Selam Bekele", role: Role.OWNER },
      { key: "manager", email: "supervisor@legarage.dev", phone: "+251911500002", fullName: "Dawit Mengistu", role: Role.MANAGER },
      { key: "coordinator", email: "coordinator@legarage.dev", phone: "+251911500003", fullName: "Tigist Alemayehu", role: Role.FRONT_DESK },
      { key: "coordinator2", email: "coordinator2@legarage.dev", phone: "+251911500005", fullName: "Abel Tesfaye", role: Role.FRONT_DESK },
      { key: "mechanic", email: "mechanic@legarage.dev", phone: "+251911500004", fullName: "Yonas Tadesse", role: Role.TECHNICIAN },
      { key: "former", email: "former.coordinator@legarage.dev", phone: "+251911500006", fullName: "Lidya Mekonnen (left)", role: Role.FRONT_DESK, active: false },
    ],
  });
  const org = { organizationId: ws.organizationId };

  // A garage that's on Le Garage itself: repairs go to it as work orders (docs/WORK-ORDERS.md).
  const bole = await prisma.serviceProvider.create({
    data: { ...org, name: "Bole Auto Care", phone: "+251911000000", address: "Bole Road, Addis Ababa", garageOrganizationId, notes: "On Le Garage — send repairs as work orders." },
  });

  const [kality, megenagna, lideta] = await Promise.all(
    [
      { name: "Kality Truck Service", phone: "+251911600001", address: "Kaliti, Addis Ababa", notes: "Heavy trucks — engines, gearboxes, brakes. Contact: Ato Getachew." },
      { name: "Megenagna Auto Electric", phone: "+251911600002", address: "Megenagna, Addis Ababa", notes: "Alternators, starters, wiring." },
      { name: "Lideta Tyre Center", phone: "+251911600003", address: "Lideta, Addis Ababa", notes: "Tyres and wheel alignment. Pays on monthly statement." },
    ].map((p) => prisma.serviceProvider.create({ data: { ...org, ...p } })),
  );

  const v = async (
    licensePlate: string,
    make: string,
    model: string,
    year: number,
    vehicleType: VehicleType,
    lastKnownMileage: number,
    status: VehicleStatus,
    profile: { color: string; fuelType: FuelType; acquired: string; driverName?: string; driverPhone?: string; notes?: string; vin?: string; photo: string },
  ) => {
    const { photo, acquired, ...rest } = profile;
    const vehicle = await prisma.vehicle.create({
      data: { ...org, licensePlate, make, model, year, vehicleType, lastKnownMileage, status, ...rest, acquiredAt: new Date(acquired), createdAt: at(74) },
    });
    await addPhoto(ws, { vehicleId: vehicle.id }, { file: photo, tag: T.VEHICLE_PROFILE, caption: `${make} ${model} — profile photo`, at: at(74), byKey: "coordinator" });
    return vehicle;
  };

  const fsr1 = await v("3-A12345", "Isuzu", "FSR", 2018, VehicleType.TRUCK, 241500, VehicleStatus.IN_MAINTENANCE, {
    color: "White", fuelType: FuelType.DIESEL, acquired: "2018-06-12", vin: "JALFSR34J7000123", photo: "vehicle-3A12345.jpg",
    driverName: "Getahun Assefa", driverPhone: "+251911800101", notes: "Addis–Adama–Mojo distribution route. Insured with Demo Insurance S.C.",
  });
  const npr = await v("3-A23456", "Isuzu", "NPR", 2020, VehicleType.TRUCK, 158200, VehicleStatus.IN_MAINTENANCE, {
    color: "White / blue stripe", fuelType: FuelType.DIESEL, acquired: "2020-02-03", photo: "vehicle-3A23456.jpg",
    driverName: "Mulugeta Bekele", driverPhone: "+251911800102", notes: "City deliveries — Merkato and Piassa.",
  });
  const hilux = await v("3-B34567", "Toyota", "Hilux", 2019, VehicleType.PICKUP, 132500, VehicleStatus.IN_MAINTENANCE, {
    color: "Silver", fuelType: FuelType.DIESEL, acquired: "2019-09-20", photo: "vehicle-3B34567.jpg",
    driverName: "Samuel Kebede", driverPhone: "+251911800103", notes: "Field supervisor's pickup.",
  });
  const hiace = await v("3-B45678", "Toyota", "Hiace", 2017, VehicleType.VAN, 287400, VehicleStatus.IN_MAINTENANCE, {
    color: "White", fuelType: FuelType.DIESEL, acquired: "2017-04-11", photo: "vehicle-3B45678.jpg",
    driverName: "Tesfaye Haile", driverPhone: "+251911800104", notes: "Staff shuttle, Kaliti depot ↔ Bole office.",
  });
  const faw = await v("3-C56789", "FAW", "J6", 2021, VehicleType.TRUCK, 96000, VehicleStatus.UNAVAILABLE, {
    color: "Red", fuelType: FuelType.DIESEL, acquired: "2021-11-05", photo: "vehicle-3C56789.jpg",
    notes: "Off the road after the Saris collision — waiting for the insurance assessor before chassis work.",
  });
  const dzire = await v("3-C67890", "Suzuki", "Dzire", 2016, VehicleType.CAR, 201300, VehicleStatus.ACTIVE, {
    color: "Silver", fuelType: FuelType.PETROL, acquired: "2016-08-30", photo: "vehicle-3C67890.jpg",
    driverName: "Hana Tadesse", driverPhone: "+251911800106", notes: "Finance team car — daily bank runs.",
  });
  const fsr2 = await v("3-D78901", "Isuzu", "FSR", 2019, VehicleType.TRUCK, 214800, VehicleStatus.ACTIVE, {
    color: "White", fuelType: FuelType.DIESEL, acquired: "2019-05-14", photo: "vehicle-3D78901.jpg",
    driverName: "Bereket Alemu", driverPhone: "+251911800107", notes: "Long haul — Dire Dawa twice a month.",
  });
  await v("3-E89012", "Toyota", "Land Cruiser 79", 2012, VehicleType.CAR, 412000, VehicleStatus.RETIRED, {
    color: "Beige", fuelType: FuelType.DIESEL, acquired: "2012-01-17", photo: "vehicle-3E89012.jpg",
    notes: "Retired in 2026 — kept for records.",
  });
  await addPhoto(ws, { vehicleId: fsr1.id }, { file: "doc-3A12345-insurance.jpg", tag: T.DOCUMENT, caption: "Insurance certificate 2026", at: at(70), byKey: "coordinator" });
  await addPhoto(ws, { vehicleId: faw.id }, { file: "damage-3C56789-bumper.jpg", tag: T.DAMAGE, caption: "Collision damage at Saris, photographed on site", at: at(26), byKey: "coordinator" });

  const managerApproval = (note: string) => ({ method: ApprovalMethod.STAFF_DECISION, byKey: "manager", note });

  // ── Completed history (feeds service history + reports) ──
  await createRepair(ws, {
    vehicleId: dzire.id, serviceProviderId: kality.id, reporterKey: "coordinator", stage: "CLOSED",
    complaint: "Clutch slipping on hills", odometer: 188400, reportedDaysAgo: 62, durationHours: 30,
    diagnosis: { observedProblem: "Clutch plate worn to rivets", severity: "MEDIUM", recommendedRepair: "Replace clutch kit" },
    estimate: [
      { type: P, description: "Clutch kit (plate, cover, bearing)", unitPrice: etb(14500), warrantyMonths: 6 },
      { type: L, description: "Gearbox removal and clutch replacement", unitPrice: etb(4000) },
    ],
    approval: managerApproval("Approved — car is used daily for bank runs"),
    payment: { method: PaymentMethod.BANK_TRANSFER, fraction: 1, reference: "CBE-221903" },
    photos: [
      { file: "dzire-clutch-oldpart.jpg", tag: T.OLD_PART, caption: "Old clutch plate — worn to the rivets", hours: 26, byKey: "coordinator" },
      { file: "dzire-clutch-receipt.jpg", tag: T.RECEIPT, caption: "Kality Truck Service receipt", hours: 30 },
    ],
  });
  await createRepair(ws, {
    vehicleId: fsr1.id, serviceProviderId: kality.id, reporterKey: "coordinator", stage: "CLOSED",
    complaint: "Brakes pulling to the left under load", odometer: 236900, reportedDaysAgo: 45, durationHours: 52,
    diagnosis: { observedProblem: "Left front caliper seized, pads below limit", severity: "HIGH", recommendedRepair: "Rebuild caliper, replace pads on both sides" },
    estimate: [
      { type: P, description: "Brake pads, front axle set", unitPrice: etb(6800), warrantyMonths: 3 },
      { type: P, description: "Caliper rebuild kit", unitPrice: etb(3200) },
      { type: L, description: "Brake service, front axle", unitPrice: etb(3500) },
    ],
    approval: managerApproval("Safety item — go ahead"),
    payment: { method: PaymentMethod.BANK_TRANSFER, fraction: 1, reference: "CBE-224410" },
    photos: [
      { file: "fsr-brakes-before.jpg", tag: T.BEFORE_REPAIR, caption: "Seized left caliper at inspection", hours: 3, byKey: "mechanic" },
      { file: "fsr-brakes-oldpart.jpg", tag: T.OLD_PART, caption: "Removed pads — 2 mm left", hours: 40 },
      { file: "fsr-brakes-after.jpg", tag: T.AFTER_REPAIR, caption: "New pads, rebuilt caliper", hours: 48 },
      { file: "fsr-brakes-receipt.jpg", tag: T.RECEIPT, caption: "Kality Truck Service receipt", hours: 52 },
    ],
  });
  await createRepair(ws, {
    vehicleId: fsr2.id, serviceProviderId: kality.id, reporterKey: "coordinator", stage: "CLOSED",
    complaint: "Gear crunching between 3rd and 4th", odometer: 214800, reportedDaysAgo: 18, durationHours: 96,
    diagnosis: { observedProblem: "3rd/4th synchro ring worn; clutch fork bushing loose", severity: "HIGH", recommendedRepair: "Overhaul gearbox synchros; optional: replace clutch fork bushing" },
    estimate: [
      { type: P, description: "Synchro ring set", unitPrice: etb(22000), warrantyMonths: 6 },
      { type: L, description: "Gearbox removal and overhaul", unitPrice: etb(18000) },
      { type: P, description: "Clutch fork bushing (optional)", unitPrice: etb(2500) },
    ],
    rejected: [2],
    approval: managerApproval("Approve the gearbox work; skip the optional bushing this time"),
    payment: { method: PaymentMethod.BANK_TRANSFER, fraction: 0.5, reference: "CBE-230118 (first half)" },
    notes: ["Provider says 4 days because the synchro ring is coming from Merkato"],
    photos: [
      { file: "fsr2-gearbox-before.jpg", tag: T.BEFORE_REPAIR, caption: "Gearbox out for overhaul", hours: 20 },
      { file: "fsr2-gearbox-oldpart.jpg", tag: T.OLD_PART, caption: "Worn 3rd/4th synchro ring", hours: 70 },
      { file: "fsr2-gearbox-receipt.jpg", tag: T.RECEIPT, caption: "Receipt — 50% paid on collection", hours: 96 },
    ],
  });
  await createRepair(ws, {
    vehicleId: dzire.id, serviceProviderId: kality.id, reporterKey: "coordinator", stage: "CLOSED",
    complaint: "Scheduled 200,000 km service", odometer: 201300, reportedDaysAgo: 9, durationHours: 6,
    estimate: [
      { type: P, description: "Engine oil 5W-30 (4L) + oil filter", unitPrice: etb(3900) },
      { type: P, description: "Air filter", unitPrice: etb(1100) },
      { type: L, description: "Service labour", unitPrice: etb(1500) },
    ],
    approval: managerApproval("Routine service"),
    payment: { method: PaymentMethod.CASH, fraction: 1 },
    photos: [{ file: "dzire-service-receipt.jpg", tag: T.RECEIPT, caption: "200,000 km service receipt", hours: 6 }],
  });
  await createRepair(ws, {
    vehicleId: faw.id, serviceProviderId: kality.id, reporterKey: "coordinator", stage: "CLOSED",
    complaint: "Front bumper and headlamp damaged — minor collision at Saris", odometer: 95800, reportedDaysAgo: 26, durationHours: 20,
    estimate: [
      { type: P, description: "Headlamp assembly (left)", unitPrice: etb(9500) },
      { type: L, description: "Bumper straightening and fitting", unitPrice: etb(2500) },
    ],
    approval: managerApproval("Temporary repair until insurance assesses the chassis"),
    payment: { method: PaymentMethod.TELEBIRR, fraction: 1, reference: "TB-88231" },
    photos: [
      { file: "faw-collision-after.jpg", tag: T.AFTER_REPAIR, caption: "Headlamp replaced, bumper refitted", hours: 18 },
      { file: "faw-collision-receipt.jpg", tag: T.RECEIPT, caption: "Kality Truck Service receipt", hours: 20 },
    ],
  });

  // ── Open work, one at each stage of the workflow ──
  // Awaiting the fleet manager's decision (the manager's to-do).
  await createRepair(ws, {
    vehicleId: fsr1.id, serviceProviderId: kality.id, reporterKey: "coordinator", stage: "AWAITING_APPROVAL",
    complaint: "Engine overheats on the Adama route; driver reports coolant smell", odometer: 241500, reportedDaysAgo: 1.2,
    diagnosis: { observedProblem: "Radiator core leaking; water pump bearing noisy", severity: "HIGH", recommendedRepair: "Replace radiator and water pump, flush coolant" },
    estimate: [
      { type: P, description: "Radiator assembly", unitPrice: etb(18500), warrantyMonths: 12 },
      { type: P, description: "Water pump", unitPrice: etb(8500), warrantyMonths: 6 },
      { type: L, description: "Replace radiator + pump, coolant flush", unitPrice: etb(4500) },
    ],
    approval: managerApproval(""),
    photos: [
      { file: "fsr-radiator-before.jpg", tag: T.BEFORE_REPAIR, caption: "Coolant leaking at the radiator core", hours: 3, byKey: "mechanic" },
      { file: "fsr-radiator-pump.jpg", tag: T.DAMAGE, caption: "Water pump bearing play", hours: 3.5, byKey: "mechanic" },
    ],
  });
  // Approved and being repaired.
  await createRepair(ws, {
    vehicleId: npr.id, serviceProviderId: megenagna.id, reporterKey: "coordinator", stage: "IN_PROGRESS",
    complaint: "Battery not charging; alternator warning light on", odometer: 158200, reportedDaysAgo: 2.2,
    diagnosis: { observedProblem: "Alternator output 11.8V at idle — regulator failed", severity: "MEDIUM", recommendedRepair: "Replace alternator" },
    estimate: [
      { type: P, description: "Alternator (rebuilt)", unitPrice: etb(9500), warrantyMonths: 3 },
      { type: L, description: "Alternator replacement", unitPrice: etb(2500) },
    ],
    approval: managerApproval("OK — truck is needed for Thursday's Mojo delivery"),
    photos: [{ file: "npr-alternator-dash.jpg", tag: T.BEFORE_REPAIR, caption: "Driver's photo of the warning light", hours: 0.5 }],
  });
  // Repair complete; final bill recorded but not yet invoiced (the coordinator's to-do).
  await createRepair(ws, {
    vehicleId: hilux.id, serviceProviderId: lideta.id, reporterKey: "coordinator", stage: "REPAIR_COMPLETE",
    complaint: "Rear tyres worn smooth, vibration above 80 km/h", odometer: 132500, reportedDaysAgo: 3, durationHours: 50,
    diagnosis: { observedProblem: "Rear tyres at 1.5mm; front wheels out of balance", severity: "MEDIUM", recommendedRepair: "Two new rear tyres, balance all four" },
    estimate: [
      { type: P, description: "Tyre 265/65R17 (rear)", unitPrice: etb(11200), quantity: 2 },
      { type: L, description: "Fitting, balancing and alignment", unitPrice: etb(1800) },
    ],
    approval: managerApproval("Approved"),
    photos: [
      { file: "hilux-tyres-before.jpg", tag: T.BEFORE_REPAIR, caption: "Rear tread at 1.5 mm", hours: 2 },
      { file: "hilux-tyres-after.jpg", tag: T.AFTER_REPAIR, caption: "Two new rear tyres fitted", hours: 46 },
      { file: "hilux-tyres-receipt.jpg", tag: T.RECEIPT, caption: "Lideta Tyre Center bill", hours: 46 },
    ],
  });
  // Just requested and sent to Bole Auto Care — waiting for the garage to accept.
  const hiaceJob = await createRepair(ws, {
    vehicleId: hiace.id, serviceProviderId: bole.id, reporterKey: "coordinator", stage: "REPORTED",
    complaint: "Grinding noise from front brakes; driver says pedal feels soft", odometer: 287400, reportedDaysAgo: 0.1,
    approval: managerApproval(""),
    photos: [{ file: "hiace-brakes-driver.jpg", tag: T.BEFORE_REPAIR, caption: "Photo sent by the driver", hours: 0.05 }],
  });

  return { ws, bole, dzire, hiaceJob };
}

/**
 * Two repairs between Demo Logistics and Bole Auto Care, in the exact shape
 * the API produces (docs/WORK-ORDERS.md): each company has its own job and
 * its own copies, linked only by a WorkOrder.
 */
async function seedWorkOrders(fleet: Awaited<ReturnType<typeof seedFleet>>, garage: Awaited<ReturnType<typeof seedGarage>>) {
  const f = fleet.ws;
  const g = garage.ws;

  // 1. Sent, waiting for Bole Auto Care to accept (shows in their Work orders inbox).
  await prisma.workOrder.create({
    data: {
      fleetOrganizationId: f.organizationId,
      fleetJobId: fleet.hiaceJob.id,
      garageOrganizationId: g.organizationId,
      serviceProviderId: fleet.bole.id,
      message: "Driver will drop it off at 9am — it's our staff shuttle, needed back by Friday.",
      sentByUserId: f.staff.coordinator!.userId,
      sentAt: at(0.09),
    },
  });

  // 2. Accepted, diagnosed and estimated by the garage — waiting for the fleet supervisor.
  const fleetCustomer = await prisma.customer.create({
    data: {
      organizationId: g.organizationId,
      linkedOrganizationId: f.organizationId,
      fullName: "Demo Logistics PLC (demo data)",
      phone: "+251911500000",
      notes: "Fleet customer on Le Garage — work arrives as work orders and they approve estimates in their own account.",
    },
  });
  const garageVehicle = await prisma.vehicle.create({
    data: {
      organizationId: g.organizationId,
      licensePlate: fleet.dzire.licensePlate,
      make: fleet.dzire.make,
      model: fleet.dzire.model,
      year: fleet.dzire.year,
      color: fleet.dzire.color,
      vehicleType: fleet.dzire.vehicleType,
      fuelType: fleet.dzire.fuelType,
      lastKnownMileage: 201900,
    },
  });
  await prisma.vehicle.update({ where: { id: fleet.dzire.id }, data: { status: VehicleStatus.IN_MAINTENANCE, lastKnownMileage: 201900 } });

  const shared = {
    complaint: "Air conditioning not cooling — finance team is using the car in the afternoon heat",
    odometer: 201900,
    reportedDaysAgo: 0.9,
    stage: "AWAITING_APPROVAL" as const,
    diagnosis: { observedProblem: "Refrigerant low; leak at the condenser inlet joint", severity: "LOW" as const, recommendedRepair: "Replace condenser O-ring, vacuum and recharge" },
    estimate: [
      { type: P, description: "Condenser O-ring kit + R134a refrigerant", unitPrice: etb(3400) },
      { type: L, description: "Leak repair, vacuum and recharge", unitPrice: etb(1800) },
    ],
  };
  const garageJob = await createRepair(g, {
    ...shared,
    vehicleId: garageVehicle.id,
    customerId: fleetCustomer.id,
    reporterKey: "frontdesk",
    assignedTechnicianKey: "mechanic",
    complaint: `${shared.complaint}\n\nNote from Demo Logistics PLC (demo data): Please call Hana on +251911800106 before replacing anything.`,
    approval: { method: ApprovalMethod.VERBAL_LOGGED_BY_STAFF, byKey: "frontdesk", note: "" },
    photos: [{ file: "dzire-ac-pressure.jpg", tag: T.BEFORE_REPAIR, caption: "Low pressure at the service port", hours: 3, byKey: "mechanic" }],
  });
  const fleetJob = await createRepair(f, {
    ...shared,
    vehicleId: fleet.dzire.id,
    serviceProviderId: fleet.bole.id,
    reporterKey: "coordinator",
    approval: { method: ApprovalMethod.STAFF_DECISION, byKey: "manager", note: "" },
    photos: [{ file: "dzire-ac-pressure.jpg", tag: T.BEFORE_REPAIR, caption: "Low pressure at the service port", hours: 3, byKey: "coordinator" }],
  });

  // Link the fleet's copies to the garage's originals, as WorkOrderSyncService does.
  const [gEst, fEst] = await Promise.all([
    prisma.estimate.findFirstOrThrow({ where: { jobId: garageJob.id }, include: { items: { orderBy: { createdAt: "asc" } } } }),
    prisma.estimate.findFirstOrThrow({ where: { jobId: fleetJob.id }, include: { items: { orderBy: { createdAt: "asc" } } } }),
  ]);
  await prisma.estimate.update({ where: { id: fEst.id }, data: { externalEstimateId: gEst.id } });
  for (const [i, item] of fEst.items.entries()) {
    await prisma.estimateItem.update({ where: { id: item.id }, data: { externalItemId: gEst.items[i]!.id } });
  }
  const [gDiag, fDiag] = await Promise.all([
    prisma.diagnosis.findFirstOrThrow({ where: { jobId: garageJob.id } }),
    prisma.diagnosis.findFirstOrThrow({ where: { jobId: fleetJob.id } }),
  ]);
  await prisma.diagnosis.update({ where: { id: fDiag.id }, data: { externalDiagnosisId: gDiag.id } });
  const [gPhoto, fPhoto] = await Promise.all([
    prisma.attachment.findFirst({ where: { jobId: garageJob.id } }),
    prisma.attachment.findFirst({ where: { jobId: fleetJob.id } }),
  ]);
  if (gPhoto && fPhoto) await prisma.attachment.update({ where: { id: fPhoto.id }, data: { externalAttachmentId: gPhoto.id } });

  await prisma.workOrder.create({
    data: {
      fleetOrganizationId: f.organizationId,
      fleetJobId: fleetJob.id,
      garageOrganizationId: g.organizationId,
      garageJobId: garageJob.id,
      serviceProviderId: fleet.bole.id,
      status: "ACCEPTED",
      message: "Please call Hana on +251911800106 before replacing anything.",
      sentByUserId: f.staff.coordinator!.userId,
      respondedByUserId: g.staff.frontdesk!.userId,
      sentAt: at(0.95),
      respondedAt: at(0.9),
    },
  });

  // What each side's bell shows (in-app; the SMS/email copies go through the dev log adapter at runtime).
  const notice = (userId: string, type: string, title: string, body: string, href: string, hoursAgo: number) =>
    prisma.notification.create({
      data: { userId, channel: "IN_APP", type, title, body, payload: { href }, status: "SENT", sentAt: at(hoursAgo / 24), createdAt: at(hoursAgo / 24) },
    });
  for (const key of ["owner", "manager", "frontdesk"]) {
    await notice(g.staff[key]!.userId, "WORK_ORDER_RECEIVED", "New work order from Demo Logistics PLC (demo data)", "3-B45678 Toyota Hiace: Grinding noise from front brakes; driver says pedal feels soft", "/work-orders", 2);
  }
  for (const key of ["owner", "manager"]) {
    await notice(f.staff[key]!.userId, "ESTIMATE_RECEIVED", "Estimate from Bole Auto Care needs your approval", "ETB 5,200.00 — open the repair to approve or reject each item", `/jobs/${fleetJob.id}`, 18);
  }
  for (const key of ["owner", "manager", "coordinator"]) {
    await notice(f.staff[key]!.userId, "WORK_ORDER_ACCEPTED", "Bole Auto Care accepted your work order", "3-C67890: Air conditioning not cooling", `/jobs/${fleetJob.id}`, 21);
  }
}

async function seedSecondFleet() {
  const ws = await createOrganization({
    name: "Addis Water Delivery (demo data)",
    kind: OrganizationKind.FLEET,
    phone: "+251911700000",
    address: "Bole Bulbula, Addis Ababa",
    createdDaysAgo: 14,
    staff: [{ key: "owner", email: "water-owner@legarage.dev", phone: "+251911700001", fullName: "Hirut Wolde", role: Role.OWNER }],
  });
  for (const [plate, model, mileage] of [["3-F11111", "NKR", 120300], ["3-F22222", "NKR", 98750]] as const) {
    await prisma.vehicle.create({
      data: { organizationId: ws.organizationId, licensePlate: plate, make: "Isuzu", model, year: 2021, vehicleType: VehicleType.TRUCK, lastKnownMileage: mileage },
    });
  }
}

async function seedGarage() {
  const ws = await createOrganization({
    name: "Bole Auto Care",
    kind: OrganizationKind.GARAGE,
    phone: "+251911000000",
    address: "Bole Road, Addis Ababa",
    createdDaysAgo: 110,
    staff: [
      { key: "owner", email: "owner@legarage.dev", phone: "+251911000001", fullName: "Abebe Kebede", role: Role.OWNER },
      { key: "manager", email: "manager@legarage.dev", phone: "+251911000003", fullName: "Hana Girma", role: Role.MANAGER },
      { key: "frontdesk", email: "frontdesk@legarage.dev", phone: "+251911000004", fullName: "Meron Haile", role: Role.FRONT_DESK },
      { key: "mechanic", email: "tech@legarage.dev", phone: "+251911000002", fullName: "Kebede Alemu", role: Role.TECHNICIAN },
    ],
  });
  const org = { organizationId: ws.organizationId };

  const customer = async (fullName: string, phone: string) => prisma.customer.create({ data: { ...org, fullName, phone } });
  const vehicle = async (ownerId: string, licensePlate: string, make: string, model: string, year: number, color: string, mileage: number) => {
    const created = await prisma.vehicle.create({ data: { ...org, licensePlate, make, model, year, color, lastKnownMileage: mileage, vehicleType: VehicleType.CAR } });
    await prisma.vehicleOwnerHistory.create({ data: { vehicleId: created.id, customerId: ownerId } });
    return created;
  };

  const sara = await customer("Sara Tesfaye", "+251922000000");
  const yared = await customer("Yared Hailu", "+251922000111");
  const corolla = await vehicle(sara.id, "AA-12345", "Toyota", "Corolla", 2015, "White", 85000);
  const vitz = await vehicle(yared.id, "AA-67890", "Toyota", "Vitz", 2012, "Silver", 143000);
  await addPhoto(ws, { vehicleId: corolla.id }, { file: "vehicle-AA12345.jpg", tag: T.VEHICLE_PROFILE, caption: "Toyota Corolla at intake", at: at(80), byKey: "frontdesk" });

  // Owner-mobile demo identity (docs/OWNER-APP.md): a vehicle owner, not
  // staff — "driver" so it isn't confused with the garage's Role.OWNER.
  const driver = await prisma.user.create({
    data: { email: "driver@legarage.dev", phone: sara.phone, fullName: "Sara Tesfaye", passwordHash },
  });
  await prisma.customerLink.create({ data: { userId: driver.id, customerId: sara.id, organizationId: ws.organizationId } });

  const staffApproval = (note: string) => ({ method: ApprovalMethod.VERBAL_LOGGED_BY_STAFF, byKey: "frontdesk", note });

  await createRepair(ws, {
    vehicleId: corolla.id, customerId: sara.id, reporterKey: "frontdesk", assignedTechnicianKey: "mechanic", stage: "CLOSED",
    complaint: "Annual service", odometer: 78200, reportedDaysAgo: 80, durationHours: 5,
    estimate: [
      { type: P, description: "Oil + filter", unitPrice: etb(3600) },
      { type: L, description: "Service labour", unitPrice: etb(1200) },
    ],
    approval: staffApproval("Customer approved at the counter"),
    payment: { method: PaymentMethod.TELEBIRR, fraction: 1, reference: "TB-55120" },
  });
  // Waiting on Sara — she approves this in the owner app.
  await createRepair(ws, {
    vehicleId: corolla.id, customerId: sara.id, reporterKey: "frontdesk", assignedTechnicianKey: "mechanic", stage: "AWAITING_APPROVAL",
    complaint: "Knocking sound when turning left", odometer: 85000, reportedDaysAgo: 0.2,
    diagnosis: { observedProblem: "Worn front brake pads, rotor scoring; outer CV joint boot torn", severity: "MEDIUM", recommendedRepair: "Replace pads, resurface rotors, replace CV boot" },
    estimate: [
      { type: P, description: "Front brake pads (pair)", unitPrice: etb(1200) },
      { type: L, description: "Replace pads, resurface rotors", unitPrice: etb(500) },
      { type: P, description: "CV joint boot kit", unitPrice: etb(900) },
    ],
    approval: staffApproval(""),
    photos: [{ file: "corolla-cv-boot.jpg", tag: T.BEFORE_REPAIR, caption: "Torn outer CV boot", hours: 2, byKey: "mechanic" }],
  });
  await createRepair(ws, {
    vehicleId: vitz.id, customerId: yared.id, reporterKey: "frontdesk", assignedTechnicianKey: "mechanic", stage: "IN_PROGRESS",
    complaint: "AC blowing warm air", odometer: 143000, reportedDaysAgo: 1,
    diagnosis: { observedProblem: "Refrigerant low; leak at condenser joint", severity: "LOW", recommendedRepair: "Replace O-ring, recharge" },
    estimate: [
      { type: P, description: "Condenser O-ring + refrigerant", unitPrice: etb(2800) },
      { type: L, description: "Leak repair and recharge", unitPrice: etb(1500) },
    ],
    approval: staffApproval("Spoke with Yared by phone — approved both"),
  });

  return { ws };
}

async function main() {
  if (await prisma.organization.count()) {
    console.log("Database already has data — seed skipped. Run `pnpm db:reset` to wipe and re-seed.");
    return;
  }
  passwordHash = await argon2.hash("password123");
  await prepareStorage();

  await seedPlatform();
  const garage = await seedGarage();
  const fleet = await seedFleet(garage.ws.organizationId);
  await seedSecondFleet();
  await seedWorkOrders(fleet, garage);

  console.log(`Seed complete — every password is "password123". See docs/WALKTHROUGH.md.
  ${mediaEnabled ? `${photosUploaded} demo photos uploaded (illustrations stamped DEMO IMAGE).` : "No photos (object storage was unreachable)."}

  Platform admin (Le Garage staff)    admin@legarage.dev

  Demo Logistics PLC (fleet)          fleet-owner@legarage.dev       Owner
                                      supervisor@legarage.dev        Supervisor (runs operations, approves spend)
                                      coordinator@legarage.dev       Coordinator
                                      coordinator2@legarage.dev      Coordinator
                                      mechanic@legarage.dev          Mechanic
  Addis Water Delivery (fleet)        water-owner@legarage.dev       Owner

  Bole Auto Care (garage)             owner@legarage.dev             Owner
                                      manager@legarage.dev           Manager
                                      frontdesk@legarage.dev         Front desk
                                      tech@legarage.dev              Technician

  Owner app (vehicle owner)           driver@legarage.dev            Sara Tesfaye`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
