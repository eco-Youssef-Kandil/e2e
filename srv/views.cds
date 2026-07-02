namespace nadec.e2e;

using nadec.e2e as my from '../db/schema';

/**
 * Computed views — these replace the Excel sheets that were all formulas:
 * "Employee Allocation 75-25", "Action Required", and the dashboard counts.
 * Nothing here is stored; it is derived from the entry tables.
 */

// Employee allocation: 75% Business Impact / 25% Support target.
// One row per employee with project counts and a rebalancing flag.
view EmployeeAllocation as
  select from my.Projects {
    key itOwner.code                          as employee : String(60),
    count(*)                                  as totalAssigned : Integer,
    sum( case when workCategory.code = 'Business Impact'      then 1 else 0 end ) as businessImpact : Integer,
    sum( case when workCategory.code = 'Support / Operations' then 1 else 0 end ) as support : Integer,
    sum( case when workCategory.code is null                  then 1 else 0 end ) as uncategorized : Integer
  }
  where itOwner.code is not null
  group by itOwner.code;

// Action Required: projects with gaps (missing category, low readiness, high risk).
view ActionRequired as
  select from my.Projects {
    ID,
    name,
    itOwner.code        as itOwner       : String(60),
    workCategory.code   as workCategory  : String(60),
    domain.code         as domain        : String(60),
    riskLevel.code      as riskLevel     : String(60),
    readiness.overallReadiness as readinessPct,
    goLive.readinessPct        as goLiveReadinessPct,
    case
      when workCategory.code is null then 'Select Work Category'
      when riskLevel.code in ('High','Critical') then 'Mitigate Risk'
      when readiness.overallReadiness is null or readiness.overallReadiness < 50 then 'Advance Readiness'
      else 'Review Go-Live Readiness'
    end as recommendedAction : String(60)
  };

// ---------------------------------------------------------------------------
// Data completeness — how much of each project is filled in (live, not stored).
// For every user-fillable field we count 1 when it IS NOT NULL; an association
// counts as filled when its dropdown (its `.code`) is set. Auto-computed fields
// (utilization, readinessPct, overallReadiness, businessNeed), the mandatory
// `name`, keys and managed columns are excluded — they are not "gaps" the owner
// must fill. Risks (1:many) is not scored (empty risks = no blockers); we only
// flag `hasRisks`. Divisors below are the fillable-field counts per section.
//
//   General 11 · Business Input 15 · Readiness 7 · Solution 19 · Go-Live 14 ·
//   Testing 6   →  overall = 72
//
// `100.0 *` BEFORE the divide avoids integer truncation on SQLite and HANA.
view ProjectCompleteness as
  select from my.Projects {
    key ID,
        name,
        itOwner.code as itOwner : String(60),

      cast(round(100.0 * (
        case when itOwner.code is not null then 1 else 0 end + case when workCategory.code is not null then 1 else 0 end + case when domain.code is not null then 1 else 0 end + case when requester.code is not null then 1 else 0 end + case when businessOwner.code is not null then 1 else 0 end + case when priority.code is not null then 1 else 0 end + case when phase.code is not null then 1 else 0 end + case when riskLevel.code is not null then 1 else 0 end + case when notes is not null then 1 else 0 end + case when numberOfUsers is not null then 1 else 0 end + case when numberOfRequests is not null then 1 else 0 end
      ) / 11, 2) as Decimal(5,2)) as generalPct : Decimal(5,2),

      cast(round(100.0 * (
        case when businessInput.problemStatement is not null then 1 else 0 end + case when businessInput.businessImpact is not null then 1 else 0 end + case when businessInput.expectedBenefit is not null then 1 else 0 end + case when businessInput.successKPI is not null then 1 else 0 end + case when businessInput.impactedDepartment.code is not null then 1 else 0 end + case when businessInput.sourceDocument.code is not null then 1 else 0 end + case when businessInput.businessApproval.code is not null then 1 else 0 end + case when businessInput.currentBaseline is not null then 1 else 0 end + case when businessInput.targetBenefit is not null then 1 else 0 end + case when businessInput.notes is not null then 1 else 0 end + case when businessInput.reviewStatus.code is not null then 1 else 0 end + case when businessInput.actualBenefit is not null then 1 else 0 end + case when businessInput.benefitAchieved.code is not null then 1 else 0 end + case when businessInput.reviewDate is not null then 1 else 0 end + case when businessInput.lessonsLearned is not null then 1 else 0 end
      ) / 15, 2) as Decimal(5,2)) as businessPct : Decimal(5,2),

      cast(round(100.0 * (
        case when readiness.solutionDesign.code is not null then 1 else 0 end + case when readiness.build.code is not null then 1 else 0 end + case when readiness.integration.code is not null then 1 else 0 end + case when readiness.qualitySecurity.code is not null then 1 else 0 end + case when readiness.releaseReadiness.code is not null then 1 else 0 end + case when readiness.operations.code is not null then 1 else 0 end + case when readiness.lifecycleStatus is not null then 1 else 0 end
      ) / 7, 2) as Decimal(5,2)) as readinessPct : Decimal(5,2),

      cast(round(100.0 * (
        case when solutionDetails.solutionSummary is not null then 1 else 0 end + case when solutionDetails.solutionType.code is not null then 1 else 0 end + case when solutionDetails.systemsInvolved is not null then 1 else 0 end + case when solutionDetails.integrationType.code is not null then 1 else 0 end + case when solutionDetails.dataSource is not null then 1 else 0 end + case when solutionDetails.targetSystem is not null then 1 else 0 end + case when solutionDetails.environment.code is not null then 1 else 0 end + case when solutionDetails.monitoringMethod.code is not null then 1 else 0 end + case when solutionDetails.supportOwner.code is not null then 1 else 0 end + case when solutionDetails.supportProcedure is not null then 1 else 0 end + case when solutionDetails.docLocation is not null then 1 else 0 end + case when solutionDetails.productionUrl is not null then 1 else 0 end + case when solutionDetails.hypercarePeriod is not null then 1 else 0 end + case when solutionDetails.authMethod.code is not null then 1 else 0 end + case when solutionDetails.criticality.code is not null then 1 else 0 end + case when solutionDetails.backupNeeded.code is not null then 1 else 0 end + case when solutionDetails.errorHandling.code is not null then 1 else 0 end + case when solutionDetails.logLocation is not null then 1 else 0 end + case when solutionDetails.escalationPath is not null then 1 else 0 end
      ) / 19, 2) as Decimal(5,2)) as solutionPct : Decimal(5,2),

      cast(round(100.0 * (
        case when goLive.uatApproved.code is not null then 1 else 0 end + case when goLive.securityApproved.code is not null then 1 else 0 end + case when goLive.deploymentPlan.code is not null then 1 else 0 end + case when goLive.rollbackPlan.code is not null then 1 else 0 end + case when goLive.monitoringReady.code is not null then 1 else 0 end + case when goLive.supportAssigned.code is not null then 1 else 0 end + case when goLive.docsCompleted.code is not null then 1 else 0 end + case when goLive.businessSignoff.code is not null then 1 else 0 end + case when goLive.deploymentOwner.code is not null then 1 else 0 end + case when goLive.deploymentDate is not null then 1 else 0 end + case when goLive.rollbackOwner.code is not null then 1 else 0 end + case when goLive.businessSignoffDate is not null then 1 else 0 end + case when goLive.hypercareStart is not null then 1 else 0 end + case when goLive.hypercareEnd is not null then 1 else 0 end
      ) / 14, 2) as Decimal(5,2)) as goLivePct : Decimal(5,2),

      cast(round(100.0 * (
        case when testing.testPhase.code is not null then 1 else 0 end + case when testing.testStatus.code is not null then 1 else 0 end + case when testing.bugSeverity.code is not null then 1 else 0 end + case when testing.bugPriority.code is not null then 1 else 0 end + case when testing.bugStatus.code is not null then 1 else 0 end + case when testing.testNotes is not null then 1 else 0 end
      ) / 6, 2) as Decimal(5,2)) as testingPct : Decimal(5,2),

      cast(round(100.0 * (
        (case when itOwner.code is not null then 1 else 0 end + case when workCategory.code is not null then 1 else 0 end + case when domain.code is not null then 1 else 0 end + case when requester.code is not null then 1 else 0 end + case when businessOwner.code is not null then 1 else 0 end + case when priority.code is not null then 1 else 0 end + case when phase.code is not null then 1 else 0 end + case when riskLevel.code is not null then 1 else 0 end + case when notes is not null then 1 else 0 end + case when numberOfUsers is not null then 1 else 0 end + case when numberOfRequests is not null then 1 else 0 end)
        + (case when businessInput.problemStatement is not null then 1 else 0 end + case when businessInput.businessImpact is not null then 1 else 0 end + case when businessInput.expectedBenefit is not null then 1 else 0 end + case when businessInput.successKPI is not null then 1 else 0 end + case when businessInput.impactedDepartment.code is not null then 1 else 0 end + case when businessInput.sourceDocument.code is not null then 1 else 0 end + case when businessInput.businessApproval.code is not null then 1 else 0 end + case when businessInput.currentBaseline is not null then 1 else 0 end + case when businessInput.targetBenefit is not null then 1 else 0 end + case when businessInput.notes is not null then 1 else 0 end + case when businessInput.reviewStatus.code is not null then 1 else 0 end + case when businessInput.actualBenefit is not null then 1 else 0 end + case when businessInput.benefitAchieved.code is not null then 1 else 0 end + case when businessInput.reviewDate is not null then 1 else 0 end + case when businessInput.lessonsLearned is not null then 1 else 0 end)
        + (case when readiness.solutionDesign.code is not null then 1 else 0 end + case when readiness.build.code is not null then 1 else 0 end + case when readiness.integration.code is not null then 1 else 0 end + case when readiness.qualitySecurity.code is not null then 1 else 0 end + case when readiness.releaseReadiness.code is not null then 1 else 0 end + case when readiness.operations.code is not null then 1 else 0 end + case when readiness.lifecycleStatus is not null then 1 else 0 end)
        + (case when solutionDetails.solutionSummary is not null then 1 else 0 end + case when solutionDetails.solutionType.code is not null then 1 else 0 end + case when solutionDetails.systemsInvolved is not null then 1 else 0 end + case when solutionDetails.integrationType.code is not null then 1 else 0 end + case when solutionDetails.dataSource is not null then 1 else 0 end + case when solutionDetails.targetSystem is not null then 1 else 0 end + case when solutionDetails.environment.code is not null then 1 else 0 end + case when solutionDetails.monitoringMethod.code is not null then 1 else 0 end + case when solutionDetails.supportOwner.code is not null then 1 else 0 end + case when solutionDetails.supportProcedure is not null then 1 else 0 end + case when solutionDetails.docLocation is not null then 1 else 0 end + case when solutionDetails.productionUrl is not null then 1 else 0 end + case when solutionDetails.hypercarePeriod is not null then 1 else 0 end + case when solutionDetails.authMethod.code is not null then 1 else 0 end + case when solutionDetails.criticality.code is not null then 1 else 0 end + case when solutionDetails.backupNeeded.code is not null then 1 else 0 end + case when solutionDetails.errorHandling.code is not null then 1 else 0 end + case when solutionDetails.logLocation is not null then 1 else 0 end + case when solutionDetails.escalationPath is not null then 1 else 0 end)
        + (case when goLive.uatApproved.code is not null then 1 else 0 end + case when goLive.securityApproved.code is not null then 1 else 0 end + case when goLive.deploymentPlan.code is not null then 1 else 0 end + case when goLive.rollbackPlan.code is not null then 1 else 0 end + case when goLive.monitoringReady.code is not null then 1 else 0 end + case when goLive.supportAssigned.code is not null then 1 else 0 end + case when goLive.docsCompleted.code is not null then 1 else 0 end + case when goLive.businessSignoff.code is not null then 1 else 0 end + case when goLive.deploymentOwner.code is not null then 1 else 0 end + case when goLive.deploymentDate is not null then 1 else 0 end + case when goLive.rollbackOwner.code is not null then 1 else 0 end + case when goLive.businessSignoffDate is not null then 1 else 0 end + case when goLive.hypercareStart is not null then 1 else 0 end + case when goLive.hypercareEnd is not null then 1 else 0 end)
        + (case when testing.testPhase.code is not null then 1 else 0 end + case when testing.testStatus.code is not null then 1 else 0 end + case when testing.bugSeverity.code is not null then 1 else 0 end + case when testing.bugPriority.code is not null then 1 else 0 end + case when testing.bugStatus.code is not null then 1 else 0 end + case when testing.testNotes is not null then 1 else 0 end)
      ) / 72, 2) as Decimal(5,2)) as overallPct : Decimal(5,2)
  };
  // Note: Risks (1:many) is deliberately NOT joined here — a to-many join would
  // duplicate a project's row once per risk and break the per-project count.
  // An empty Risks tab means "no blockers", not "incomplete", so it isn't scored.
//
// The portfolio-wide averages (for the "Portfolio Health" dashboard) are NOT a
// separate view: a single-row keyless aggregate is awkward to expose over OData
// on SQLite. Instead the dashboard reads all ProjectCompleteness rows and
// averages them client-side (48 rows — trivial), which is simpler and robust.
