namespace nadec.e2e;

using { managed, cuid } from '@sap/cds/common';

// ---------------------------------------------------------------------------
// Application roles (the access-control levels — see srv/custom-auth.js)
//   Employee : read all projects; edit only projects they IT-own; never
//              (re)assign the IT Owner.
//   Manager  : full read/write on every project + change any IT Owner.
//   Admin    : everything a Manager can do, PLUS the Users admin screen
//              (create / edit users, change their roles & data).
// ---------------------------------------------------------------------------
type Role : String(20) enum {
  Employee;
  Manager;
  Admin;
}

/**
 * NADEC E2E Delivery Governance — data model
 *
 * One master `Projects` list keyed by a human Project ID (PRJ-001…).
 * Every lifecycle sheet (Business Input, Readiness, Solution Details,
 * Risks, Go-Live Checklist) is a 1:1 satellite keyed by the same project.
 *
 * Dropdown sheets in the Excel become the `lookup.*` code lists below.
 * Dashboards / Allocation / Action Required are NOT stored — they are
 * computed views (see srv/views.cds).
 */

// ---------------------------------------------------------------------------
// Lookup / code lists (the Excel "Lists" sheet, one entity per column)
// ---------------------------------------------------------------------------
context lookup {

  // Generic code list: a stable code + display name + ordering.
  aspect codelist {
    key code : String(60);
        name : String(120);
        sort : Integer default 0;
  }

  entity Employees       : codelist {}   // IT Owners / Support Owners
  entity WorkCategories  : codelist {}   // Business Impact | Support / Operations
  entity BusinessDomains : codelist {}
  entity Priorities      : codelist {}
  entity Phases          : codelist {}   // Current Phase
  entity RiskLevels      : codelist {}
  entity StageStatuses   : codelist {}   // E2E stage status values
  entity ApprovalStatuses: codelist {}
  entity YesNoNA         : codelist {}
  entity RiskStatuses    : codelist {}
  entity SourceDocuments : codelist {}
  entity BlockingTeams   : codelist {}
  entity SolutionTypes   : codelist {}
  entity IntegrationTypes: codelist {}
  entity Environments    : codelist {}
  entity MonitoringMethods: codelist {}
  entity ReviewStatuses  : codelist {}   // Post Go-Live Review Status
  entity DocStatuses     : codelist {}
  entity SupportReadiness: codelist {}
  entity RagStatuses     : codelist {}   // Green | Amber | Red
  entity BenefitAchieved : codelist {}
  entity AuthMethods     : codelist {}
  entity Criticalities   : codelist {}
  entity ErrorHandlings  : codelist {}
  entity ActionStatuses  : codelist {}
  entity Departments     : codelist {}   // Divisions / Departments (Business Requester)
  entity BusinessOwners  : codelist {}   // accountable business role

  // Testing / QA lists (Excel "Lists" columns AF–AJ)
  entity TestPhases      : codelist {}   // SIT | UAT | Regression | Security | Performance
  entity TestStatuses    : codelist {}   // Not Started | In Progress | Passed | Failed | Blocked
  entity BugSeverities   : codelist {}   // Low | Medium | High | Critical
  entity BugPriorities   : codelist {}   // Low | Medium | High | Critical
  entity BugStatuses     : codelist {}   // Open | In Progress | Retest | Closed | Deferred
}

// ---------------------------------------------------------------------------
// Master project (Project Portfolio sheet)
// ---------------------------------------------------------------------------
entity Projects : managed {
  key ID            : String(10);                       // PRJ-001
      name          : String(200) @mandatory;
      itOwner       : Association to lookup.Employees;
      workCategory  : Association to lookup.WorkCategories;
      domain        : Association to lookup.BusinessDomains;
      requester     : Association to lookup.Departments;
      businessOwner : Association to lookup.BusinessOwners;
      priority      : Association to lookup.Priorities;
      phase         : Association to lookup.Phases;
      riskLevel     : Association to lookup.RiskLevels;
      notes         : String(1000);

      // Timeline — drives the executive dashboard timeline view & overdue flags.
      // Additive fields (nullable); ownership still keys off itOwner (see below).
      startDate        : Date;
      targetGoLiveDate : Date;
      actualGoLiveDate : Date;

      // Usage metrics — entered manually now, fed by an integration later.
      numberOfUsers    : Integer;
      numberOfRequests : Integer;
      utilization      : Decimal(5,2);   // computed 0..100 % (see srv/service.js); null if inputs missing

      // 1:1 satellites — same key, composition so they live with the project
      businessInput   : Composition of one BusinessInput   on businessInput.project   = $self;
      readiness       : Composition of one Readiness       on readiness.project       = $self;
      solutionDetails : Composition of one SolutionDetails on solutionDetails.project = $self;
      goLive          : Composition of one GoLiveChecklist on goLive.project          = $self;
      testing         : Composition of one Testing         on testing.project         = $self;

      // 1:many
      risks           : Composition of many Risks          on risks.project           = $self;
}

// ---------------------------------------------------------------------------
// Business Input — why the project exists & how value is measured
// ---------------------------------------------------------------------------
entity BusinessInput : managed {
  key project            : Association to Projects;
      problemStatement   : String(2000);
      businessImpact     : String(2000);
      expectedBenefit    : String(2000);
      successKPI         : String(1000);
      impactedDepartment : Association to lookup.BusinessDomains;
      sourceDocument     : Association to lookup.SourceDocuments;
      businessApproval   : Association to lookup.ApprovalStatuses;
      currentBaseline    : String(1000);
      targetBenefit      : String(1000);
      notes              : String(1000);
      // Post go-live
      reviewStatus       : Association to lookup.ReviewStatuses;
      actualBenefit      : String(1000);
      benefitAchieved    : Association to lookup.BenefitAchieved;
      reviewDate         : Date;
      lessonsLearned     : String(2000);
}

// ---------------------------------------------------------------------------
// E2E Readiness Matrix — the 7 lifecycle stages
// ---------------------------------------------------------------------------
entity Readiness : managed {
  key project          : Association to Projects;
      businessNeed     : Association to lookup.StageStatuses;  // auto from BusinessInput
      solutionDesign   : Association to lookup.StageStatuses;
      build            : Association to lookup.StageStatuses;
      integration      : Association to lookup.StageStatuses;
      qualitySecurity  : Association to lookup.StageStatuses;
      releaseReadiness : Association to lookup.StageStatuses;
      operations       : Association to lookup.StageStatuses;
      overallReadiness : Decimal(5,2);                          // 0..100 % (computed)
      lifecycleStatus  : String(40);
}

// ---------------------------------------------------------------------------
// Solution Details — technical handover & production support
// ---------------------------------------------------------------------------
entity SolutionDetails : managed {
  key project          : Association to Projects;
      solutionSummary  : String(2000);
      solutionType     : Association to lookup.SolutionTypes;
      systemsInvolved  : String(1000);
      integrationType  : Association to lookup.IntegrationTypes;
      dataSource       : String(500);
      targetSystem     : String(500);
      environment      : Association to lookup.Environments;
      monitoringMethod : Association to lookup.MonitoringMethods;
      supportOwner     : Association to lookup.Employees;
      supportProcedure : String(2000);
      docLocation      : String(1000);
      productionUrl    : String(1000);
      hypercarePeriod  : String(200);
      authMethod       : Association to lookup.AuthMethods;
      criticality      : Association to lookup.Criticalities;
      backupNeeded     : Association to lookup.YesNoNA;
      errorHandling    : Association to lookup.ErrorHandlings;
      logLocation      : String(1000);
      escalationPath   : String(1000);
}

// ---------------------------------------------------------------------------
// Go-Live Checklist — production release gate
// ---------------------------------------------------------------------------
entity GoLiveChecklist : managed {
  key project           : Association to Projects;
      uatApproved       : Association to lookup.YesNoNA;
      securityApproved  : Association to lookup.YesNoNA;
      deploymentPlan    : Association to lookup.YesNoNA;
      rollbackPlan      : Association to lookup.YesNoNA;
      monitoringReady   : Association to lookup.YesNoNA;
      supportAssigned   : Association to lookup.YesNoNA;
      docsCompleted     : Association to lookup.YesNoNA;
      businessSignoff   : Association to lookup.YesNoNA;
      deploymentOwner   : Association to lookup.Employees;
      deploymentDate    : Date;
      rollbackOwner     : Association to lookup.Employees;
      businessSignoffDate : Date;
      hypercareStart    : Date;
      hypercareEnd      : Date;
      readinessPct      : Decimal(5,2);   // computed % share of "Yes" (0..100)
}

// ---------------------------------------------------------------------------
// Testing / QA — test execution & bug-tracking summary (Excel cols AF–AJ)
// ---------------------------------------------------------------------------
entity Testing : managed {
  key project     : Association to Projects;
      testPhase   : Association to lookup.TestPhases;
      testStatus  : Association to lookup.TestStatuses;
      bugSeverity : Association to lookup.BugSeverities;
      bugPriority : Association to lookup.BugPriorities;
      bugStatus   : Association to lookup.BugStatuses;
      testNotes   : String(2000);
}

// ---------------------------------------------------------------------------
// Portfolio snapshots — one row per day, captured automatically by the service
// so the executive dashboard can chart trends over time. Values are portfolio
// averages/counts at capture time (percent values on the 0..100 scale).
// ---------------------------------------------------------------------------
entity PortfolioSnapshots {
  key snapshotDate     : Date;
      projectCount     : Integer;
      avgE2eReadiness  : Decimal(5,2);   // avg overallReadiness × 100
      avgGoLive        : Decimal(5,2);   // avg goLive.readinessPct × 100
      highRiskCount    : Integer;        // riskLevel High or Critical
      openRiskCount    : Integer;        // Risks rows not Closed/Resolved
}

// ---------------------------------------------------------------------------
// Handover — the plan to transfer a project from delivery to support.
// One plan per project (created on demand from a standard template) with a
// journey of phased tasks: Preparation → Documentation → Knowledge Transfer
// → Access & Setup → Hypercare → Sign-off.
// ---------------------------------------------------------------------------
entity HandoverPlans : managed {
  key project    : Association to Projects;
      status     : Association to lookup.StageStatuses;   // overall plan status
      targetDate : Date;                                  // planned handover date
      actualDate : Date;                                  // when sign-off happened
      fromOwner  : Association to lookup.Employees;       // handing over (delivery)
      toOwners   : Composition of many HandoverReceivers on toOwners.plan = $self;
      notes      : String(1000);
      tasks      : Composition of many HandoverTasks on tasks.plan = $self;
}

entity HandoverReceivers : cuid {
  plan     : Association to HandoverPlans;
  employee : Association to lookup.Employees;
}

entity HandoverTasks : cuid, managed {
      plan    : Association to HandoverPlans;
      phase   : String(60);                               // journey phase name
      title   : String(200);
      owner   : Association to lookup.Employees;
      dueDate : Date;
      status  : Association to lookup.StageStatuses;
      sort    : Integer default 0;
      notes   : String(500);
}

// ---------------------------------------------------------------------------
// Risks & Dependencies — blockers (1:many per project)
// ---------------------------------------------------------------------------
entity Risks : cuid, managed {
      project          : Association to Projects;
      description      : String(2000);
      blockingTeam     : Association to lookup.BlockingTeams;
      impact           : Association to lookup.RiskLevels;
      owner            : Association to lookup.Employees;
      dueDate          : Date;
      mitigation       : String(2000);
      status           : Association to lookup.RiskStatuses;
      escalationNeeded : Association to lookup.YesNoNA;
      notes            : String(1000);
}

// ---------------------------------------------------------------------------
// Users — application accounts, roles & login (the "Users" admin screen)
// ---------------------------------------------------------------------------
// The source of truth for who can sign in and what they may do. Managed here
// (not in package.json) so the Admin can add / edit users at runtime.
//
// Identity is the corporate **email** — the same value SAP XSUAA / IAS presents
// in production, and derived from SuccessFactors as `<employeeId>@nadec.com.sa`.
// Roles are held here in the app DB (NOT in XSUAA scopes) so the Admin can grant
// them without a redeploy — see srv/role-guard.js.
//
//   email      : login identity / key (e.g. "80464@nadec.com.sa").
//   name       : the person's full name. MUST match the Employees code list so
//                project ownership (itOwner) resolves — see srv/role-guard.js
//                and srv/service.js (ownsProject).
//   employeeId : SuccessFactors userId (the email's local part in prod).
//   role       : Employee | Manager | Admin (drives all access control).
//   password   : bcrypt hash — LOCAL DEV ONLY. On BTP this is empty and SAP
//                IAS / XSUAA authenticates the user instead.
//   active     : deactivated users cannot sign in (kept for history).
entity Users : managed {
  key email      : String(255);
      name       : String(120) @mandatory;
      employeeId : String(50);
      role       : Role default 'Employee' @mandatory;
      password   : String(255);
      active     : Boolean default true;
}
