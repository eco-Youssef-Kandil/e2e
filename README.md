# NADEC E2E Delivery Governance

A **SAP Fiori (UI5) portal** for the Application team to manage projects end-to-end —
from business need and ownership through design, integration, go-live readiness, and
support handover. It turns the manager's `E2E solutions.xlsx` tracker into a real,
role-based application. **SQLite locally, SAP HANA Cloud on BTP** — same model, no rewrite.

## What's here

```
app/
  project-portal/webapp/  # SAP Fiori Elements app (List Report → Object Page)
  admin-lists/webapp/     # Manager-only "Manage Lists" admin page (maintain dropdowns)
db/
  schema.cds              # the data model (entities + 31 lookup code lists)
  data/*.csv              # seed data extracted from the Excel (48 projects + lookups)
  e2e.db                  # local SQLite DB (created by deploy — NOT committed)
  change-tracking.cds     # audit-log annotations (who changed what, when)
srv/
  service.cds             # OData service (GovernanceService @ /governance)
  annotations.cds         # Fiori UI annotations (the portal's screens & dropdowns)
  service.js              # computes Go-Live % / Readiness % on save + audit guard
  views.cds               # computed views: EmployeeAllocation (75/25), ActionRequired
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

## Logging in (mocked users)

Auth is mocked locally — log in with any of these (username = password):

| User | Role | Can |
|---|---|---|
| `adel` | **Manager** | Create projects, assign IT Owner, edit everything, **view the audit log**, **manage the dropdown lists** |
| `rayan`, `youssef`, `jehad`, `abdullah`, `khalid`, `basil`, `ali`, `abdulaziz`, `eejaz`, `abdelrahman`, `ghada` | Employee | Edit their assigned projects' sections (no create, no audit log, no list management) |

Each user maps to a real name in the **Employees** lookup (the IT Owner column).
Only **`adel`** (Adel Alotaibi) is the Manager; everyone else is an Employee.

> These are **mock dev logins only** (plaintext passwords in `package.json`). On BTP they
> are replaced by SAP IAS / XSUAA — see the deploy section below.

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

```bash
cds add hana              # adds HANA config + mta build descriptor
# create / bind a SAP HANA Cloud instance on your BTP subaccount, then:
cds deploy                # deploys schema + seed data to HANA
```

For a full managed deployment (approuter + XSUAA auth + Fiori launchpad) use the standard
CAP MTA flow: `cds add mta`, `mbt build`, `cf deploy`. The mocked logins in `package.json`
are replaced by **SAP IAS / XSUAA**; `db/schema.cds`, `srv/`, and the apps under `app/` do
not change.

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

