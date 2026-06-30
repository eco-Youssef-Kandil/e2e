# NADEC E2E Delivery Governance — Data Model

**Source:** `E2E solutions.xlsx` (manager's tracker)
**Target:** SAP BTP via SAP CAP — SQLite locally, SAP HANA Cloud in BTP (same CDS model, no rewrite).
**Owner team:** Application team.

---

## 1. The idea in one line

One master list of projects (`PRJ-001` … `PRJ-051`). Every lifecycle concern —
business case, technical design, risks, go-live readiness — is a satellite table
keyed by the same Project ID. Dashboards and "what needs attention" lists are
**computed**, not stored.

## 2. Lifecycle (the spine)

Each project advances through 7 stages, tracked in **E2E Readiness Matrix**:

```
Business Need → Solution Design → Build → Integration →
Quality & Security → Release Readiness → Operations
                                              ↘ (after go-live) Post Go-Live Review
```

- **Business Need** is auto-derived: it becomes *Completed* once the required
  Business Input fields are filled, otherwise *Missing Input*.
- The other 6 stages are set manually by the IT Owner.
- `overallReadiness` = share of stages completed (0–1).

## 3. Sheet → Table mapping

| Excel sheet | Entity | Cardinality | Role |
|---|---|---|---|
| Project Portfolio | `Projects` | master | owner, category, domain, priority, phase, risk |
| Business Input | `BusinessInput` | 1:1 | problem, impact, KPI, baseline, target, approval, post-go-live benefit |
| E2E Readiness Matrix | `Readiness` | 1:1 | the 7 stage statuses + overall % |
| Solution Details | `SolutionDetails` | 1:1 | systems, integration, env, monitoring, support, auth, logs, escalation |
| Go-Live Checklist | `GoLiveChecklist` | 1:1 | UAT / security / rollback / signoff gates |
| Risks & Dependencies | `Risks` | 1:many | blockers, blocking team, mitigation, status |
| Lists | `lookup.*` (26 code lists) | — | every dropdown |
| Employee Allocation 75-25 | `EmployeeAllocation` (view) | derived | 75/25 rule per employee |
| Action Required | `ActionRequired` (view) | derived | what's incomplete / at risk |
| Executive Dashboard, Dashboard Data | (queries) | derived | KPIs & charts |

The 1:1 satellites use the **same primary key** as `Projects` (the Project ID),
modelled in CAP as `Composition of one … on …project = $self`. They live and die
with the project.

## 4. Lookups (the "Lists" sheet)

All dropdowns are normalized into 26 code lists under the `lookup` context.
Each is `{ code, name, sort }` with `code == name` for now (human-readable keys,
matching the Excel values exactly so seed data round-trips). Key ones:

- **Employees** (15) — IT Owners / Support Owners
- **WorkCategories** — `Business Impact` | `Support / Operations` (drives the 75/25 rule)
- **StageStatuses** — `Missing Input`, `Partially Defined`, `Not Started`, `In Progress`, `Completed`, `Blocked`, `Not Applicable`
- **Priorities**, **RiskLevels**, **Phases**, **RagStatuses** (Green/Amber/Red), etc.

> Governance rule from the Excel: change dropdown values **only** in the lookup
> tables. All entities reference them by association.

## 5. Computed views (no stored data)

### EmployeeAllocation — the 75/25 rule
Per employee: total assigned, # Business Impact, # Support, # Uncategorized.
Target ≈ **75% Business Impact / 25% Support / Operations**. Flag for rebalancing
is computed from those counts.

### ActionRequired
Per project, a `recommendedAction`:
1. no Work Category → *Select Work Category*
2. High/Critical risk → *Mitigate Risk*
3. readiness < 50% → *Advance Readiness*
4. otherwise → *Review Go-Live Readiness*

## 6. Seed data shipped

- **48 real NADEC projects** (PRJ-001…051; the master list omits 015/044/050,
  which exist only in Business Input — those are intentionally not seeded as
  master rows).
- All 26 lookup tables fully populated from the Excel.
- **PRJ-001 (Consumer Care Agent)** is fully filled across all satellites — the
  manager's worked sample — so the app has one end-to-end example on first run.
- All other projects start at *Business Need / Missing Input* (greenfield), matching
  the Excel's current state.

## 7. Local → BTP path

| | Local | BTP |
|---|---|---|
| DB | SQLite (`db/e2e.db`) | SAP HANA Cloud |
| Config | default profile | `[production]` profile (`kind: hana`) |
| Model | `db/schema.cds` | **same file** |
| Seed | `db/data/*.csv` auto-load | `cds deploy` / `hdbtabledata` |

```bash
npm install
npm run watch          # http://localhost:4004  (SQLite, auto-seeded)
```

When ready for BTP: `cds add hana`, bind a HANA Cloud instance, `cds deploy`.
The entity model and service do not change.
