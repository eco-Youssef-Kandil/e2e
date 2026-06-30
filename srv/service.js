const cds = require('@sap/cds')

/**
 * GovernanceService logic.
 *
 * The Excel kept three "formula" fields that this service computes on save —
 * so the dashboards (ActionRequired, EmployeeAllocation) and the List Report
 * show real values instead of hand-typed fractions:
 *
 *   - GoLiveChecklist.readinessPct   = share of the 8 gates set to "Yes"        (0..1)
 *   - Readiness.overallReadiness     = share of the 7 stages set to "Completed" (0..1)
 *   - Readiness.businessNeed         = auto-derived from Business Input completeness
 *
 * Wired on the draft SAVE of Projects (deep payload). When a section wasn't
 * touched in the draft, its data is read from the active table so the values
 * stay consistent regardless of which tab the user edited.
 */
const GATES = [
  'uatApproved', 'securityApproved', 'deploymentPlan', 'rollbackPlan',
  'monitoringReady', 'supportAssigned', 'docsCompleted', 'businessSignoff'
]
const STAGES = [
  'businessNeed', 'solutionDesign', 'build', 'integration',
  'qualitySecurity', 'releaseReadiness', 'operations'
]

// The readiness fields are Decimal(5,4): a fraction with at most 4 decimals.
// The percent fields are Decimal(5,2): a 0..100 value with at most 2 decimals.
// pct2 turns a 0..1 fraction into that percent (e.g. 4/7 → 57.14), rounded so
// the save isn't rejected as "not a valid Decimal(5,2)".
const pct2 = (fraction) => Math.round(fraction * 10000) / 100

// Utilization denominators (from the Excel: Lists!$AL$4 / $AL$5). The number of
// users / requests that each count alone would need to reach 100% on its axis.
const USERS_DENOM = 1000   // Lists!$AL$4
const REQS_DENOM  = 100    // Lists!$AL$5

module.exports = class GovernanceService extends cds.ApplicationService {
  init() {
    // --- Audit log: Manager-only ---
    // The change-tracking plugin auto-exposes ChangeView (and a "Change
    // History" facet on every tracked Object Page). Restrict all reads of it
    // to the Manager role, so employees cannot see the audit trail.
    this.before('READ', 'ChangeView', (req) => {
      if (!req.user.is('Manager')) {
        req.reject(403, 'Only the manager can view the change history.')
      }
    })

    this.before('SAVE', 'Projects', async (req) => {
      const p = req.data
      const tx = cds.tx(req)

      // --- Utilization % (on the master row) ---
      // = MIN(1, (users/USERS_DENOM)*0.5 + (requests/REQS_DENOM)*0.5);
      //   blank (null) if either count is missing. Manual inputs now; the
      //   counts will be fed by an integration later.
      const u = p.numberOfUsers
      const r = p.numberOfRequests
      const missing = (v) => v === null || v === undefined || v === ''
      const frac = (missing(u) || missing(r))
        ? null
        : Math.min(1, (u / USERS_DENOM) * 0.5 + (r / REQS_DENOM) * 0.5)
      // Stored as a 0..100 percentage (e.g. 16.00), so the UI shows "16%".
      p.utilization = frac === null ? null : pct2(frac)

      // --- Go-Live readiness % ---
      let goLive = p.goLive
      if (!goLive) goLive = await tx.run(SELECT.one.from('nadec.e2e.GoLiveChecklist').where({ project_ID: p.ID }))
      if (goLive) {
        const yes = GATES.filter(k => goLive[k + '_code'] === 'Yes').length
        const pct = pct2(yes / GATES.length)
        if (p.goLive) p.goLive.readinessPct = pct
        else await tx.run(UPDATE('nadec.e2e.GoLiveChecklist').set({ readinessPct: pct }).where({ project_ID: p.ID }))
      }

      // --- Readiness: overall % + auto Business Need ---
      let readiness = p.readiness
      if (!readiness) readiness = await tx.run(SELECT.one.from('nadec.e2e.Readiness').where({ project_ID: p.ID }))
      if (readiness) {
        // Business Need is derived from Business Input completeness
        let bi = p.businessInput
        if (!bi) bi = await tx.run(SELECT.one.from('nadec.e2e.BusinessInput').where({ project_ID: p.ID }))
        const hasProblem = !!(bi && bi.problemStatement)
        const hasBenefit = !!(bi && bi.expectedBenefit)
        const businessNeed = (hasProblem && hasBenefit) ? 'Completed'
                           : (hasProblem || hasBenefit) ? 'Partially Defined'
                           : 'Missing Input'

        const stageVal = (k) => k === 'businessNeed' ? businessNeed : readiness[k + '_code']
        const done = STAGES.filter(k => stageVal(k) === 'Completed').length
        const overall = pct2(done / STAGES.length)

        if (p.readiness) {
          p.readiness.businessNeed_code = businessNeed
          p.readiness.overallReadiness = overall
        } else {
          await tx.run(UPDATE('nadec.e2e.Readiness')
            .set({ businessNeed_code: businessNeed, overallReadiness: overall })
            .where({ project_ID: p.ID }))
        }
      }
    })

    return super.init()
  }
}
