# NADEC E2E Delivery Governance — Services & Features

A guide to everything the portal does: who can do what, the screens, the OData
services, the automatic logic, and the audit trail.

- **What it is:** an SAP CAP application (OData V4 backend + SAP Fiori Elements UI5 frontend)
  that turns the Application team's `E2E solutions.xlsx` tracker into a real, role-based portal.
- **Where it runs:** SQLite locally; SAP HANA Cloud on BTP (same model, no rewrite).
- **Open it:** <http://localhost:4004/project-portal/webapp/login.html>
- **Service base URL:** `/governance` (e.g. <http://localhost:4004/governance>)

---

## 1. Sign-in & roles

Sign-in is **hybrid** (same as the NADEC Visitor-Gate app), in `srv/role-guard.js`:
- **Local dev** — the sign-in page (`login.html`) checks a **bcrypt** password against the
  `Users` table and gets back a signed **app JWT (HS256)**. Demo password: `nadec123`.
- **Production (`AUTH_MODE=xsuaa`)** — SAP **XSUAA / IAS** token verified with `@sap/xssec`;
  the **username comes from SuccessFactors** (`<employeeId>@nadec.com.sa`), auto-provisioned
  on first sign-in.

**Roles are stored in the DB (`Users.role`)** — the **Admin** grants them from the Users screen
(§8), no redeploy, no XSUAA scopes.

| Role | Can |
|---|---|
| **Employee** | Read **all** projects; edit only the projects they **IT-own**; **cannot** create projects or (re)assign the IT Owner of any project |
| **Manager** | Read/write/edit **any** project + change the **IT Owner** of any project; view the audit log; manage the dropdown lists |
| **Admin** | Everything a Manager can, **plus** the **Users** screen — add/edit users, change **roles** & data |

Hierarchy **Admin ⊇ Manager ⊇ Employee** — an Admin passes every Manager rule automatically.
All rules are enforced on the **server** (the UI hiding below is convenience, not the control):
- `CREATE` / `DELETE` on Projects → **Manager/Admin only** (`@restrict` in `srv/service.cds`).
- `EDIT` a project → the assigned **IT Owner** or a Manager/Admin (`srv/service.js` `before EDIT`).
- Change a project's **IT Owner** → Manager/Admin only (`srv/service.js` `before SAVE`).
- Audit log + Manage Lists → Manager/Admin. **Users** entity → **Admin only** (`srv/auth-service.cds`).

**The buttons & fields match the permissions** — a user only sees actions they can perform
(verified in a real browser across all three roles):
- **Edit** — hidden on projects an Employee doesn't own, via `@UI.UpdateHidden : editHidden`
  (a per-row flag computed for active **and** draft reads in `srv/service.js`; FE honours it
  per instance on the Object Page).
- **IT Owner field** — read-only for Employees via `@Common.FieldControl : itOwnerFC`
  (`itOwnerFC` is an **Edm.Byte**: 1 = ReadOnly, 3 = editable; also computed on draft reads so
  the field is locked while editing). An Employee can view/edit their project but never reassign it.
- **Create / Delete** — Manager/Admin only. Fiori Elements ignores `@UI.CreateHidden`/
  `@UI.DeleteHidden` path values on the root List Report, so these buttons are hidden for
  Employees client-side in `app/project-portal/webapp/Component.js` (same pattern as the audit tab).

CAP does **not** reflect `@restrict` role grants into the OData capability annotations, which is
why the buttons are hidden explicitly. The server handlers + `@restrict` remain the real control.

A green **NADEC top bar** shows the app title, the signed-in user + role, a **Sign out**
button, role-gated **Manage Lists** / **Users** buttons, and — on a project page — a
**← Projects** back link.

---

## 2. The portal screens (Fiori Elements)

One app: a **List Report → Object Page** flow.

### Projects List Report (home)
- A **filter bar**: IT Owner, Current Phase, Risk Level, Work Category, plus free-text search.
- A **wide, scrollable table** of all projects. Default columns: **ID, Project, IT Owner, Phase**.
- More columns (Priority, Risk Level, Work Category, Business Domain, Business Requester,
  Business Owner) are **addable yourself** via the table's **Settings (gear ⚙) → Columns**;
  you can also sort, group, filter, and **export to Excel**.
- **Create** (Manager only) starts a new project; click any row to open it.

### Project Object Page (one project, tabbed)
Tabs, each mirroring an Excel sheet:

| Tab | What it holds |
|---|---|
| **General Info** | Portfolio fields: IT Owner, Work Category, Domain, Requester, Business Owner, Priority, Phase, Risk Level, Notes |
| **Business Input** | Problem statement, impact, expected benefit, KPI, baseline, target, approval, post-go-live review |
| **E2E Readiness** | The 7 lifecycle stage statuses + the computed overall readiness % |
| **Solution Details** | Systems, integration type, environment, monitoring, support owner, auth, logs, escalation |
| **Go-Live Checklist** | The 8 release gates, owners, dates, hypercare, + computed go-live readiness % |
| **Testing / QA** | Test Phase, Test Status, Bug Severity, Bug Priority, Bug Status (dropdowns) + Test Notes |
| **Risks** | Blockers/dependencies (1 project → many risks): team, impact, owner, mitigation, status |
| **Change History** | Audit trail for this project — **Manager only** (hidden for employees) |

**Editing:** click **Edit** → draft mode → change fields → **Save**. Drafts are autosaved
and don't affect the live record until activated.

**Dropdowns, not free text:** every lookup field (IT Owner, statuses, priorities, Yes/No, …)
is a **fixed-value dropdown** — you pick from the list and it shows the human name, never a code.

---

## 3. Automatic logic (computed on save)

Handled in `srv/service.js` on every project save — so dashboards show real values, not
hand-typed numbers:

- **Go-Live Readiness %** = share of the 8 checklist gates set to **Yes** (0–100%).
- **Overall E2E Readiness %** = share of the 7 lifecycle stages set to **Completed**.
- **Business Need** stage is **auto-derived** from Business Input completeness
  (Completed / Partially Defined / Missing Input) — not set by hand.

These three fields are display-only in the UI.

---

## 4. Dashboards (read-only, computed views)

| View | URL | What it shows |
|---|---|---|
| **Action Required** | `/governance/ActionRequired` | Per project, the recommended next action: *Select Work Category* → *Mitigate Risk* (High/Critical) → *Advance Readiness* (<50%) → *Review Go-Live Readiness* |
| **Employee Allocation 75/25** | `/governance/EmployeeAllocation` | Per IT Owner: total assigned, # Business Impact vs # Support/Operations, # uncategorized — supports the 75% / 25% target |

Both are derived live from the projects; nothing is stored.

---

## 5. Audit log (Change History) — Manager only

Powered by the `@cap-js/change-tracking` plugin. Every create / update / delete on a project
or any of its sections is recorded: **who, when, which field, old value → new value**.

- **Where:** the **Change History** tab on each project's Object Page.
- **Access:** the data (`/governance/Projects(...)/changes`) and the tab are **Manager-only** —
  employees get `403` and don't see the tab.
- **Stored in:** `sap_changelog_Changes` (travels to HANA on BTP).
- **Tracked:** Projects + Business Input, Readiness, Solution Details, Go-Live Checklist,
  Testing / QA, Risks.

---

## 6. OData service reference (`/governance`)

All entities are OData V4. Open any in a browser (you'll be asked to sign in).

**Editable (draft-enabled) — the project + its sections**
- `Projects` *(Manager creates/deletes; all can read/update)*
- `BusinessInput`, `Readiness`, `SolutionDetails`, `GoLiveChecklist`, `Testing`, `Risks`

**Read-only dashboards**
- `EmployeeAllocation`, `ActionRequired`

**Audit (Manager-only)**
- `ChangeView` (read via a project's `changes` navigation)

**Value-help lookups (read by all; Manager can edit via "Manage Lists" — see §7)**
- People & work: `Employees` *(read-only)*, `WorkCategories`, `BusinessDomains`, `Departments`, `BusinessOwners`
- Project: `Priorities`, `Phases`, `RiskLevels`, `StageStatuses`
- Business Input: `ApprovalStatuses`, `SourceDocuments`, `ReviewStatuses`, `BenefitAchieved`
- Solution: `SolutionTypes`, `IntegrationTypes`, `Environments`, `MonitoringMethods`, `AuthMethods`, `Criticalities`, `ErrorHandlings`
- Testing / QA: `TestPhases`, `TestStatuses`, `BugSeverities`, `BugPriorities`, `BugStatuses`
- Shared: `YesNoNA`, `BlockingTeams`, `RiskStatuses`

> Governance rule: dropdown values are changed **only** in these lookup lists; everything else
> references them. See [DATA-MODEL.md](DATA-MODEL.md) for the full entity/field model.

---

## 7. Manage Lists (admin page) — Manager & Admin

The dropdown choices used across the portal are **maintained in-app**, without a developer. A
**Manage Lists** button appears in the top bar for **Manager or Admin** and opens a dedicated
admin page (`/admin-lists/webapp/index.html`).

- **Pick a list** (Work Category, Priority, Risk Level, Test Phase, Bug Status, …) from the picker.
- **Add / Edit / Delete** entries (Code, Name, Sort Order). New values appear immediately in the
  project dropdowns.
- **Manager-only & enforced server-side:** the page redirects non-managers back to the portal, and
  every write is also protected by `@restrict` — an employee who reaches the API gets `403`.
- **Persistent:** edits are saved to the database and **survive server restarts** (the lookup CSVs
  are only the first-time seed).
  *Caveat:* a deliberate full redeploy (`npm run deploy:local`) reloads lookups from the CSV
  baseline. Day-to-day running (`cds watch`) never does this.
- The **Employees** (IT Owner) list stays read-only here — it's governed by the sign-in users.

---

## 8. Users & Roles (admin page) — Admin only

A **Users** button appears in the top bar **only for an Admin** and opens
`/users-admin/webapp/index.html` — the runtime user-management screen.

- **Add a user** (email/login, full name, SuccessFactors employee ID, role, initial password).
  New users appear in the sign-in roster immediately.
- **Inline-edit** name, employee ID, **role** (Employee / Manager / Admin), and **Active**.
- **Reset password** (bcrypt-hashed on save) and **Delete** per row.
- **Admin-only & enforced server-side:** the page redirects non-Admins; the `Users` entity is
  `@restrict … to:'Admin'` (`srv/auth-service.cds`) — a Manager or Employee who reaches the API gets `403`.
- **Password safety:** hashes are **never** returned on read (masked in `srv/auth-service.js`);
  passwords are only ever written, hashed with bcrypt.
- **Last-admin guard:** the server refuses to delete, deactivate, or demote the **last active
  Admin**, so the app can never be locked out of its own Users screen.
- **Roles take effect on the next request** (a short server-side role cache is invalidated on
  every user change).

---

## 9. Where things live (for developers)

| Concern | File |
|---|---|
| Data model (entities, satellites, 31 lookups) | `db/schema.cds` |
| Seed data (48 projects + lookups) | `db/data/*.csv` |
| Audit tracking annotations | `db/change-tracking.cds` |
| OData service + role restrictions (lookups Manager-writable) | `srv/service.cds` |
| Fiori UI annotations (screens, columns, dropdowns) | `srv/annotations.cds` |
| Computed logic + audit guard | `srv/service.js` |
| Dashboards (computed views) | `srv/views.cds` |
| Frontend app (List Report + Object Page) | `app/project-portal/webapp/` |
| **Manage Lists admin page (Manager/Admin)** | `app/admin-lists/webapp/index.html` |
| **Users & Roles admin page (Admin-only)** | `app/users-admin/webapp/index.html` |
| Login picker / top bar / auth injection | `app/project-portal/webapp/{login.html, Component.js, index.html}` |
| Hybrid auth (local JWT + XSUAA), DB-driven roles | `srv/role-guard.js` |
| Sign-in + Admin Users CRUD (`/auth`) | `srv/auth-service.{cds,js}` |
| Public `/login` + `/login-users` routes | `srv/server.js` |
| SuccessFactors employee lookup | `srv/integration/sf-hr-client.js` |
| Users table + Role enum | `db/schema.cds`, seed `db/data/nadec.e2e.Users.csv` |
| BTP deploy (XSUAA + SF + HANA) | `mta.yaml`, `xs-security.json`, `approuter/` |

**Run locally**
```bash
npm install
npm run deploy:local   # build SQLite schema + load seed CSVs
npm run watch          # http://localhost:4004
```

**Move to BTP:** `cds add hana`, bind a HANA Cloud instance, `cds deploy`. The model and
service don't change; the `[production]` profile already switches the DB to HANA, and login
moves to SAP IAS / XSUAA.

> Note: the UI5 runtime loads from the SAP CDN (`ui5.sap.com`), so the **browser needs
> internet**. The OData backend, data, and annotations are fully local.
