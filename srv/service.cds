using nadec.e2e as my from '../db/schema';
using nadec.e2e.EmployeeAllocation as EmployeeAllocationView from './views';
using nadec.e2e.ActionRequired     as ActionRequiredView     from './views';

/**
 * The application portal service.
 *
 * Projects + their satellites are editable (draft) — the manager creates a
 * project and its assigned IT Owner fills the sections. The allocation/action
 * views and all lookups are read-only (lookups feed the dropdowns / value helps).
 */
service GovernanceService @(path: '/governance') {

  // ---- The master + its satellites (editable) ----
  @odata.draft.enabled
  @cds.redirection.target
  @(restrict: [
    { grant: ['READ', 'UPDATE'],   to: 'authenticated-user' },
    { grant: ['CREATE', 'DELETE'], to: 'Manager' }
  ])
  entity Projects        as projection on my.Projects;

  entity BusinessInput   as projection on my.BusinessInput;
  entity Readiness       as projection on my.Readiness;
  entity SolutionDetails as projection on my.SolutionDetails;
  entity GoLiveChecklist as projection on my.GoLiveChecklist;
  entity Testing         as projection on my.Testing;
  entity Risks           as projection on my.Risks;

  // ---- Dashboards (computed, read-only) ----
  @readonly entity EmployeeAllocation as projection on EmployeeAllocationView;
  @readonly entity ActionRequired     as projection on ActionRequiredView;

  // ---- Value-help lookups ----
  // Everyone reads them (they feed the dropdowns / value helps); only the
  // Manager may add / edit / delete entries — that is what the "Manage Lists"
  // admin page uses. The restriction below is repeated per entity because CAP
  // applies @restrict per projection.
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity WorkCategories    as projection on my.lookup.WorkCategories;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity BusinessDomains   as projection on my.lookup.BusinessDomains;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity Departments       as projection on my.lookup.Departments;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity BusinessOwners    as projection on my.lookup.BusinessOwners;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity Priorities        as projection on my.lookup.Priorities;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity Phases            as projection on my.lookup.Phases;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity RiskLevels        as projection on my.lookup.RiskLevels;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity StageStatuses     as projection on my.lookup.StageStatuses;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity ApprovalStatuses  as projection on my.lookup.ApprovalStatuses;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity SourceDocuments   as projection on my.lookup.SourceDocuments;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity ReviewStatuses    as projection on my.lookup.ReviewStatuses;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity BenefitAchieved   as projection on my.lookup.BenefitAchieved;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity SolutionTypes     as projection on my.lookup.SolutionTypes;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity IntegrationTypes  as projection on my.lookup.IntegrationTypes;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity Environments      as projection on my.lookup.Environments;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity MonitoringMethods as projection on my.lookup.MonitoringMethods;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity AuthMethods       as projection on my.lookup.AuthMethods;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity Criticalities     as projection on my.lookup.Criticalities;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity ErrorHandlings    as projection on my.lookup.ErrorHandlings;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity YesNoNA           as projection on my.lookup.YesNoNA;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity BlockingTeams     as projection on my.lookup.BlockingTeams;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity RiskStatuses      as projection on my.lookup.RiskStatuses;

  // Testing / QA lists (new)
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity TestPhases        as projection on my.lookup.TestPhases;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity TestStatuses      as projection on my.lookup.TestStatuses;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity BugSeverities     as projection on my.lookup.BugSeverities;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity BugPriorities     as projection on my.lookup.BugPriorities;
  @(restrict: [
    { grant: ['READ'], to: 'authenticated-user' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Manager' }
  ]) entity BugStatuses       as projection on my.lookup.BugStatuses;

  // Employees stays read-only: the IT-owner roster is governed by the mocked
  // auth users, not free-editable from the admin page.
  @readonly entity Employees  as projection on my.lookup.Employees;
}
