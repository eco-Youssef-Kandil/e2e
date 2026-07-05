using { nadec.e2e } from '../db/schema';
using from './service';
using GovernanceService from './service';

// ---------------------------------------------------------------------------
// Value helps: every lookup is a code list. Annotate the shared aspect once so
// all associations render as a fixed-value dropdown (pick from the list — no
// free typing) that DISPLAYS the human-readable name instead of the raw code.
// ---------------------------------------------------------------------------
annotate nadec.e2e.lookup.codelist with @cds.odata.valuelist {
  code @Common.Text             : name
       @Common.TextArrangement  : #TextOnly;
  name @Common.Label            : 'Name';
}

// Render the dropdowns as fixed-value pick lists (choose from the list — no
// free typing). The flag must sit on each foreign-key property; CAP does not
// propagate it from the lookup entity, so we set it on the *_code fields below.
annotate GovernanceService.Projects with {
  itOwner      @Common.ValueListWithFixedValues;
  workCategory @Common.ValueListWithFixedValues;
  domain       @Common.ValueListWithFixedValues;
  requester    @Common.ValueListWithFixedValues;
  businessOwner @Common.ValueListWithFixedValues;
  priority     @Common.ValueListWithFixedValues;
  phase        @Common.ValueListWithFixedValues;
  riskLevel    @Common.ValueListWithFixedValues;
}

annotate GovernanceService.BusinessInput with {
  impactedDepartment @Common.ValueListWithFixedValues;
  sourceDocument     @Common.ValueListWithFixedValues;
  businessApproval   @Common.ValueListWithFixedValues;
  reviewStatus       @Common.ValueListWithFixedValues;
  benefitAchieved    @Common.ValueListWithFixedValues;
}

annotate GovernanceService.Readiness with {
  businessNeed     @Common.ValueListWithFixedValues;
  solutionDesign   @Common.ValueListWithFixedValues;
  build            @Common.ValueListWithFixedValues;
  integration      @Common.ValueListWithFixedValues;
  qualitySecurity  @Common.ValueListWithFixedValues;
  releaseReadiness @Common.ValueListWithFixedValues;
  operations       @Common.ValueListWithFixedValues;
}

annotate GovernanceService.SolutionDetails with {
  solutionType     @Common.ValueListWithFixedValues;
  integrationType  @Common.ValueListWithFixedValues;
  environment      @Common.ValueListWithFixedValues;
  monitoringMethod @Common.ValueListWithFixedValues;
  supportOwner     @Common.ValueListWithFixedValues;
  authMethod       @Common.ValueListWithFixedValues;
  criticality      @Common.ValueListWithFixedValues;
  backupNeeded     @Common.ValueListWithFixedValues;
  errorHandling    @Common.ValueListWithFixedValues;
}

annotate GovernanceService.GoLiveChecklist with {
  uatApproved      @Common.ValueListWithFixedValues;
  securityApproved @Common.ValueListWithFixedValues;
  deploymentPlan   @Common.ValueListWithFixedValues;
  rollbackPlan     @Common.ValueListWithFixedValues;
  monitoringReady  @Common.ValueListWithFixedValues;
  supportAssigned  @Common.ValueListWithFixedValues;
  docsCompleted    @Common.ValueListWithFixedValues;
  businessSignoff  @Common.ValueListWithFixedValues;
  deploymentOwner  @Common.ValueListWithFixedValues;
  rollbackOwner    @Common.ValueListWithFixedValues;
}

annotate GovernanceService.Risks with {
  blockingTeam     @Common.ValueListWithFixedValues;
  impact           @Common.ValueListWithFixedValues;
  owner            @Common.ValueListWithFixedValues;
  status           @Common.ValueListWithFixedValues;
  escalationNeeded @Common.ValueListWithFixedValues;
}

annotate GovernanceService.Testing with {
  testPhase   @Common.ValueListWithFixedValues;
  testStatus  @Common.ValueListWithFixedValues;
  bugSeverity @Common.ValueListWithFixedValues;
  bugPriority @Common.ValueListWithFixedValues;
  bugStatus   @Common.ValueListWithFixedValues;
}

// ===========================================================================
// PROJECTS — List Report + Object Page
// ===========================================================================
annotate GovernanceService.Projects with @(
  UI.HeaderInfo : {
    TypeName       : 'Project',
    TypeNamePlural : 'Projects',
    Title          : { $Type: 'UI.DataField', Value: name },
    Description    : { $Type: 'UI.DataField', Value: ID }
  },

  // Per-row Edit button: hidden unless the signed-in user is the project's IT
  // Owner or a Manager/Admin (editHidden computed per user/row in service.js).
  // FE honours @UI.UpdateHidden per instance on the Object Page. The role-based
  // Create/Delete buttons are hidden for Employees in Component.js instead —
  // FE ignores @UI.CreateHidden/@UI.DeleteHidden path values on the root list.
  UI.UpdateHidden : editHidden,

  // Filter bar on the List Report
  UI.SelectionFields : [
    itOwner_code,
    phase_code,
    riskLevel_code,
    workCategory_code
  ],

  // The custom "Completeness" column reads completeness/overallPct, but FE does
  // not auto-$expand an association just because a custom-column fragment binds
  // to it. RequestAtLeast forces the List Report query to expand + select it, so
  // the coloured bars have data. (VisualizationType is required for RequestAtLeast.)
  UI.PresentationVariant : {
    Visualizations : [ '@UI.LineItem' ],
    RequestAtLeast : [ completeness.overallPct ]
  },

  // Table columns on the List Report.
  // The first four (High importance) show by default; the rest (Low) are
  // hidden by default but available to add via the table's Settings (gear)
  // → "Columns". The table scrolls horizontally when many columns are shown.
  UI.LineItem : [
    { $Type: 'UI.DataField', Value: ID,                 Label: 'ID',                @UI.Importance: #High },
    { $Type: 'UI.DataField', Value: name,               Label: 'Project',           @UI.Importance: #High },
    // Completeness — a native annotation column (progress bar) so it is a
    // first-class DEFAULT column that variant management / personalization can
    // never silently drop (the earlier manifest custom column did not survive
    // refresh + re-login). The 5-colour red→green shading is applied at runtime
    // in Component.js (_guardAuditTab → paintBars, which colours every .sapMPI
    // progress bar by its %), matching the Object Page bars.
    { $Type: 'UI.DataFieldForAnnotation', Target: 'completeness/@UI.DataPoint#Overall',
      Label: 'Completeness', @UI.Importance: #High },
    { $Type: 'UI.DataField', Value: itOwner_code,       Label: 'IT Owner',          @UI.Importance: #High },
    { $Type: 'UI.DataField', Value: phase_code,         Label: 'Phase',             @UI.Importance: #High },
    { $Type: 'UI.DataField', Value: priority_code,      Label: 'Priority',          @UI.Importance: #Low },
    { $Type: 'UI.DataField', Value: riskLevel_code,     Label: 'Risk Level',        @UI.Importance: #Low },
    { $Type: 'UI.DataField', Value: workCategory_code,  Label: 'Work Category',     @UI.Importance: #Low },
    { $Type: 'UI.DataField', Value: domain_code,        Label: 'Business Domain',   @UI.Importance: #Low },
    { $Type: 'UI.DataField', Value: requester_code,     Label: 'Business Requester', @UI.Importance: #Low },
    { $Type: 'UI.DataField', Value: businessOwner_code, Label: 'Business Owner',    @UI.Importance: #Low }
  ],

  // Header shows the overall completeness right under the project title.
  UI.HeaderFacets : [
    { $Type: 'UI.ReferenceFacet', ID: 'HdrCompleteness', Label: 'Completeness',
      Target: 'completeness/@UI.DataPoint#Overall' }
  ],

  // Object Page — Completeness first (so the owner sees the gaps), then one tab
  // (facet) per Excel section.
  UI.Facets : [
    { $Type: 'UI.ReferenceFacet', ID: 'Completeness', Label: 'Completeness',
      Target: 'completeness/@UI.FieldGroup#Sections' },
    { $Type: 'UI.ReferenceFacet', ID: 'General',   Label: 'General Info',      Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', ID: 'BizInput',  Label: 'Business Input',    Target: 'businessInput/@UI.FieldGroup#BusinessInput' },
    { $Type: 'UI.ReferenceFacet', ID: 'Readiness', Label: 'E2E Readiness',     Target: 'readiness/@UI.FieldGroup#Readiness' },
    { $Type: 'UI.ReferenceFacet', ID: 'Solution',  Label: 'Solution Details',  Target: 'solutionDetails/@UI.FieldGroup#Solution' },
    { $Type: 'UI.ReferenceFacet', ID: 'GoLive',    Label: 'Go-Live Checklist', Target: 'goLive/@UI.FieldGroup#GoLive' },
    { $Type: 'UI.ReferenceFacet', ID: 'Testing',   Label: 'Testing / QA',      Target: 'testing/@UI.FieldGroup#Testing' },
    { $Type: 'UI.ReferenceFacet', ID: 'RisksTab',  Label: 'Risk / Dependency',  Target: 'risks/@UI.LineItem' }
  ],

  UI.FieldGroup #General : { Data : [
    { Value: ID },
    { Value: name },
    { Value: itOwner_code,       Label: 'IT Owner' },
    { Value: workCategory_code,  Label: 'Work Category' },
    { Value: domain_code,        Label: 'Business Domain' },
    { Value: requester_code,     Label: 'Business Requester' },
    { Value: businessOwner_code, Label: 'Business Owner' },
    { Value: priority_code,      Label: 'Priority' },
    { Value: phase_code,         Label: 'Current Phase' },
    { Value: riskLevel_code,     Label: 'Risk Level' },
    { Value: numberOfUsers,      Label: 'Number of Users' },
    { Value: numberOfRequests,   Label: 'Number of Requests' },
    { Value: utilization,        Label: 'Utilization %' },
    { Value: notes,              Label: 'Notes' }
  ]}
);

annotate GovernanceService.Projects with {
  ID           @Common.Label: 'Project ID';
  name         @Common.Label: 'Project Name' @title: 'Project Name' @mandatory;
  // IT Owner is read-only (FieldControl 1) for Employees and editable (3) for
  // Manager/Admin — itOwnerFC is computed per user in srv/service.js, so an
  // Employee can never (re)assign the IT Owner even while editing their project.
  itOwner      @Common.Label: 'IT Owner' @Common.FieldControl: itOwnerFC;
  workCategory @Common.Label: 'Work Category';
  domain       @Common.Label: 'Business Domain';
  requester    @Common.Label: 'Business Requester';
  businessOwner @Common.Label: 'Business Owner';
  priority     @Common.Label: 'Priority';
  phase        @Common.Label: 'Current Phase';
  riskLevel    @Common.Label: 'Risk Level';
  numberOfUsers    @Common.Label: 'Number of Users';
  numberOfRequests @Common.Label: 'Number of Requests';
  utilization  @Common.Label: 'Utilization %' @Core.Computed @Measures.Unit: '%';
  notes        @Common.Label: 'Notes' @UI.MultiLineText;
}

// ===========================================================================
// BUSINESS INPUT — why the project exists & how value is measured
// ===========================================================================
annotate GovernanceService.BusinessInput with @(
  UI.FieldGroup #BusinessInput : { Data : [
    { Value: problemStatement,        Label: 'Problem Statement' },
    { Value: businessImpact,          Label: 'Business Impact' },
    { Value: expectedBenefit,         Label: 'Expected Benefit' },
    { Value: successKPI,              Label: 'Success KPI' },
    { Value: impactedDepartment_code, Label: 'Impacted Department' },
    { Value: sourceDocument_code,     Label: 'Source Document' },
    { Value: businessApproval_code,   Label: 'Business Approval' },
    { Value: currentBaseline,         Label: 'Current Baseline' },
    { Value: targetBenefit,           Label: 'Target Benefit' },
    { Value: reviewStatus_code,       Label: 'Post Go-Live Review Status' },
    { Value: actualBenefit,           Label: 'Actual Benefit After Go-Live' },
    { Value: benefitAchieved_code,    Label: 'Benefit Achieved?' },
    { Value: reviewDate,              Label: 'Review Date' },
    { Value: lessonsLearned,          Label: 'Lessons Learned' },
    { Value: notes,                   Label: 'Notes' }
  ]}
);

annotate GovernanceService.BusinessInput with {
  problemStatement @UI.MultiLineText;
  businessImpact   @UI.MultiLineText;
  expectedBenefit  @UI.MultiLineText;
  lessonsLearned   @UI.MultiLineText;
}

// ===========================================================================
// E2E READINESS MATRIX — the 7 lifecycle stages (+ computed overall %)
// ===========================================================================
annotate GovernanceService.Readiness with @(
  UI.FieldGroup #Readiness : { Data : [
    { Value: businessNeed_code,     Label: 'Business Need' },
    { Value: solutionDesign_code,   Label: 'Solution Design' },
    { Value: build_code,            Label: 'Build' },
    { Value: integration_code,      Label: 'Integration' },
    { Value: qualitySecurity_code,  Label: 'Quality & Security' },
    { Value: releaseReadiness_code, Label: 'Release Readiness' },
    { Value: operations_code,       Label: 'Operations' },
    { Value: overallReadiness,      Label: 'Overall E2E Readiness' },
    { Value: lifecycleStatus,       Label: 'Lifecycle Status' }
  ]}
);

annotate GovernanceService.Readiness with {
  businessNeed     @Common.Label: 'Business Need' @readonly;   // auto-derived
  overallReadiness @Common.Label: 'Overall E2E Readiness' @Core.Computed @Measures.Unit: '%';
}

// ===========================================================================
// SOLUTION DETAILS — technical handover & production support readiness
// ===========================================================================
annotate GovernanceService.SolutionDetails with @(
  UI.FieldGroup #Solution : { Data : [
    { Value: solutionSummary,    Label: 'Solution Summary' },
    { Value: solutionType_code,  Label: 'Solution Type' },
    { Value: systemsInvolved,    Label: 'Systems Involved' },
    { Value: integrationType_code, Label: 'Integration Type' },
    { Value: dataSource,         Label: 'Data Source' },
    { Value: targetSystem,       Label: 'Target System' },
    { Value: environment_code,   Label: 'Environment' },
    { Value: monitoringMethod_code, Label: 'Monitoring Method' },
    { Value: supportOwner_code,  Label: 'Support Owner' },
    { Value: supportProcedure,   Label: 'Support Procedure' },
    { Value: docLocation,        Label: 'Documentation Link / Location' },
    { Value: productionUrl,      Label: 'Production URL / Job Name' },
    { Value: hypercarePeriod,    Label: 'Hypercare Period' },
    { Value: authMethod_code,    Label: 'Authentication Method' },
    { Value: criticality_code,   Label: 'Criticality' },
    { Value: backupNeeded_code,  Label: 'Backup / Recovery Needed' },
    { Value: errorHandling_code, Label: 'Error Handling' },
    { Value: logLocation,        Label: 'Log Location' },
    { Value: escalationPath,     Label: 'Escalation Path' }
  ]}
);

annotate GovernanceService.SolutionDetails with {
  solutionSummary  @UI.MultiLineText;
  supportProcedure @UI.MultiLineText;
  escalationPath   @UI.MultiLineText;
}

// ===========================================================================
// GO-LIVE CHECKLIST — production release gate (+ computed readiness %)
// ===========================================================================
annotate GovernanceService.GoLiveChecklist with @(
  UI.FieldGroup #GoLive : { Data : [
    { Value: uatApproved_code,      Label: 'UAT Approved' },
    { Value: securityApproved_code, Label: 'Security Approved' },
    { Value: deploymentPlan_code,   Label: 'Deployment Plan' },
    { Value: rollbackPlan_code,     Label: 'Rollback Plan' },
    { Value: monitoringReady_code,  Label: 'Monitoring Ready' },
    { Value: supportAssigned_code,  Label: 'Support Owner Assigned' },
    { Value: docsCompleted_code,    Label: 'Documentation Completed' },
    { Value: businessSignoff_code,  Label: 'Business Signoff' },
    { Value: deploymentOwner_code,  Label: 'Deployment Owner' },
    { Value: deploymentDate,        Label: 'Deployment Date' },
    { Value: rollbackOwner_code,    Label: 'Rollback Owner' },
    { Value: businessSignoffDate,   Label: 'Business Signoff Date' },
    { Value: hypercareStart,        Label: 'Hypercare Start' },
    { Value: hypercareEnd,          Label: 'Hypercare End' },
    { Value: readinessPct,          Label: 'Go-Live Readiness' }
  ]}
);

annotate GovernanceService.GoLiveChecklist with {
  readinessPct @Common.Label: 'Go-Live Readiness' @Core.Computed @Measures.Unit: '%';
}

// ===========================================================================
// TESTING / QA — test execution & bug-tracking summary
// ===========================================================================
annotate GovernanceService.Testing with @(
  UI.FieldGroup #Testing : { Data : [
    { Value: testPhase_code,   Label: 'Test Phase' },
    { Value: testStatus_code,  Label: 'Test Status' },
    { Value: bugSeverity_code, Label: 'Bug Severity' },
    { Value: bugPriority_code, Label: 'Bug Priority' },
    { Value: bugStatus_code,   Label: 'Bug Status' },
    { Value: testNotes,        Label: 'Test Notes' }
  ]}
);

annotate GovernanceService.Testing with {
  testPhase   @Common.Label: 'Test Phase';
  testStatus  @Common.Label: 'Test Status';
  bugSeverity @Common.Label: 'Bug Severity';
  bugPriority @Common.Label: 'Bug Priority';
  bugStatus   @Common.Label: 'Bug Status';
  testNotes   @Common.Label: 'Test Notes' @UI.MultiLineText;
}

// ===========================================================================
// RISKS & DEPENDENCIES — blockers (table inside the Object Page)
// ===========================================================================
annotate GovernanceService.Risks with @(
  UI.HeaderInfo : {
    TypeName       : 'Risk / Dependency',
    TypeNamePlural : 'Risks / Dependencies',
    Title          : { $Type: 'UI.DataField', Value: description }
  },
  UI.LineItem : [
    { $Type: 'UI.DataField', Value: description,       Label: 'Risk / Dependency' },
    { $Type: 'UI.DataField', Value: blockingTeam_code, Label: 'Blocking Team' },
    { $Type: 'UI.DataField', Value: impact_code,       Label: 'Impact' },
    { $Type: 'UI.DataField', Value: owner_code,        Label: 'Owner' },
    { $Type: 'UI.DataField', Value: dueDate,           Label: 'Due Date' },
    { $Type: 'UI.DataField', Value: status_code,       Label: 'Status' }
  ],
  UI.FieldGroup #RiskDetail : { Data : [
    { Value: description,           Label: 'Risk / Dependency' },
    { Value: blockingTeam_code,     Label: 'Blocking Team' },
    { Value: impact_code,           Label: 'Impact' },
    { Value: owner_code,            Label: 'Owner' },
    { Value: dueDate,               Label: 'Due Date' },
    { Value: mitigation,            Label: 'Mitigation / Action' },
    { Value: status_code,           Label: 'Status' },
    { Value: escalationNeeded_code, Label: 'Escalation Needed?' },
    { Value: notes,                 Label: 'Notes' }
  ],
  Label : 'Risk' },
  UI.Facets : [
    { $Type: 'UI.ReferenceFacet', ID: 'RiskDetail', Label: 'Risk Detail', Target: '@UI.FieldGroup#RiskDetail' }
  ]
);

annotate GovernanceService.Risks with {
  description @UI.MultiLineText;
  mitigation  @UI.MultiLineText;
}

// ===========================================================================
// DASHBOARDS — read-only tables
// ===========================================================================
annotate GovernanceService.ActionRequired with @(
  UI.HeaderInfo : { TypeName: 'Action', TypeNamePlural: 'Actions Required',
                    Title: { $Type: 'UI.DataField', Value: name } },
  UI.LineItem : [
    { $Type: 'UI.DataField', Value: ID,                 Label: 'ID' },
    { $Type: 'UI.DataField', Value: name,               Label: 'Project' },
    { $Type: 'UI.DataField', Value: itOwner,            Label: 'IT Owner' },
    { $Type: 'UI.DataField', Value: workCategory,       Label: 'Work Category' },
    { $Type: 'UI.DataField', Value: riskLevel,          Label: 'Risk Level' },
    { $Type: 'UI.DataField', Value: readinessPct,       Label: 'E2E Readiness' },
    { $Type: 'UI.DataField', Value: goLiveReadinessPct, Label: 'Go-Live Readiness' },
    { $Type: 'UI.DataField', Value: recommendedAction,  Label: 'Recommended Action' }
  ]
);

annotate GovernanceService.ActionRequired with {
  readinessPct       @Measures.Unit: '%';
  goLiveReadinessPct @Measures.Unit: '%';
}

annotate GovernanceService.EmployeeAllocation with @(
  UI.HeaderInfo : { TypeName: 'Employee', TypeNamePlural: 'Employee Allocation',
                    Title: { $Type: 'UI.DataField', Value: employee } },
  UI.LineItem : [
    { $Type: 'UI.DataField', Value: employee,       Label: 'Employee' },
    { $Type: 'UI.DataField', Value: totalAssigned,  Label: 'Total Assigned' },
    { $Type: 'UI.DataField', Value: businessImpact, Label: 'Business Impact' },
    { $Type: 'UI.DataField', Value: support,        Label: 'Support / Operations' },
    { $Type: 'UI.DataField', Value: uncategorized,  Label: 'Uncategorized' }
  ]
);

// ===========================================================================
// DATA COMPLETENESS — how much of a project is filled in (progress bars).
// Rendered as native #Progress DataPoints (0..100), so no chart library is
// needed. Shown as a List Report column, an Object Page header number, and an
// Object Page "Completeness" facet that breaks the score down by section — so
// the IT Owner sees exactly which tab still needs work.
// ===========================================================================
annotate GovernanceService.ProjectCompleteness with @(
  UI.DataPoint #Overall  : { Value: overallPct,  Title: 'Overall Complete',   TargetValue: 100, Visualization: #Progress,
                             CriticalityCalculation: {
                               ImprovementDirection    : #Maximize,
                               DeviationRangeLowValue  : 40,   // < 40  → red
                               ToleranceRangeLowValue  : 80    // 40–79 → amber, ≥ 80 → green
                             } },
  UI.DataPoint #General  : { Value: generalPct,  Title: 'General Info',       TargetValue: 100, Visualization: #Progress },
  UI.DataPoint #Business : { Value: businessPct, Title: 'Business Input',      TargetValue: 100, Visualization: #Progress },
  UI.DataPoint #Readiness: { Value: readinessPct,Title: 'E2E Readiness',       TargetValue: 100, Visualization: #Progress },
  UI.DataPoint #Solution : { Value: solutionPct, Title: 'Solution Details',    TargetValue: 100, Visualization: #Progress },
  UI.DataPoint #GoLive   : { Value: goLivePct,   Title: 'Go-Live Checklist',   TargetValue: 100, Visualization: #Progress },
  UI.DataPoint #Testing  : { Value: testingPct,  Title: 'Testing / QA',        TargetValue: 100, Visualization: #Progress },

  // The per-section breakdown shown on the Object Page "Completeness" facet.
  UI.FieldGroup #Sections : { Data : [
    { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#General',   Label: 'General Info' },
    { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#Business',  Label: 'Business Input' },
    { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#Readiness', Label: 'E2E Readiness' },
    { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#Solution',  Label: 'Solution Details' },
    { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#GoLive',    Label: 'Go-Live Checklist' },
    { $Type: 'UI.DataFieldForAnnotation', Target: '@UI.DataPoint#Testing',   Label: 'Testing / QA' }
  ]}
);

annotate GovernanceService.ProjectCompleteness with {
  overallPct   @Common.Label: 'Overall Complete'  @Measures.Unit: '%';
  generalPct   @Common.Label: 'General Info'       @Measures.Unit: '%';
  businessPct  @Common.Label: 'Business Input'     @Measures.Unit: '%';
  readinessPct @Common.Label: 'E2E Readiness'      @Measures.Unit: '%';
  solutionPct  @Common.Label: 'Solution Details'   @Measures.Unit: '%';
  goLivePct    @Common.Label: 'Go-Live Checklist'  @Measures.Unit: '%';
  testingPct   @Common.Label: 'Testing / QA'       @Measures.Unit: '%';
}

// ===========================================================================
// CODE LISTS — column labels for the "Manage Lists" admin page (freestyle UI5
// table reads code / name / sort directly; these just give clean headers).
// ===========================================================================
annotate nadec.e2e.lookup.codelist with {
  code @Common.Label: 'Code';
  sort @Common.Label: 'Sort Order';
}

// ===========================================================================
// CHANGE HISTORY (audit log) — column labels for the Object Page table.
// @cap-js/change-tracking auto-generates the "Change History" facet + table;
// we only give its columns friendly labels here (When / Changed By / Section /
// Field / Change / Old / New). The table layout itself is the plugin's; the
// oversized empty area below it is trimmed via CSS in css/style.css.
// (We deliberately do NOT re-annotate the plugin's LineItem — it is injected
// after this file compiles, so overriding it here only warns and is ignored.)
// ===========================================================================
annotate GovernanceService.ChangeView with {
  createdAt         @Common.Label: 'When';
  createdBy         @Common.Label: 'Changed By';
  entityLabel       @Common.Label: 'Section';
  attributeLabel    @Common.Label: 'Field';
  modificationLabel @Common.Label: 'Change';
  valueChangedFrom  @Common.Label: 'Old Value';
  valueChangedTo    @Common.Label: 'New Value';
}
