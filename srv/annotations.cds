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

  // Filter bar on the List Report
  UI.SelectionFields : [
    itOwner_code,
    phase_code,
    riskLevel_code,
    workCategory_code
  ],

  // Table columns on the List Report.
  // The first four (High importance) show by default; the rest (Low) are
  // hidden by default but available to add via the table's Settings (gear)
  // → "Columns". The table scrolls horizontally when many columns are shown.
  UI.LineItem : [
    { $Type: 'UI.DataField', Value: ID,                 Label: 'ID',                @UI.Importance: #High },
    { $Type: 'UI.DataField', Value: name,               Label: 'Project',           @UI.Importance: #High },
    { $Type: 'UI.DataField', Value: itOwner_code,       Label: 'IT Owner',          @UI.Importance: #High },
    { $Type: 'UI.DataField', Value: phase_code,         Label: 'Phase',             @UI.Importance: #High },
    { $Type: 'UI.DataField', Value: priority_code,      Label: 'Priority',          @UI.Importance: #Low },
    { $Type: 'UI.DataField', Value: riskLevel_code,     Label: 'Risk Level',        @UI.Importance: #Low },
    { $Type: 'UI.DataField', Value: workCategory_code,  Label: 'Work Category',     @UI.Importance: #Low },
    { $Type: 'UI.DataField', Value: domain_code,        Label: 'Business Domain',   @UI.Importance: #Low },
    { $Type: 'UI.DataField', Value: requester_code,     Label: 'Business Requester', @UI.Importance: #Low },
    { $Type: 'UI.DataField', Value: businessOwner_code, Label: 'Business Owner',    @UI.Importance: #Low }
  ],

  // Object Page — one tab (facet) per Excel section
  UI.Facets : [
    { $Type: 'UI.ReferenceFacet', ID: 'General',   Label: 'General Info',      Target: '@UI.FieldGroup#General' },
    { $Type: 'UI.ReferenceFacet', ID: 'BizInput',  Label: 'Business Input',    Target: 'businessInput/@UI.FieldGroup#BusinessInput' },
    { $Type: 'UI.ReferenceFacet', ID: 'Readiness', Label: 'E2E Readiness',     Target: 'readiness/@UI.FieldGroup#Readiness' },
    { $Type: 'UI.ReferenceFacet', ID: 'Solution',  Label: 'Solution Details',  Target: 'solutionDetails/@UI.FieldGroup#Solution' },
    { $Type: 'UI.ReferenceFacet', ID: 'GoLive',    Label: 'Go-Live Checklist', Target: 'goLive/@UI.FieldGroup#GoLive' },
    { $Type: 'UI.ReferenceFacet', ID: 'Testing',   Label: 'Testing / QA',      Target: 'testing/@UI.FieldGroup#Testing' },
    { $Type: 'UI.ReferenceFacet', ID: 'RisksTab',  Label: 'Risks',             Target: 'risks/@UI.LineItem' }
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
  itOwner      @Common.Label: 'IT Owner';
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
    TypeName       : 'Risk',
    TypeNamePlural : 'Risks',
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
// CODE LISTS — column labels for the "Manage Lists" admin page (freestyle UI5
// table reads code / name / sort directly; these just give clean headers).
// ===========================================================================
annotate nadec.e2e.lookup.codelist with {
  code @Common.Label: 'Code';
  sort @Common.Label: 'Sort Order';
}
