# Platform Walkthrough — who uses Le Garage, and how

This guide walks through the whole platform one person at a time, using
the demo data from `pnpm db:reset` (seed: `packages/database/prisma/seed.ts`).
Each scenario names the login to use and what you should see at each
step, so you can demo the product, onboard someone, or check that a change
didn't break a workflow.

Every demo organization is marked **(demo data)** or uses `@legarage.dev`
logins. **Every password is `password123`.**

---

## 0. Start the platform

```bash
pnpm install
brew services start postgresql@17         # or docker compose … up -d postgres
# MinIO, only needed for photo uploads:
MINIO_ROOT_USER=legarage MINIO_ROOT_PASSWORD=legarage123 minio server ~/minio-data --console-address :9001

pnpm build                                  # shared packages + apps
pnpm db:reset                               # ⚠ wipes the local dev database, migrates, seeds demo data
pnpm --filter @le-garage/api dev            # API      → http://localhost:4000/api/v1
pnpm --filter @le-garage/garage-web dev     # Web app  → http://localhost:3000
pnpm --filter @le-garage/owner-mobile start # Owner app (Expo) — optional
```

`pnpm db:reset` destroys everything in the database it points at. It's
only for your local development database, never a shared or production one.

## 1. The cast

| Who | Login | Lands on | Their job in one line |
|---|---|---|---|
| **Le Garage support** (platform admin) | `admin@legarage.dev` | Platform console | Oversee every organization, control who has access |
| **Fleet owner** — Selam, Demo Logistics PLC | `fleet-owner@legarage.dev` | Fleet overview | Holds the account: oversees everything, hires employees, administers the fleet |
| **Supervisor** — Dawit | `supervisor@legarage.dev` | Fleet overview | Runs day-to-day operations, approves repair spend, manages employees |
| **Coordinators** — Tigist, Abel | `coordinator@legarage.dev`, `coordinator2@legarage.dev` | Fleet overview | Creates service requests, sends them to garages, records bills and photos for offline garages |
| **Mechanic** — Yonas (in-house) | `mechanic@legarage.dev` | Open repairs | Inspects vehicles, moves repairs through the workshop |
| **Second fleet owner** — Hirut, Addis Water Delivery | `water-owner@legarage.dev` | Fleet overview | A separate company (shows isolation) |
| **Garage owner** — Abebe, Bole Auto Care | `owner@legarage.dev` | Garage overview | Runs the garage |
| **Garage front desk** — Meron | `frontdesk@legarage.dev` | Garage overview | Checks cars in, sends estimates, takes payment |
| **Garage technician** — Kebede | `tech@legarage.dev` | Garage overview | Diagnoses and repairs |
| **Vehicle owner** — Sara (owner app) | `driver@legarage.dev` | Owner mobile app | Approves her car's repair from her phone |

What's already in the demo fleet (Demo Logistics PLC):

| Vehicle | State | Why it's there |
|---|---|---|
| 3-A12345 Isuzu FSR | **Awaiting approval** — radiator + pump, ETB 31,500 | Supervisor's decision |
| 3-A23456 Isuzu NPR | **Repairing** — alternator at Megenagna Auto Electric | Mechanic finishes it |
| 3-B34567 Toyota Hilux | **Repair complete** — tyres recorded, not invoiced yet | Coordinator closes it out |
| 3-B45678 Toyota Hiace | **Requested** today — brake grinding, **sent to Bole Auto Care** (on Le Garage), waiting for them to accept | Garage accepts it (scenario 4d) |
| 3-C67890 Suzuki Dzire | **Awaiting approval** — A/C repair accepted and estimated by Bole Auto Care, ETB 5,200 | Supervisor approves (scenario 4d) |
| 3-C56789 FAW J6 | **Unavailable** (manual) — waiting for insurance | Supervisor's manual status |
| 3-C67890 Suzuki Dzire, 3-D78901 Isuzu FSR | Active, with completed repair history | History + reports |
| 3-E89012 Land Cruiser 79 | **Retired** | Can't open new repairs |

---

## 2. Scenario — a new fleet company signs up

*A logistics company hears about Le Garage and wants to try it.*

1. Go to **/register**, choose **"My company's vehicles"**, enter the company name, your name, email or phone, and a password, then **Create fleet account**. You land on an empty fleet **Overview**.
2. **Vehicles → Add vehicle**: plate, make, model, and optionally type, year, odometer, VIN. Repeat for each vehicle. Each one starts as **Active**.
3. **Providers → Add provider**: the garages you already use (name, phone, location, notes such as "pays on monthly statement"). Only your company can see this list.
4. **Team → Invite**: add people with a temporary password and a role:
   - **Supervisor**: runs day-to-day operations, approves spend, manages employees.
   - **Coordinator**: day-to-day repairs.
   - **Mechanic**: in-house workshop staff.
5. Share the web address and each person's login. You're ready for scenario 3.

## 3. Scenario — a truck breaks down, start to finish (the core loop)

*The Hiace's brakes are grinding. Follow it from report to back on the road, then do the same steps on the demo trucks that are already further along.*

| # | Who | Where | Do this | You should see |
|---|---|---|---|---|
| 1 | Coordinator | Top bar → **Request service** | Pick the vehicle, say what it needs (a service due, a noise, new tyres…), odometer, garage (or "Decide later") | Request opens as **Requested**; vehicle flips to **In maintenance** |
| 2 | Coordinator | The repair → **Service provider** | Assign the garage it's going to (e.g. Kality Truck Service) | Provider shown in the header |
| 3 | Coordinator / Mechanic | **Start inspection** | Moves to **Inspection**. Add the diagnosis (what was found, severity, recommended repair), notes, and **photo proof** on the Overview tab — label each photo *Before repair*, *Damage*, *Replaced part*, *After repair* or *Receipt* | Timeline shows each step with its time |
| 4 | Coordinator | **Estimate** tab | Enter the garage's quote line by line (parts / labor, quantity, price in ETB) → **Save draft estimate** → **Submit for approval** | Repair moves to **Awaiting approval**; it appears in the manager's queue. The coordinator *can't* approve it |
| 5 | Supervisor | Overview → **Waiting for approval** → the repair → **Estimate** | Approve or reject each line, add a note → **Approve ETB …** or **Reject estimate** | "Approved by Dawit Mengistu (Supervisor) · time". Repair moves to **Approved** by itself. If rejected, the coordinator can **Revise estimate** (new version) or **Cancel repair** |
| 6 | Mechanic / Supervisor | Repair header | **Start repair** → (Waiting on parts if needed) → **Start quality check** → **Mark repair complete** | Each step timestamped in the timeline and Activity tab |
| 7 | Coordinator | **Parts & labor** tab | Record what the garage *actually* billed | Shows the actual costs |
| 8 | Coordinator | **Invoice & payment** tab | **Generate invoice** (built from recorded parts and labor) → **Issue invoice** → **Record payment** (cash / Telebirr / bank transfer, with reference) | Invoice status ISSUED; balance updates; partial payments allowed |
| 9 | Coordinator | Repair header → **Return to service** | Confirm | Repair **Back in service** → closed; vehicle back to **Active**; the visit — findings, cost, time off the road, photos — is now on the **vehicle profile** |

To try steps 5–9 without the setup, use the seeded repairs:
- **Step 5:** sign in as the supervisor and approve the 3-A12345 radiator estimate.
- **Step 6:** sign in as the mechanic and finish the 3-A23456 alternator.
- **Steps 8–9:** sign in as the coordinator and invoice the 3-B34567 tyres, then return the Hilux to service.

## 4. Scenario — the supervisor's and owner's weekly review

1. **Overview**:
   - vehicles available vs. off the road;
   - open repairs;
   - estimates waiting for a decision, oldest first, with their amount;
   - spend this month;
   - what's still unpaid to garages.
2. **Reports**: pick **This month / Last month / Last 90 days / This year / Custom**. The figures:
   - **Invoiced, paid, unpaid**, from issued invoices only; voided invoices are excluded.
   - **Spend by category** (parts / labor) and **by provider**.
   - **By vehicle**: repairs, spend, parts/labor split, **downtime** (time off the road).
   - **Average turnaround**: from report to repair complete.
   - **Export CSV** for finance (amounts in ETB).
3. **Vehicles → a vehicle** opens its **profile** (scenario 4b). Use the status menu to mark it **Unavailable** (e.g. awaiting insurance) or **Retired**. A retired vehicle can't get new service requests. A manual status is never overwritten by repairs opening or closing.

Every number comes from recorded repairs and invoices. Nothing is estimated or projected.

## 4b. Scenario — a vehicle's profile and photo proof

*The owner wants to know everything that's happened to truck 3-A12345 — and see it.*

1. Sign in as `fleet-owner@legarage.dev` → **Vehicles** → **3-A12345**.
2. The profile header shows:
   - the vehicle photo;
   - type, colour, and the date it joined the fleet;
   - odometer, fuel, the assigned driver and their phone, and the VIN;
   - notes (route, insurer).
   **Edit profile** changes any of it.
3. The four tiles show: number of service visits, total invoiced (and anything unpaid), total time off the road, and the date of the last service.
4. **Service visits** is the vehicle's story, newest first. Each garage trip shows:
   - the dates, the odometer reading, and how long the vehicle was off the road;
   - what it needed and what the garage found;
   - the provider, and the cost (estimate or invoice);
   - its photos.
   Click any photo to open it full screen, labelled *Before repair*, *Replaced part* and so on, with its caption and date.
5. **Photos & documents**:
   - the vehicle's own photos and documents (profile photo, insurance certificate, damage);
   - every photo from every visit, filterable by label: e.g. show only **Receipt / invoice** to see every bill.
   - **Add photo** under "Vehicle photos & documents" to upload more (pick the label first).

The demo images are illustrations stamped **DEMO IMAGE**, not real photos. Receipts match the invoiced amounts.

## 4c. Scenario — the owner builds the team

*The owner hands the day-to-day to a supervisor and keeps oversight.*

1. Sign in as the owner → **Team**. The four role cards explain each role: Owner, Supervisor, Coordinator, Mechanic.
2. **Add team member**: name, email, role (with a one-line description of what that role can do), and a temporary password. Share the login with them.
3. Change someone's role from their row, or **Deactivate** them when they leave (they're signed out at once). Lidya, a former coordinator, shows how a deactivated person looks; **Reactivate** brings them back.
4. Sign in as the **supervisor** and open Team. They can add and manage coordinators and mechanics, but:
   - they're never offered the **Owner** role;
   - they can't change or deactivate the owner;
   - they can't change their own role.
   Only an owner can appoint another owner, and an organization always keeps at least one active owner.

## 4d. Scenario — the fleet sends a repair to a garage on Le Garage

*Fleets and garages are separate companies: the garage does the work in its own account; the fleet only approves and follows progress (docs/WORK-ORDERS.md).*

Already seeded:
- The Hiace brake request is **sent to Bole Auto Care, waiting for them to accept**.
- The Suzuki Dzire A/C repair has been **accepted and estimated by Bole Auto Care**, and is waiting for the supervisor.

1. **Garage front desk** (`frontdesk@legarage.dev`). The sidebar shows **Work orders 1** and the bell has "New work order from Demo Logistics PLC". (The SMS and email copies appear in the API log.)
   - Open **Work orders**. The card shows the vehicle, what it needs, and the fleet's note.
   - **Accept** creates Bole's own job for the Hiace, filed under "Demo Logistics PLC" as the customer. Or **Decline** with a reason.
2. **Garage**, on its job for the Dzire. The Estimate tab says *"Sent to Demo Logistics PLC — they approve or reject it in their Le Garage account"*. There's no share link, and the garage can't log the approval itself.
3. **Supervisor** (`supervisor@legarage.dev`).
   - The bell has "Estimate from Bole Auto Care needs your approval". Open it.
   - The repair shows "Bole Auto Care accepted this repair", with the garage's findings and photo, and a status badge instead of action buttons.
   - On the **Estimate** tab, approve or reject each line.
4. **Garage**:
   - It sees *"Approved by Dawit Mengistu for Demo Logistics PLC, in Le Garage"* and clicks **Mark approved**.
   - The **technician** (`tech@legarage.dev`) clicks **Start repair**, then quality check, then ready.
   - The front desk issues the invoice and hands the vehicle back.
5. **Supervisor**:
   - The fleet's repair follows each step on its own (Activity: "Updated by Bole Auto Care"), with a notice at each milestone.
   - The garage's invoice arrives on the Invoice tab, and the coordinator records the payment.
   - When the garage hands the vehicle back, the repair closes, the visit appears on the vehicle profile, and the vehicle returns to *Active*.
6. To start a new one: **Request service** → pick *Bole Auto Care · on Le Garage* → leave **Send to Bole Auto Care now** ticked and add a note. To connect another garage: **Providers → Find a garage on Le Garage**.

## 5. Scenario — a garage's day (Bole Auto Care)

1. **Front desk** — **New job**: find or create the customer and vehicle, odometer, complaint. The job opens as **Just arrived**.
2. **Technician** — **Start diagnosis**: add the diagnosis and photos.
3. **Front desk** — **Estimate**: build it → **Send estimate** → **Request approval**. To get the customer's decision, either:
   - **Copy customer link** for a read-only page you send over WhatsApp, Telegram or SMS; or
   - let the customer decide in the **owner app** (scenario 6); or
   - record a phone or verbal decision, with a note.
4. **Mark approved** → **Start repair** → **Quality check** → **Ready for pickup**.
5. **Invoice & payment** → generate → issue → record payment → **Complete job**. The car's service history is saved, and the customer sees it in the owner app.

Garages don't see the fleet features (providers, fleet reports), and fleets don't see customers.

## 6. Scenario — the vehicle owner approves from their phone (owner app)

1. Run the owner app (`pnpm --filter @le-garage/owner-mobile start`; set `EXPO_PUBLIC_API_URL` to your computer's IP, e.g. `http://192.168.1.10:4000/api/v1`, so a phone can reach the API).
2. Sign in as `driver@legarage.dev` (Sara). She sees her Corolla and the brake job **waiting for her approval**.
3. She approves the brake items and declines the CV boot.
4. Back in the garage web app, the front desk sees **"Approved 2 of 3 items by the customer in the owner app"** on the Estimate tab, and marks the job approved.

New owners register in the app and link to the garage's customer record by matching phone number (docs/OWNER-APP.md).

## 7. Scenario — Le Garage support (platform admin)

*A fleet customer pauses their pilot, and an employee who left still has a login.*

1. Sign in as `admin@legarage.dev`. You land on the **Platform** console, not inside any customer's account:
   - number of fleets and garages;
   - suspended organizations;
   - users, vehicles, open work;
   - the newest organizations;
   - recent admin actions.
2. **Organizations**: filter Fleets / Garages, search by name. Each row shows people, vehicles, and open work.
3. Open **Addis Water Delivery** → **Suspend access** → enter a reason → **Suspend**.
   - Everyone in that company is signed out immediately, and anyone signing in sees *"Your organization's access to Le Garage is suspended."*
   - Their data is kept exactly as it was.
   - **Reactivate** restores access.
4. In an organization's **People** list, **Deactivate** one person, with a reason (e.g. "Left the company"). They're signed out everywhere immediately.
5. **Audit log**: every admin action, plus sign-ins, approvals, and status changes across all organizations, newest first.

What the admin deliberately **can't** do:
- Edit a company's repairs, estimates, invoices, or vehicles. Those records stay the company's own.
- Change other admin accounts.
- Suspend the platform itself.

See docs/ADMIN.md.

---

## 8. Who can do what

| Action | Owner | Supervisor | Coordinator | Mechanic | Platform admin |
|---|:-:|:-:|:-:|:-:|:-:|
| Request service, assign provider, enter estimate | ✓ | ✓ | ✓ | – | – |
| Add photos, edit vehicle profile | ✓ | ✓ | ✓ | photos only | – |
| Approve / reject repair spend | ✓ | ✓ | – | – | – |
| Diagnose, notes, workshop status moves | ✓ | ✓ | some | ✓ | – |
| Record parts/labor, invoices, payments | ✓ | ✓ | ✓ | parts/labor | – |
| Change vehicle status (unavailable / retired) | ✓ | ✓ | ✓ | – | – |
| Spend reports + CSV | ✓ | ✓ | – | – | – |
| Add / change / deactivate team | ✓ | ✓ (not owners) | – | – | – |
| Appoint another owner | ✓ | – | – | – | – |
| See / suspend organizations, deactivate anyone | – | – | – | – | ✓ |

The server enforces all of these rules. The web app only hides buttons that
the server would refuse anyway.

## 9. Not built yet

- Preventive maintenance schedules and service reminders.
- Vehicle documents with expiry dates.
- Driver assignment.
- Garage (provider) logins.
- SMS/Telegram notifications.
- Re-approval when a final bill exceeds the approved estimate.

See docs/FLEET.md §9.
