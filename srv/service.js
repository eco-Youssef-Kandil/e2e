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

    // --- Excel import / export / template generation (srv/lib/excel.js) ---
    require('./lib/excel')(this)

    // --- Handover: configurable phases & task template ------------------------
    // The phase list and the default task template used to be hardcoded here;
    // they now live in the HandoverPhases / HandoverTaskTemplates tables so a
    // manager can edit them from Manage Lists. The constants below are only the
    // first-run seed (and a safety fallback if the tables are somehow empty).
    // fromOwner defaults to the project's current IT Owner (delivery-side owner).
    const DEFAULT_PHASES = [
      ['Preparation',        'Scope the handover — what is being handed over, to whom, and by when.'],
      ['Documentation',      'Runbooks, architecture notes and how-to guides for the support team.'],
      ['Knowledge Transfer', 'Walkthrough sessions and shadowing so support knows the solution.'],
      ['Access & Setup',     'Support team gets system access, monitoring and alerting in place.'],
      ['Hypercare',          'Delivery team stays close while support handles real tickets.'],
      ['Sign-off',           'Both sides confirm the handover is complete — support owns it now.']
    ]
    const HANDOVER_TEMPLATE = [
      ['Preparation',        'Confirm handover scope & timeline'],
      ['Preparation',        'Identify receiving support owner'],
      ['Documentation',      'Finalize solution documentation'],
      ['Documentation',      'Prepare runbook / SOP for support'],
      ['Documentation',      'Document known issues & workarounds'],
      ['Knowledge Transfer', 'Conduct KT sessions with support team'],
      ['Knowledge Transfer', 'Shadowing — support observes operations'],
      ['Knowledge Transfer', 'Reverse shadowing — support runs, delivery observes'],
      ['Access & Setup',     'Grant system access to support team'],
      ['Access & Setup',     'Set up monitoring & alerting'],
      ['Access & Setup',     'Register in support ticketing queues'],
      ['Hypercare',          'Run hypercare period'],
      ['Hypercare',          'Track & resolve hypercare issues'],
      ['Sign-off',           'Support owner sign-off'],
      ['Sign-off',           'Formal handover complete & closure']
    ]

    // Seed phases + template once (first run / fresh tables) so nothing regresses.
    const seedHandoverConfig = async () => {
      try {
        const phases = await SELECT.from('nadec.e2e.HandoverPhases').columns('ID')
        if (!phases.length) {
          await INSERT.into('nadec.e2e.HandoverPhases').entries(
            DEFAULT_PHASES.map(([id, desc], i) => ({
              ID: id, name: id, description: desc, sort: (i + 1) * 10, active: true
            }))
          )
        }
        const tmpl = await SELECT.from('nadec.e2e.HandoverTaskTemplates').columns('ID')
        if (!tmpl.length) {
          await INSERT.into('nadec.e2e.HandoverTaskTemplates').entries(
            HANDOVER_TEMPLATE.map(([phase, title], i) => ({
              phase, title, sort: (i + 1) * 10, active: true
            }))
          )
        }
      } catch (e) {
        console.warn('[handover] seed skipped:', e.message)
      }
    }
    cds.on('served', seedHandoverConfig)

    // Active template tasks in display order (falls back to the hardcoded
    // default only if the table is empty, so a plan is never seeded blank).
    const loadTemplate = async (tx) => {
      const rows = await tx.run(
        SELECT.from('nadec.e2e.HandoverTaskTemplates')
          .where({ active: true }).orderBy('sort', 'title')
      )
      if (rows.length) return rows.map((r) => [r.phase, r.title])
      return HANDOVER_TEMPLATE
    }

    this.on('createHandoverPlan', async (req) => {
      const projectID = (req.data.projectID || '').trim()
      if (!projectID) return req.reject(400, 'projectID is required.')
      const tx = cds.tx(req)
      const project = await tx.run(SELECT.one.from('nadec.e2e.Projects').where({ ID: projectID }))
      if (!project) return req.reject(404, `Project ${projectID} does not exist.`)
      const existing = await tx.run(SELECT.one.from('nadec.e2e.HandoverPlans')
        .where({ project_ID: projectID }))
      if (existing) return req.reject(409, `Project ${projectID} already has a handover plan.`)

      try {
        await tx.run(INSERT.into('nadec.e2e.HandoverPlans').entries({
          project_ID: projectID,
          status_code: 'Not Started',
          fromOwner_code: project.itOwner_code || null
        }))
      } catch (e) {
        // Concurrent create for the same project → unique-key violation.
        // Surface it as the same 409 the pre-check would have returned.
        if (/unique|constraint/i.test(e.message || '')) {
          return req.reject(409, `Project ${projectID} already has a handover plan.`)
        }
        throw e
      }
      const template = await loadTemplate(tx)
      if (template.length) {
        await tx.run(INSERT.into('nadec.e2e.HandoverTasks').entries(
          template.map(([phase, title], i) => ({
            plan_project_ID: projectID,
            phase, title,
            status_code: 'Not Started',
            sort: (i + 1) * 10
          }))
        ))
      }
      return projectID
    })

    // Apply the latest template to an existing plan — ADDITIVE ONLY. Adds any
    // template task (phase + title) not already on the plan; never deletes or
    // overwrites the user's existing tasks. Returns how many were added.
    this.on('applyTemplateToPlan', async (req) => {
      const projectID = (req.data.projectID || '').trim()
      if (!projectID) return req.reject(400, 'projectID is required.')
      const tx = cds.tx(req)
      const plan = await tx.run(SELECT.one.from('nadec.e2e.HandoverPlans')
        .where({ project_ID: projectID }))
      if (!plan) return req.reject(404, `Project ${projectID} has no handover plan yet.`)

      const template = await loadTemplate(tx)
      const existing = await tx.run(SELECT.from('nadec.e2e.HandoverTasks')
        .columns('phase', 'title', 'sort').where({ plan_project_ID: projectID }))
      const seen = new Set(existing.map((t) =>
        (t.phase || '').toLowerCase() + ' ' + (t.title || '').toLowerCase()))
      let maxSort = existing.reduce((m, t) => Math.max(m, t.sort || 0), 0)

      const toAdd = []
      for (const [phase, title] of template) {
        const key = (phase || '').toLowerCase() + ' ' + (title || '').toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        maxSort += 10
        toAdd.push({
          plan_project_ID: projectID,
          phase, title,
          status_code: 'Not Started',
          sort: maxSort
        })
      }
      if (toAdd.length) await tx.run(INSERT.into('nadec.e2e.HandoverTasks').entries(toAdd))
      return toAdd.length
    })

    // --- Custom fields: validated upsert of one value -------------------------
    this.on('saveCustomFieldValue', async (req) => {
      const { def_ID, recordKey } = req.data
      let value = req.data.value
      if (!def_ID) return req.reject(400, 'def_ID is required.')
      if (!recordKey) return req.reject(400, 'recordKey is required.')
      const tx = cds.tx(req)
      const def = await tx.run(SELECT.one.from('nadec.e2e.CustomFieldDefs').where({ ID: def_ID }))
      if (!def) return req.reject(404, 'That custom field no longer exists.')

      value = value === null || value === undefined ? '' : String(value).trim()
      const empty = value === ''

      if (def.required && empty) {
        return req.reject(400, `"${def.label}" is required.`)
      }
      if (!empty) {
        switch (def.fieldType) {
          case 'number':
            if (!/^-?\d+(\.\d+)?$/.test(value) || !isFinite(Number(value))) {
              return req.reject(400, `"${def.label}" must be a number.`)
            }
            break
          case 'date':
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || isNaN(Date.parse(value))) {
              return req.reject(400, `"${def.label}" must be a valid date.`)
            }
            break
          case 'boolean':
            if (value !== 'true' && value !== 'false') {
              return req.reject(400, `"${def.label}" must be yes or no.`)
            }
            break
          case 'select': {
            const opts = String(def.options || '').split(/\r?\n/)
              .map((s) => s.trim()).filter(Boolean)
            if (opts.length && opts.indexOf(value) < 0) {
              return req.reject(400, `"${value}" is not a valid option for "${def.label}".`)
            }
            break
          }
          default:
            if (value.length > 2000) value = value.slice(0, 2000)
        }
      }

      const existing = await tx.run(SELECT.one.from('nadec.e2e.CustomFieldValues')
        .where({ def_ID, recordKey }))
      if (existing) {
        await tx.run(UPDATE('nadec.e2e.CustomFieldValues')
          .set({ value }).where({ ID: existing.ID }))
        return existing.ID
      }
      const ID = cds.utils.uuid()
      await tx.run(INSERT.into('nadec.e2e.CustomFieldValues').entries({ ID, def_ID, recordKey, value }))
      return ID
    })

    // --- Handover phase / custom-field delete protection ----------------------
    // Block deleting a phase still used by tasks or the template, or a custom
    // field that still holds values (consistent with the lookup guard below).
    this.before('DELETE', 'HandoverPhases', async (req) => {
      const key = req.params && req.params[req.params.length - 1]
      const id = key && (key.ID !== undefined ? key.ID : key)
      if (!id) return
      const tx = cds.tx(req)
      const usedByTask = await tx.run(SELECT.one.from('nadec.e2e.HandoverTasks').where({ phase: id }))
      const usedByTmpl = await tx.run(SELECT.one.from('nadec.e2e.HandoverTaskTemplates').where({ phase: id }))
      if (usedByTask || usedByTmpl) {
        return req.reject(409,
          `Phase "${id}" is still used by ${usedByTask ? 'existing handover tasks' : 'the task template'}. ` +
          'Move or remove those first, or hide the phase instead of deleting it.')
      }
    })
    this.before('DELETE', 'CustomFieldDefs', async (req) => {
      const key = req.params && req.params[req.params.length - 1]
      const id = key && (key.ID !== undefined ? key.ID : key)
      if (!id) return
      const tx = cds.tx(req)
      const used = await tx.run(SELECT.one.from('nadec.e2e.CustomFieldValues').where({ def_ID: id }))
      if (used) {
        return req.reject(409,
          'This custom field already has saved values. ' +
          'Hide it instead of deleting so no data is lost.')
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

    // --- Lookup delete protection ---------------------------------------------
    // Deleting a dropdown value that rows still reference would leave orphaned
    // codes everywhere. Reflect over the model once: for each lookup entity,
    // collect every persisted table + FK column that targets it; on DELETE,
    // block with 409 while any referencing row (active or draft) exists.
    // ASSUMPTIONS (revisit if the schema changes): every lookup reference is a
    // *managed* association (el.keys present) and every lookup entity is keyed
    // by `code`, so the FK column is always `<assocName>_code`.
    const lookupRefs = {}   // 'nadec.e2e.lookup.X' -> [{ entity, fk }]
    for (const def of Object.values(cds.model.definitions)) {
      if (def.kind !== 'entity' || !def.elements) continue
      if (!def.name.startsWith('nadec.e2e.') || def.query || def.projection) continue
      for (const el of Object.values(def.elements)) {
        if (el.type === 'cds.Association' && el.keys &&
            el.target && el.target.startsWith('nadec.e2e.lookup.') &&
            el.target !== def.name) {
          (lookupRefs[el.target] = lookupRefs[el.target] || [])
            .push({ entity: def.name, fk: el.name + '_code' })
        }
      }
    }
    const lookupEntityNames = Object.values(this.entities)
      .filter((e) => {
        const from = e.query && e.query.SELECT && e.query.SELECT.from
        const src = from && from.ref && from.ref[0]
        return typeof src === 'string' && src.startsWith('nadec.e2e.lookup.')
      })
      .map((e) => e.name.split('.').pop())

    this.before('DELETE', lookupEntityNames, async (req) => {
      const key = req.params && req.params[req.params.length - 1]
      const code = (key && (key.code !== undefined ? key.code : key)) ||
                   (req.data && req.data.code)
      if (!code) return
      const src = req.target.query.SELECT.from.ref[0]
      const tx = cds.tx(req)
      for (const ref of lookupRefs[src] || []) {
        const targets = [ref.entity]
        // Draft-enabled entities keep unsaved copies in a .drafts table too.
        const short = ref.entity.split('.').pop()
        if (this.entities[short] && this.entities[short].drafts) {
          targets.push(this.entities[short].drafts.name)
        }
        for (const t of targets) {
          const row = await tx.run(SELECT.one.from(t).where({ [ref.fk]: code }))
          if (row) {
            return req.reject(409,
              `"${code}" is still used by at least one entry in ${short}. ` +
              'Change or remove those entries first, then delete the value.')
          }
        }
      }
    })

    this.before('NEW', 'Projects.drafts', async (req) => {
      // Belt-and-braces: creating a brand-new project draft is Manager-only
      // (the @restrict already blocks CREATE, this keeps the message friendly).
      if (!req.user.is('Manager')) {
        return req.reject(403, 'Only a Manager or Admin can create new projects.')
      }
      // Auto-assign the next sequential ID (PRJ-001, PRJ-002, …) so the user
      // never has to invent one. Scans both active projects and open drafts
      // so parallel unsaved drafts don't collide.
      if (!req.data.ID) {
        const tx = cds.tx(req)
        const [active, drafts] = await Promise.all([
          tx.run(SELECT.from('nadec.e2e.Projects').columns('ID')),
          tx.run(SELECT.from('GovernanceService.Projects.drafts').columns('ID'))
        ])
        let max = 0
        for (const row of [...active, ...drafts]) {
          const m = /^PRJ-(\d+)$/i.exec(row.ID || '')
          if (m) max = Math.max(max, parseInt(m[1], 10))
        }
        req.data.ID = 'PRJ-' + String(max + 1).padStart(3, '0')
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

    // --- Daily portfolio snapshot (trend history) ---------------------------
    // Captures/updates one row per calendar day so the executive dashboard can
    // chart readiness trends. Runs once on server start and again after every
    // project save (upsert keyed by date → cheap and idempotent).
    const captureSnapshot = async () => {
      try {
        const today = new Date().toISOString().slice(0, 10)
        const projects = await SELECT.from('nadec.e2e.Projects').columns('ID', 'riskLevel_code')
        const readiness = await SELECT.from('nadec.e2e.Readiness').columns('overallReadiness')
        const goLives = await SELECT.from('nadec.e2e.GoLiveChecklist').columns('readinessPct')
        const risks = await SELECT.from('nadec.e2e.Risks').columns('status_code')

        const nums = (rows, k) => rows
          .map((r) => r[k]).filter((v) => v !== null && v !== undefined)
          .map(Number).filter((v) => !isNaN(v))
        const avg = (xs) => xs.length
          ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100
          : null

        const snap = {
          snapshotDate: today,
          projectCount: projects.length,
          avgE2eReadiness: avg(nums(readiness, 'overallReadiness')),
          avgGoLive: avg(nums(goLives, 'readinessPct')),
          highRiskCount: projects.filter((p) =>
            p.riskLevel_code === 'High' || p.riskLevel_code === 'Critical').length,
          // A risk with no status yet is still open — only an explicit
          // Closed/Resolved status takes it off the books (matches the
          // executive dashboard's open-risk logic).
          openRiskCount: risks.filter((r) =>
            !(r.status_code && /^(closed|resolved)$/i.test(r.status_code))).length
        }
        await UPSERT.into('nadec.e2e.PortfolioSnapshots').entries(snap)
      } catch (e) {
        console.warn('[snapshot] capture skipped:', e.message)
      }
    }
    cds.on('served', captureSnapshot)
    // Re-capture AFTER the save transaction commits — a detached capture inside
    // the request would read pre-commit state and persist stale numbers.
    this.after('SAVE', 'Projects', (_data, req) => {
      req.on('succeeded', () => setImmediate(captureSnapshot))
    })

    return super.init()
  }
}
