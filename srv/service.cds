using nadec.e2e as my from '../db/schema';
using nadec.e2e.EmployeeAllocation     as EmployeeAllocationView     from './views';
using nadec.e2e.ActionRequired         as ActionRequiredView         from './views';
using nadec.e2e.ProjectCompleteness    as ProjectCompletenessView    from './views';

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
  // Role & row-level rules:
  //   - CREATE / DELETE   → Manager/Admin only (@restrict below; CAP auto-hides
  //                         these buttons for Employees via $metadata capabilities).
  //   - UPDATE (draftEdit)→ granted to any authenticated user here, but the
  //                         before(EDIT) handler restricts it to the assigned IT
  //                         Owner (or a Manager/Admin) — see srv/service.js.
  //   - change IT Owner   → Manager/Admin only (before SAVE + read-only in the UI).
  @(restrict: [
    { grant: ['READ', 'UPDATE'],   to: 'authenticated-user' },
    { grant: ['CREATE', 'DELETE'], to: 'Manager' }
  ])
  // Live data-completeness (per project + per section) is exposed as the
  // `completeness` association so the List Report column and the Object Page
  // "Completeness" facet can bind to completeness/... without storing anything.
  //
  // Per-user / per-row virtual flags (computed in srv/service.js after READ) that
  // drive Fiori Elements visibility so a user only sees actions they may perform:
  //   editHidden → hide the Edit button on projects the user can't edit    [per row]
  //                (bound via @UI.UpdateHidden — works per-instance in FE).
  //   itOwnerFC  → IT Owner field control: 1 = ReadOnly (Employee), 3 = editable
  //                (Manager/Admin). Bound via @Common.FieldControl — MUST be an
  //                Edm.Byte for FE to honour a dynamic FieldControl path.
  // The Create / Delete buttons are ROLE-based; FE ignores @UI.CreateHidden/
  // @UI.DeleteHidden path values on the root List Report, so they are hidden for
  // Employees client-side in app/.../Component.js. The server handlers + @restrict
  // remain the real security control.
  entity Projects        as select from my.Projects
    mixin {
      completeness : Association to ProjectCompleteness on completeness.ID = ID;
    }
    into {
      *,
      completeness,
      virtual null as editHidden : Boolean @Core.Computed,
      virtual null as itOwnerFC  : Integer @Core.Computed @odata.Type: 'Edm.Byte'
    };

  // The project's lifecycle sections are compositions of Projects — they are
  // read/written through the project's DRAFT, not directly. Restrict them to
  // signed-in users so they are not world-readable / -writable via direct OData
  // (they carried no restriction before). Granting '*' to authenticated-user
  // keeps the draft deep-save working for the owner; a direct DELETE of an
  // ACTIVE section row is further limited to Manager/Admin in srv/service.js.
  // (Per-entity @restrict — unlike a service-level @requires — does not block the
  // anonymous $metadata request the Fiori app needs to bootstrap.)
  @(restrict: [{ grant: '*', to: 'authenticated-user' }])
  entity BusinessInput   as projection on my.BusinessInput;
  @(restrict: [{ grant: '*', to: 'authenticated-user' }])
  entity Readiness       as projection on my.Readiness;
  @(restrict: [{ grant: '*', to: 'authenticated-user' }])
  entity SolutionDetails as projection on my.SolutionDetails;
  @(restrict: [{ grant: '*', to: 'authenticated-user' }])
  entity GoLiveChecklist as projection on my.GoLiveChecklist;
  @(restrict: [{ grant: '*', to: 'authenticated-user' }])
  entity Testing         as projection on my.Testing;
  @(restrict: [{ grant: '*', to: 'authenticated-user' }])
  entity Risks           as projection on my.Risks;

  // ---- Dashboards (computed, read-only) ----
  @readonly entity EmployeeAllocation    as projection on EmployeeAllocationView;
  @readonly entity ActionRequired        as projection on ActionRequiredView;

  // Data completeness — per project (6 section % + overall). The portfolio-wide
  // averages are computed client-side in the Portfolio Health dashboard.
  @readonly entity ProjectCompleteness   as projection on ProjectCompletenessView;

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
