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
