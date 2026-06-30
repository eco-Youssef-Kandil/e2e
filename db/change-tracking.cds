using { nadec.e2e } from './schema';

/**
 * Change tracking (audit log) — records every create / update / delete on
 * projects and their sections: who, when, which field, old value → new value.
 * Backed by @cap-js/change-tracking; the change records live in
 * `sap.changelog.Changes` and are read through `sap.changelog.ChangeView`.
 *
 * The `@changelog: [...]` on an entity defines a human-readable "object id"
 * for each change row (so the log says "PRJ-001" rather than a UUID).
 */

// ---- Master project ----
annotate nadec.e2e.Projects with @changelog: [ID, name] {
  name          @changelog;
  itOwner       @changelog: [itOwner.name];
  workCategory  @changelog: [workCategory.name];
  domain        @changelog: [domain.name];
  requester     @changelog: [requester.name];
  businessOwner @changelog: [businessOwner.name];
  priority      @changelog: [priority.name];
  phase         @changelog: [phase.name];
  riskLevel     @changelog: [riskLevel.name];
  numberOfUsers    @changelog;
  numberOfRequests @changelog;
  notes         @changelog;
}

// ---- Business Input ----
annotate nadec.e2e.BusinessInput with @changelog: [project.ID] {
  problemStatement   @changelog;
  businessImpact     @changelog;
  expectedBenefit    @changelog;
  successKPI         @changelog;
  impactedDepartment @changelog: [impactedDepartment.name];
  sourceDocument     @changelog: [sourceDocument.name];
  businessApproval   @changelog: [businessApproval.name];
  currentBaseline    @changelog;
  targetBenefit      @changelog;
  reviewStatus       @changelog: [reviewStatus.name];
  actualBenefit      @changelog;
  benefitAchieved    @changelog: [benefitAchieved.name];
  reviewDate         @changelog;
  lessonsLearned     @changelog;
}

// ---- E2E Readiness ----
annotate nadec.e2e.Readiness with @changelog: [project.ID] {
  businessNeed     @changelog: [businessNeed.name];
  solutionDesign   @changelog: [solutionDesign.name];
  build            @changelog: [build.name];
  integration      @changelog: [integration.name];
  qualitySecurity  @changelog: [qualitySecurity.name];
  releaseReadiness @changelog: [releaseReadiness.name];
  operations       @changelog: [operations.name];
  lifecycleStatus  @changelog;
}

// ---- Solution Details ----
annotate nadec.e2e.SolutionDetails with @changelog: [project.ID] {
  solutionSummary  @changelog;
  solutionType     @changelog: [solutionType.name];
  systemsInvolved  @changelog;
  integrationType  @changelog: [integrationType.name];
  dataSource       @changelog;
  targetSystem     @changelog;
  environment      @changelog: [environment.name];
  monitoringMethod @changelog: [monitoringMethod.name];
  supportOwner     @changelog: [supportOwner.name];
  supportProcedure @changelog;
  docLocation      @changelog;
  productionUrl    @changelog;
  hypercarePeriod  @changelog;
  authMethod       @changelog: [authMethod.name];
  criticality      @changelog: [criticality.name];
  backupNeeded     @changelog: [backupNeeded.name];
  errorHandling    @changelog: [errorHandling.name];
  logLocation      @changelog;
  escalationPath   @changelog;
}

// ---- Go-Live Checklist ----
annotate nadec.e2e.GoLiveChecklist with @changelog: [project.ID] {
  uatApproved      @changelog: [uatApproved.name];
  securityApproved @changelog: [securityApproved.name];
  deploymentPlan   @changelog: [deploymentPlan.name];
  rollbackPlan     @changelog: [rollbackPlan.name];
  monitoringReady  @changelog: [monitoringReady.name];
  supportAssigned  @changelog: [supportAssigned.name];
  docsCompleted    @changelog: [docsCompleted.name];
  businessSignoff  @changelog: [businessSignoff.name];
  deploymentOwner  @changelog: [deploymentOwner.name];
  deploymentDate   @changelog;
  rollbackOwner    @changelog: [rollbackOwner.name];
  businessSignoffDate @changelog;
  hypercareStart   @changelog;
  hypercareEnd     @changelog;
}

// ---- Testing / QA ----
annotate nadec.e2e.Testing with @changelog: [project.ID] {
  testPhase   @changelog: [testPhase.name];
  testStatus  @changelog: [testStatus.name];
  bugSeverity @changelog: [bugSeverity.name];
  bugPriority @changelog: [bugPriority.name];
  bugStatus   @changelog: [bugStatus.name];
  testNotes   @changelog;
}

// ---- Risks & Dependencies ----
annotate nadec.e2e.Risks with @changelog: [project.ID, description] {
  description      @changelog;
  blockingTeam     @changelog: [blockingTeam.name];
  impact           @changelog: [impact.name];
  owner            @changelog: [owner.name];
  dueDate          @changelog;
  mitigation       @changelog;
  status           @changelog: [status.name];
  escalationNeeded @changelog: [escalationNeeded.name];
  notes            @changelog;
}
