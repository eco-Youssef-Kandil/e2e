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
        req.reject(403, 'Only a Manager or Admin can view the change history.')
      }
    })

    // --- Auto-discard abandoned drafts (server-side safety net) ---------------
    // Projects are draft-enabled. If a user clicks Edit and then leaves without
    // Save/Cancel, the draft lingers and the project reopens "frozen" in edit
    // mode. The client discards drafts on navigation, but a browser crash or an
    // odd flow can still leave one behind. So whenever the project LIST is read
    // (i.e. the user is browsing, definitely not mid-edit) we sweep away this
    // user's own drafts that have been idle longer than a short grace period.
    // The grace period protects a draft the user JUST created (clicking Edit
    // also triggers list-adjacent reads); anything older is genuinely abandoned.
    const DRAFT_GRACE_MS = 60 * 1000 // 1 minute idle → considered abandoned
    this.before('READ', 'Projects', async (req) => {
      // Only act on the active list/browse read, never on a draft read.
      if (req.data && req.data.IsActiveEntity === false) return
      const isSingle = req.params && req.params.length > 0
      if (isSingle) return // opening one project — don't sweep here
      try {
        const me = req.user.id
        const cutoff = new Date(Date.now() - DRAFT_GRACE_MS).toISOString()
        const tx = cds.tx(req)
        // 1) Find UUIDs of this user's stale drafts from the shared draft admin
        //    table (association paths aren't allowed inside a draft-table WHERE,
        //    so we query the admin data directly, then match by UUID).
        const staleAdmin = await tx.run(
          SELECT.from('DRAFT.DraftAdministrativeData')
            .columns('DraftUUID')
            .where({ CreatedByUser: me, LastChangeDateTime: { '<': cutoff } })
        )
        const uuids = (staleAdmin || []).map((a) => a.DraftUUID)
        if (!uuids.length) return
        // 2) Map those to Projects draft roots and discard each (cascades to
        //    the draft's sections).
        // Delete the abandoned draft roots + their section drafts directly from
        // the draft tables (keyed by the DraftUUID). Draft rows are ephemeral
        // working copies, so a direct cascade is safe; we go table-by-table to
        // avoid the "virtual elements" restriction on draft-entity CQL.
        const DRAFT_TABLES = [
          'GovernanceService.Projects.drafts',
          'GovernanceService.BusinessInput.drafts',
          'GovernanceService.Readiness.drafts',
          'GovernanceService.SolutionDetails.drafts',
          'GovernanceService.GoLiveChecklist.drafts',
          'GovernanceService.Testing.drafts',
          'GovernanceService.Risks.drafts'
        ]
        let swept = 0
        for (const tbl of DRAFT_TABLES) {
          const n = await tx.run(
            DELETE.from(tbl).where({ DraftAdministrativeData_DraftUUID: { in: uuids } })
          )
          if (tbl.includes('Projects.drafts')) { swept = n || 0 }
        }
        if (swept) {
          console.log(`[drafts] swept ${swept} abandoned draft(s) for ${me}`)
        }
      } catch (e) {
        // A cleanup failure must never block the list from loading.
        console.warn('[drafts] stale-draft sweep skipped:', e.message)
      }
    })

    // --- Ownership: employees may only EDIT their own projects ---------------
    // Everyone can READ every project, but an employee can enter edit mode only
    // on projects where they are the IT Owner. The Manager can edit anything.
    // We block at draftEdit ("Edit" button) so a non-owner never gets an
    // editable draft — cleaner than failing later at save.
    //
    // Identity → owner match: each mocked user's attr.name (e.g. "Abdullah
    // Alsheri") equals the project's itOwner_code (the Employees code list is
    // keyed by the person's full name). On BTP the IdP supplies the same name.
    const ownsProject = (req, itOwnerCode) => {
      if (req.user.is('Manager')) return true
      const me = (req.user.attr && req.user.attr.name) || req.user.id
      return !!itOwnerCode && !!me && itOwnerCode === me
    }

    // --- Per-row UI permission flags -----------------------------------------
    // Computed on every Projects read so Fiori Elements shows the Edit button and
    // an editable IT Owner ONLY where the signed-in user has permission (bound via
    // @UI.UpdateHidden : editHidden and @Common.FieldControl : itOwnerFC).
    //   editHidden = true → hide Edit (not the IT Owner, and not a Manager/Admin)
    //   itOwnerFC  = 1 ReadOnly (Employee) / 3 editable (Manager/Admin)
    //
    // IMPORTANT: ownership depends on itOwner_code, but Fiori Elements does not
    // always $select it in the request that evaluates @UI.UpdateHidden (e.g. the
    // Object Page). So when it's missing we look it up by the row's key ID — in
    // ONE batched query for the whole result set — otherwise an owner-Employee
    // would wrongly get editHidden=true and lose the Edit button on their own
    // project. Managers/Admins own everything, so no lookup is needed for them.
    const computeProjectFlags = async (data, req) => {
      const isMgr = req.user.is('Manager')   // true for Manager AND Admin
      const rows = Array.isArray(data) ? data : (data ? [data] : [])
      let ownerById = {}
      if (!isMgr) {
        const missing = [...new Set(
          rows.filter(p => p && typeof p === 'object' && p.itOwner_code === undefined && p.ID).map(p => p.ID)
        )]
        if (missing.length) {
          const found = await cds.tx(req).run(
            SELECT.from('nadec.e2e.Projects').columns('ID', 'itOwner_code').where({ ID: { in: missing } })
          )
          for (const r of (found || [])) ownerById[r.ID] = r.itOwner_code
        }
      }
      for (const p of rows) {
        if (!p || typeof p !== 'object') continue
        const owner = p.itOwner_code !== undefined ? p.itOwner_code : ownerById[p.ID]
        p.editHidden = !ownsProject(req, owner)
        p.itOwnerFC = isMgr ? 3 : 1
      }
    }
    // Compute for BOTH the active read (List Report / Object Page display) AND the
    // draft read (edit mode) — otherwise the IT Owner FieldControl (itOwnerFC) is
    // null while editing and Fiori Elements renders the field editable.
    this.after('READ', 'Projects', computeProjectFlags)
    this.after('READ', 'Projects.drafts', computeProjectFlags)

    // --- Protect the project's lifecycle sections from direct deletion --------
    // The satellites (Business Input, Readiness, Solution Details, Go-Live,
    // Testing, Risks) are compositions of a project. In normal use they are only
    // ever changed through the project's DRAFT (deep save) — never deleted
    // directly against the active table. But as bare projections they would
    // otherwise let any signed-in user DELETE another project's section rows via
    // direct OData. So we reject a DIRECT delete of an ACTIVE section row unless
    // the caller is a Manager/Admin (which also covers the project-delete
    // cascade). Draft-node deletes (IsActiveEntity = false) are part of an owned
    // draft edit and pass through untouched.
    const SECTIONS = ['BusinessInput', 'Readiness', 'SolutionDetails', 'GoLiveChecklist', 'Testing', 'Risks']
    this.before('DELETE', SECTIONS, (req) => {
      const key = req.params && req.params[req.params.length - 1]
      if (key && key.IsActiveEntity === false) return   // draft node — allowed
      if (req.user.is('Manager')) return                // Manager/Admin + cascade
      req.reject(403, 'Project sections can only be changed through the project — you cannot delete them directly.')
    })

    this.before('NEW', 'Projects.drafts', (req) => {
      // Belt-and-braces: creating a brand-new project draft is Manager-only
      // (the @restrict already blocks CREATE, this keeps the message friendly).
      if (!req.user.is('Manager')) {
        req.reject(403, 'Only a Manager or Admin can create new projects.')
      }
    })

    this.before('EDIT', 'Projects', async (req) => {
      // draftEdit on an ACTIVE project → check ownership before a draft is made.
      const key = req.params && req.params[req.params.length - 1]
      const id = key && (key.ID || key.id || key)
      if (!id) return
      const proj = await cds.tx(req).run(
        SELECT.one.from('nadec.e2e.Projects').columns('itOwner_code').where({ ID: id })
      )
      if (proj && !ownsProject(req, proj.itOwner_code)) {
        req.reject(403,
          'Only the assigned IT Owner (or a Manager/Admin) can edit this project.')
      }
    })

    this.before('SAVE', 'Projects', async (req) => {
      const p = req.data
      const tx = cds.tx(req)

      // --- Only the Manager may change the IT Owner --------------------------
      // Employees can fill their project's sections but must not reassign it.
      if (!req.user.is('Manager') && p.ID) {
        const before = await tx.run(
          SELECT.one.from('nadec.e2e.Projects').columns('itOwner_code').where({ ID: p.ID })
        )
        const incoming = p.itOwner_code !== undefined
          ? p.itOwner_code
          : (p.itOwner && p.itOwner.code)
        if (incoming !== undefined && before && incoming !== before.itOwner_code) {
          req.reject(403, 'Only a Manager or Admin can change the IT Owner of a project.')
        }
      }

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
