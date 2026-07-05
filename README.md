# NADEC E2E Delivery Governance

A **SAP Fiori (UI5) portal** for the Application team to manage projects end-to-end —
from business need and ownership through design, integration, go-live readiness, and
support handover. It turns the manager's `E2E solutions.xlsx` tracker into a real,
role-based application. **SQLite locally, SAP HANA Cloud on BTP** — same model, no rewrite.

## What's here

```
app/
  project-portal/webapp/  # SAP Fiori Elements app (List Report → Object Page)
  admin-lists/webapp/     # Manager/Admin "Manage Lists" page (maintain dropdowns)
  users-admin/webapp/     # Admin-only "Users & Roles" page (manage users + roles)
  portfolio-health/webapp/# Portfolio Health dashboard (all roles)
db/
  schema.cds              # the data model (entities + 31 lookups + Users + Role enum)
  data/*.csv              # seed data (48 projects + lookups + Users)
  e2e.db                  # local SQLite DB (created by deploy — NOT committed)
  change-tracking.cds     # audit-log annotations (who changed what, when)
srv/
  service.cds             # OData service (GovernanceService @ /governance)
  auth-service.cds/.js    # AuthService @ /auth: login + Admin Users CRUD
  role-guard.js           # hybrid auth middleware (local JWT + XSUAA); DB-driven roles
  server.js               # public /login + /login-users routes for the sign-in page
  integration/sf-hr-client.js  # SuccessFactors employee lookup (destination / .env)
  annotations.cds         # Fiori UI annotations (the portal's screens & dropdowns)
  service.js              # computes Go-Live % / Readiness % on save + audit guard
  views.cds               # computed views: EmployeeAllocation (75/25), ActionRequired
mta.yaml, xs-security.json, approuter/   # BTP deployment (XSUAA + SF + HANA)
docs/
  FEATURES.md             # all services & features — start here
  DATA-MODEL.md           # full sheet→table mapping + lifecycle spec
```

> **New here? Read [docs/FEATURES.md](docs/FEATURES.md)** for a complete tour of the
> portal's services, screens, roles, dashboards, and the audit log.

## Run locally

```bash
npm install
npm run deploy:local      # create SQLite schema + load seed CSVs
npm run watch             # http://localhost:4004
```

**Open the portal:** <http://localhost:4004/project-portal/webapp/index.html>
(also linked from the index page at <http://localhost:4004>).
The OData service is at `/governance`; `/governance/Projects` is the raw project list.

> The UI5 runtime loads from the SAP CDN (`ui5.sap.com`), so the **browser needs
> internet**. The OData backend, data, and annotations are fully local/offline.

## Auth & roles

Authentication is **hybrid** (same model as the NADEC Visitor-Gate app), driven by
`srv/role-guard.js` and the `AUTH_MODE` env var:

- **Local dev (`AUTH_MODE=local`, default):** the sign-in page checks a **bcrypt**
  password against the `Users` table and exchanges it for a signed **app JWT (HS256)**.
- **Production (`AUTH_MODE=xsuaa`):** the SAP **XSUAA / IAS** Bearer token is verified with
  `@sap/xssec`. The user's **identity comes from SuccessFactors** (`<employeeId>@nadec.com.sa`);
  a first-time user is **auto-provisioned from SuccessFactors** as an Employee.

**Roles live in the app database (`Users.role`), not in XSUAA scopes** — so an Admin can grant
or revoke them from the Users screen with no redeploy (that's why `xs-security.json` ships with
no role templates).

| Role | Can |
|---|---|
| **Employee** | Read **all** projects; edit only the projects they IT-own; **cannot** create projects or (re)assign the IT Owner of any project |
| **Manager** | Full read/write on **every** project + change the **IT Owner** of any project; view the audit log; manage the dropdown lists |
| **Admin** | Everything a Manager can do **plus** the **Users** screen — add/edit users, change their **roles** and data |

Role hierarchy: **Admin ⊇ Manager ⊇ Employee** — an Admin automatically passes every
Manager-guarded rule. Rules are enforced **server-side** (`@restrict` in `srv/*.cds` +
handlers in `srv/service.js` and `srv/auth-service.js`), not just hidden in the UI.

### Local demo sign-in

Log in at <http://localhost:4004/project-portal/webapp/login.html> — pick an account and
sign in. **Demo password for every seeded account: `nadec123`** (bcrypt-hashed in the DB).

| Account | Role |
|---|---|
| `80464@nadec.com.sa` — Abdelrahman Hussien | **Admin** |
| `adel@nadec.com.sa` — Adel Hirab Alotaibi | **Manager** |
| `rayan@…`, `youssef@…`, `jehad@…`, `abdullah@…`, `khalid@…`, `basil@…`, `ali@…`, `abdulaziz@…`, `eejaz@…`, `ghada@…` | Employee |

Each account's **full name** matches the **Employees** lookup (the IT Owner column) so project
ownership resolves. Users are managed at runtime from the **Users** screen (Admin only) — new
users appear in the sign-in roster automatically.

## Using the portal

1. **Manager** opens the Projects **List Report**, clicks **Create**, fills the
   Portfolio fields, and assigns an **IT Owner** from the team.
2. The assigned **employee** opens the project (**Object Page**) and fills the tabs:
   **Business Input · E2E Readiness · Solution Details · Go-Live Checklist · Risks**.
3. **Go-Live Readiness %** and **Overall E2E Readiness %** are computed automatically
   on save (from the checklist gates and stage statuses); **Business Need** is derived
   from Business Input completeness.
4. **Action Required** and **Employee Allocation (75/25)** are read-only dashboards
   (`/governance/ActionRequired`, `/governance/EmployeeAllocation`).

## Data model in brief

- **Projects** is the master (PRJ-001…), keyed by Project ID.
- **BusinessInput / Readiness / SolutionDetails / GoLiveChecklist** are 1:1
  satellites; **Risks** is 1:many. All keyed by the same project.
- The 7-stage lifecycle lives in **Readiness**
  (Business Need → … → Operations → Post Go-Live Review).
- All dropdowns are normalized into `lookup.*` code lists (the Excel "Lists" sheet).
- **EmployeeAllocation** (75% Business / 25% Support rule) and **ActionRequired**
  are computed views — not stored.

See [docs/DATA-MODEL.md](docs/DATA-MODEL.md) for the complete spec.

## Seeded data

48 real NADEC projects. **PRJ-001 (Consumer Care Agent)** is filled end-to-end as
a worked example; the rest start at *Business Need / Missing Input*, matching the
Excel's current state.

## Getting started (for a teammate who just cloned the repo)

```bash
git clone <azure-devops-repo-url>
cd e2e-governance
npm install               # restores dependencies (node_modules is NOT in the repo)
npm run deploy:local      # builds the local SQLite DB from db/data/*.csv
npm run watch             # http://localhost:4004
```

That's it — the repo carries the **source** (`.cds` model + seed CSVs); each developer
**generates** their own local `db/e2e.db`. The DB file is intentionally git-ignored.

## About the database (SQLite now, HANA later)

The app is **database-agnostic** — SQLite is only for local development convenience:

- **`db/e2e.db`** is a *generated, disposable* file. It is **not** in the repo. Rebuild it
  anytime with `npm run deploy:local`. The real source of truth is `db/schema.cds` +
  `db/data/*.csv`.
- The **same model and code run on SAP HANA Cloud** with no changes. The `[production]`
  profile in `package.json` already switches the DB to HANA:
  ```json
  "[production]": { "requires": { "db": { "kind": "hana" } } }
  ```
- ⚠️ **Runtime list edits** (the Manager's "Manage Lists" changes) are saved into the local
  `e2e.db` and so are **per-machine** locally — they are not pushed to git. In production on
  HANA, that data lives in the shared database permanently. A full `cds deploy` reloads the
  lookup lists from the CSV baseline.

## Deploy to BTP (production)

The MTA descriptor, XSUAA security file, and approuter are already in the repo (modelled on
the NADEC Visitor-Gate app):

```
mta.yaml            # db-deployer + CAP srv (AUTH_MODE=xsuaa) + approuter + UI
xs-security.json    # XSUAA — no role scopes (roles live in the Users table)
approuter/          # XSUAA login + serves the UI5 apps + proxies /governance & /auth
.env.sample         # AUTH_MODE / JWT_SECRET / SF_* documentation
```

Build & deploy:

```bash
cds build --production
mbt build
cf deploy mta_archives/nadec-e2e-governance_0.1.0.mtar
```

On BTP the `srv` module runs with **`AUTH_MODE=xsuaa`**, so `srv/role-guard.js` verifies the
**XSUAA / IAS** token instead of the local app JWT. **Identity comes from SuccessFactors**
(`<employeeId>@nadec.com.sa`) via the bound **`SF_PRD_Raw`** destination; a first-time user is
auto-provisioned as an Employee, then an **Admin** promotes them from the Users screen. Roles are
**not** XSUAA scopes — they stay in the `Users` table, so no redeploy is needed to change them.

> The backend XSUAA path (`srv/role-guard.js`, `srv/auth-service.js`) is implemented; the MTA /
> approuter descriptors are provided as the deployment starting point and should be built &
> smoke-tested on your BTP space (bind the `SF_PRD_Raw` destination + a real `JWT_SECRET`).

## Uploading to Azure DevOps (first push)

This repo is ready to push. From the project root:

```bash
git init
git add .
git commit -m "Initial commit — NADEC E2E Delivery Governance portal"
git branch -M main
git remote add origin https://<org>@dev.azure.com/<org>/<project>/_git/<repo>
git push -u origin main
```

> `.gitignore` already excludes `node_modules/` and `db/*.db`, so only source is pushed
> (no 66 MB of dependencies, no local database). Azure DevOps will show the Azure-specific
> remote URL on the repo's **Clone** button — use that for `git remote add origin`.

> **Optional CI:** Azure Pipelines can build with a minimal `azure-pipelines.yml`
> (`npm ci` → `npm run deploy:local` → tests). Not included yet; add when your team wants CI.

