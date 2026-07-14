const ExcelJS = require('exceljs')
const cds = require('@sap/cds')

/**
 * Excel import / export / template generation for Projects and Handover.
 *
 * Columns are DYNAMIC:
 *   - built-in fields (minus the ones a manager hid via FieldVisibility)
 *   - plus every active manager-defined custom field (CustomFieldDefs)
 * Lookups are exported by display NAME and mapped back to their code on
 * import (name or code accepted, case-insensitive).
 *
 * Import semantics (Manager only, enforced in service.cds):
 *   - Rows are matched by key (Project ID / Task ID). Existing rows are
 *     updated, unknown keys are created (Projects: blank ID → next PRJ-###).
 *   - EMPTY cells never overwrite existing data (partial sheets are safe).
 *   - Invalid rows are skipped and reported; valid rows still import.
 */

// ---------- field registries (kept in sync with db/schema.cds) -------------
const PROJECT_FIELDS = [
  { field: 'name',             header: 'Name',               kind: 'text' },
  { field: 'itOwner',          header: 'IT Owner',           kind: 'lookup', lookup: 'Employees' },
  { field: 'workCategory',     header: 'Work Category',      kind: 'lookup', lookup: 'WorkCategories' },
  { field: 'domain',           header: 'Business Domain',    kind: 'lookup', lookup: 'BusinessDomains' },
  { field: 'requester',        header: 'Requester',          kind: 'lookup', lookup: 'Departments' },
  { field: 'businessOwner',    header: 'Business Owner',     kind: 'lookup', lookup: 'BusinessOwners' },
  { field: 'priority',         header: 'Priority',           kind: 'lookup', lookup: 'Priorities' },
  { field: 'phase',            header: 'Current Phase',      kind: 'lookup', lookup: 'Phases' },
  { field: 'riskLevel',        header: 'Risk Level',         kind: 'lookup', lookup: 'RiskLevels' },
  { field: 'startDate',        header: 'Start Date',         kind: 'date' },
  { field: 'targetGoLiveDate', header: 'Target Go-Live',     kind: 'date' },
  { field: 'actualGoLiveDate', header: 'Actual Go-Live',     kind: 'date' },
  { field: 'numberOfUsers',    header: 'Number of Users',    kind: 'int' },
  { field: 'numberOfRequests', header: 'Number of Requests', kind: 'int' },
  { field: 'notes',            header: 'Notes',              kind: 'text' }
]
const PLAN_FIELDS = [
  { field: 'status',     header: 'Status',      kind: 'lookup', lookup: 'StageStatuses' },
  { field: 'targetDate', header: 'Target Date', kind: 'date' },
  { field: 'actualDate', header: 'Actual Date', kind: 'date' },
  { field: 'fromOwner',  header: 'From Owner',  kind: 'lookup', lookup: 'Employees' },
  { field: 'toOwner',    header: 'To Owner',    kind: 'lookup', lookup: 'Employees' },
  { field: 'notes',      header: 'Notes',       kind: 'text' }
]
const TASK_FIELDS = [
  { field: 'phase',   header: 'Phase',    kind: 'phase' },
  { field: 'title',   header: 'Title',    kind: 'text', mandatory: true },
  { field: 'owner',   header: 'Owner',    kind: 'lookup', lookup: 'Employees' },
  { field: 'dueDate', header: 'Due Date', kind: 'date' },
  { field: 'status',  header: 'Status',   kind: 'lookup', lookup: 'StageStatuses' },
  { field: 'sort',    header: 'Sort',     kind: 'int' },
  { field: 'notes',   header: 'Notes',    kind: 'text' }
]
const LOOKUP_TABLES = {
  Employees:       'nadec.e2e.lookup.Employees',
  WorkCategories:  'nadec.e2e.lookup.WorkCategories',
  BusinessDomains: 'nadec.e2e.lookup.BusinessDomains',
  Departments:     'nadec.e2e.lookup.Departments',
  BusinessOwners:  'nadec.e2e.lookup.BusinessOwners',
  Priorities:      'nadec.e2e.lookup.Priorities',
  Phases:          'nadec.e2e.lookup.Phases',
  RiskLevels:      'nadec.e2e.lookup.RiskLevels',
  StageStatuses:   'nadec.e2e.lookup.StageStatuses'
}
const VALIDATION_ROWS = 500   // dropdowns cover this many data rows

// ---------- small helpers ---------------------------------------------------
const colLetter = (n) => {           // 1 -> A, 27 -> AA
  let s = ''
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) }
  return s
}
const cellStr = (v) => {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('').trim()
    if (v.text !== undefined) return String(v.text).trim()
    if (v.result !== undefined) return cellStr(v.result)
    if (v.hyperlink) return String(v.hyperlink).trim()
    return String(v).trim()
  }
  return String(v).trim()
}
const asDate = (raw) => {            // '' | 'yyyy-mm-dd' | null(=invalid)
  const s = cellStr(raw)
  if (!s) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
const asInt = (raw) => {
  const s = cellStr(raw)
  if (!s) return ''
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n) : null
}
const normBool = (raw) => {
  const s = cellStr(raw).toLowerCase()
  if (!s) return ''
  if (['true', 'yes', 'y', '1', 'x'].includes(s)) return 'true'
  if (['false', 'no', 'n', '0'].includes(s)) return 'false'
  return null
}

// Same rules as the saveCustomFieldValue action (keep in sync).
const validateCustomValue = (def, raw) => {
  let value = cellStr(raw)
  if (value === '') return { ok: true, value: '' }
  switch (def.fieldType) {
    case 'number':
      if (!/^-?\d+(\.\d+)?$/.test(value) || !isFinite(Number(value))) {
        return { error: `"${def.label}" must be a number.` }
      }
      break
    case 'date': {
      const d = asDate(value)
      if (!d) return { error: `"${def.label}" must be a valid date (YYYY-MM-DD).` }
      value = d
      break
    }
    case 'boolean': {
      const b = normBool(value)
      if (!b) return { error: `"${def.label}" must be true or false.` }
      value = b
      break
    }
    case 'select': {
      const opts = String(def.options || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      if (opts.length) {
        const hit = opts.find((o) => o.toLowerCase() === value.toLowerCase())
        if (!hit) return { error: `"${value}" is not a valid option for "${def.label}".` }
        value = hit
      }
      break
    }
    default:
      if (value.length > 2000) value = value.slice(0, 2000)
  }
  return { ok: true, value }
}

module.exports = function registerExcelHandlers (srv) {
  // ---------- shared loaders ------------------------------------------------
  const loadContext = async (tx, wantedLookups, cfTargets) => {
    const hiddenRows = await tx.run(SELECT.from('nadec.e2e.FieldVisibility').where({ hidden: true }))
    const hidden = new Set(hiddenRows.map((r) => `${r.target}|${r.field}`))

    const lookups = {}
    for (const key of wantedLookups) {
      const rows = await tx.run(SELECT.from(LOOKUP_TABLES[key]).columns('code', 'name').orderBy('sort', 'name'))
      const byText = new Map()
      for (const r of rows) {
        if (r.name) byText.set(String(r.name).toLowerCase(), r.code)
        byText.set(String(r.code).toLowerCase(), r.code)
      }
      const nameOf = new Map(rows.map((r) => [r.code, r.name || r.code]))
      lookups[key] = { rows, byText, nameOf }
    }

    const defs = {}
    for (const t of cfTargets) {
      defs[t] = await tx.run(SELECT.from('nadec.e2e.CustomFieldDefs')
        .where({ target: t, active: true }).orderBy('sort', 'label'))
    }

    const phases = await tx.run(SELECT.from('nadec.e2e.HandoverPhases').orderBy('sort', 'ID'))
    const phaseByText = new Map()
    for (const p of phases) {
      phaseByText.set(String(p.ID).toLowerCase(), p.ID)
      if (p.name) phaseByText.set(String(p.name).toLowerCase(), p.ID)
    }
    return { hidden, lookups, defs, phases, phaseByText }
  }

  const visibleFields = (all, hidden, target) =>
    all.filter((f) => !hidden.has(`${target}|${f.field}`))

  const loadCustomValues = async (tx, defList) => {
    const map = new Map()                       // def_ID|recordKey -> value
    if (!defList.length) return map
    const ids = defList.map((d) => d.ID)
    const rows = await tx.run(SELECT.from('nadec.e2e.CustomFieldValues').where({ def_ID: { in: ids } }))
    for (const r of rows) map.set(`${r.def_ID}|${r.recordKey}`, r.value)
    return map
  }

  // ---------- workbook building ----------------------------------------------
  const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1B5E20' } }

  const styleHeader = (ws, count) => {
    const row = ws.getRow(1)
    for (let i = 1; i <= count; i++) {
      const c = row.getCell(i)
      c.fill = HEADER_FILL
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    }
    row.commit && row.commit()
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }

  // Lists sheet: one column per option set; returns range refs for validation.
  const makeLists = (wb) => {
    const ws = wb.addWorksheet('Lists')
    let col = 0
    const add = (title, values) => {
      col += 1
      ws.getCell(1, col).value = title
      ws.getCell(1, col).font = { bold: true }
      values.forEach((v, i) => { ws.getCell(i + 2, col).value = v })
      const L = colLetter(col)
      return `Lists!$${L}$2:$${L}$${Math.max(values.length + 1, 2)}`
    }
    ws.state = 'veryHidden'
    return { add }
  }

  const applyListValidation = (ws, colIdx, rangeRef) => {
    for (let r = 2; r <= VALIDATION_ROWS + 1; r++) {
      ws.getCell(r, colIdx).dataValidation =
        { type: 'list', allowBlank: true, formulae: [rangeRef] }
    }
  }

  // Builds one data sheet: keys + built-ins + custom fields.
  // rows === null -> template (no data). Returns nothing.
  const buildSheet = (wb, lists, ctx, { name, keyHeaders, fields, cfTarget, rows }) => {
    const ws = wb.addWorksheet(name)
    const defs = ctx.defs[cfTarget] || []
    const headers = [
      ...keyHeaders.map((h) => h.header),
      ...fields.map((f) => f.header),
      ...defs.map((d) => d.label)
    ]
    ws.addRow(headers)
    styleHeader(ws, headers.length)
    headers.forEach((h, i) => { ws.getColumn(i + 1).width = Math.max(14, Math.min(40, h.length + 6)) })

    // Data rows FIRST — assigning dataValidation to cells materializes those
    // rows, and a later addRow would append after them (data at row 502).
    if (rows) for (const r of rows) ws.addRow(r)

    // dropdown validations
    let ci = keyHeaders.length
    for (const f of fields) {
      ci += 1
      if (f.kind === 'lookup') {
        const names = ctx.lookups[f.lookup].rows.map((r) => r.name || r.code)
        applyListValidation(ws, ci, lists.add(`${name}:${f.header}`, names))
      } else if (f.kind === 'phase') {
        const names = ctx.phases.filter((p) => p.active).map((p) => p.name || p.ID)
        applyListValidation(ws, ci, lists.add(`${name}:${f.header}`, names))
      }
    }
    for (const d of defs) {
      ci += 1
      if (d.fieldType === 'select') {
        const opts = String(d.options || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
        if (opts.length) applyListValidation(ws, ci, lists.add(`${name}:${d.label}`, opts))
      } else if (d.fieldType === 'boolean') {
        applyListValidation(ws, ci, lists.add(`${name}:${d.label}`, ['true', 'false']))
      }
    }
    return ws
  }

  // Serialize a built-in field value for export.
  const exportVal = (ctx, f, row) => {
    if (f.kind === 'lookup') {
      const code = row[`${f.field}_code`]
      return code ? (ctx.lookups[f.lookup].nameOf.get(code) || code) : ''
    }
    if (f.kind === 'phase') {
      const p = ctx.phases.find((x) => x.ID === row.phase)
      return p ? (p.name || p.ID) : (row.phase || '')
    }
    const v = row[f.field]
    return v === null || v === undefined ? '' : v
  }

  const b64 = async (wb) => Buffer.from(await wb.xlsx.writeBuffer()).toString('base64')
  const stamp = () => new Date().toISOString().slice(0, 10).replace(/-/g, '')

  // ---------- build (template or export) -------------------------------------
  const buildProjectWorkbook = async (tx, withData) => {
    const ctx = await loadContext(tx,
      ['Employees', 'WorkCategories', 'BusinessDomains', 'Departments', 'BusinessOwners',
        'Priorities', 'Phases', 'RiskLevels'], ['Project'])
    const fields = visibleFields(PROJECT_FIELDS, ctx.hidden, 'Project')
    const wb = new ExcelJS.Workbook()
    const lists = makeLists(wb)

    let rows = null
    if (withData) {
      const projects = await tx.run(SELECT.from('nadec.e2e.Projects').orderBy('ID'))
      const cfVals = await loadCustomValues(tx, ctx.defs.Project)
      rows = projects.map((p) => [
        p.ID,
        ...fields.map((f) => exportVal(ctx, f, p)),
        ...ctx.defs.Project.map((d) => cfVals.get(`${d.ID}|${p.ID}`) || '')
      ])
    }
    buildSheet(wb, lists, ctx, {
      name: 'Projects',
      keyHeaders: [{ header: 'Project ID' }],
      fields, cfTarget: 'Project', rows
    })
    return {
      fileName: `${withData ? 'projects_export' : 'projects_template'}_${stamp()}.xlsx`,
      base64: await b64(wb)
    }
  }

  const buildHandoverWorkbook = async (tx, withData) => {
    const ctx = await loadContext(tx, ['Employees', 'StageStatuses'], ['HandoverPlan', 'HandoverTask'])
    const planFields = visibleFields(PLAN_FIELDS, ctx.hidden, 'HandoverPlan')
    const taskFields = visibleFields(TASK_FIELDS, ctx.hidden, 'HandoverTask')
    const wb = new ExcelJS.Workbook()
    const lists = makeLists(wb)

    let planRows = null, taskRows = null
    if (withData) {
      const [plans, tasks, projects] = await Promise.all([
        tx.run(SELECT.from('nadec.e2e.HandoverPlans').orderBy('project_ID')),
        tx.run(SELECT.from('nadec.e2e.HandoverTasks').orderBy('plan_project_ID', 'sort')),
        tx.run(SELECT.from('nadec.e2e.Projects').columns('ID', 'name'))
      ])
      const pname = new Map(projects.map((p) => [p.ID, p.name]))
      const planVals = await loadCustomValues(tx, ctx.defs.HandoverPlan)
      const taskVals = await loadCustomValues(tx, ctx.defs.HandoverTask)
      planRows = plans.map((p) => [
        p.project_ID, pname.get(p.project_ID) || '',
        ...planFields.map((f) => exportVal(ctx, f, p)),
        ...ctx.defs.HandoverPlan.map((d) => planVals.get(`${d.ID}|${p.project_ID}`) || '')
      ])
      taskRows = tasks.map((t) => [
        t.ID, t.plan_project_ID,
        ...taskFields.map((f) => exportVal(ctx, f, t)),
        ...ctx.defs.HandoverTask.map((d) => taskVals.get(`${d.ID}|${t.ID}`) || '')
      ])
    }
    buildSheet(wb, lists, ctx, {
      name: 'Handover Plans',
      keyHeaders: [{ header: 'Project ID' }, { header: 'Project Name' }],
      fields: planFields, cfTarget: 'HandoverPlan', rows: planRows
    })
    buildSheet(wb, lists, ctx, {
      name: 'Handover Tasks',
      keyHeaders: [{ header: 'Task ID' }, { header: 'Project ID' }],
      fields: taskFields, cfTarget: 'HandoverTask', rows: taskRows
    })
    return {
      fileName: `${withData ? 'handover_export' : 'handover_template'}_${stamp()}.xlsx`,
      base64: await b64(wb)
    }
  }

  // ---------- import ----------------------------------------------------------
  const sheetRows = (ws) => {              // -> { headers:[], rows:[{rowNo, get(header)}] }
    if (!ws) return null
    const headers = []
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { headers[i] = cellStr(c.value) })
    const rows = []
    ws.eachRow((row, rowNo) => {
      if (rowNo === 1) return
      const byHeader = {}
      let any = false
      row.eachCell({ includeEmpty: true }, (c, i) => {
        const h = headers[i]
        if (!h) return
        const v = c.value
        byHeader[h] = v
        if (cellStr(v) !== '') any = true
      })
      if (any) rows.push({ rowNo, cells: byHeader })
    })
    return { headers: headers.filter(Boolean), rows }
  }

  // Convert one built-in cell; returns {skip} | {value} | {error}
  const parseBuiltin = (ctx, f, raw) => {
    const s = cellStr(raw)
    if (s === '') return { skip: true }          // empty never overwrites
    if (f.kind === 'lookup') {
      const code = ctx.lookups[f.lookup].byText.get(s.toLowerCase())
      if (!code) return { error: `"${s}" is not a known ${f.header}.` }
      return { column: `${f.field}_code`, value: code }
    }
    if (f.kind === 'phase') {
      const id = ctx.phaseByText.get(s.toLowerCase())
      if (!id) return { error: `"${s}" is not a known handover phase.` }
      return { column: 'phase', value: id }
    }
    if (f.kind === 'date') {
      const d = asDate(raw)
      if (d === null) return { error: `"${s}" is not a valid ${f.header} (use YYYY-MM-DD).` }
      return { column: f.field, value: d }
    }
    if (f.kind === 'int') {
      const n = asInt(raw)
      if (n === null) return { error: `"${s}" is not a valid ${f.header} (whole number).` }
      return { column: f.field, value: n }
    }
    return { column: f.field, value: s }
  }

  // Gather patch + custom values for one row. Returns {patch, custom, errors}
  const parseRow = (ctx, fields, defs, cells) => {
    const patch = {}
    const custom = []          // {def, value}
    const errors = []
    for (const f of fields) {
      if (!(f.header in cells)) continue
      const r = parseBuiltin(ctx, f, cells[f.header])
      if (r.skip) continue
      if (r.error) { errors.push(r.error); continue }
      patch[r.column] = r.value
    }
    for (const d of defs) {
      if (!(d.label in cells)) continue
      const raw = cells[d.label]
      if (cellStr(raw) === '') continue          // empty never overwrites
      const v = validateCustomValue(d, raw)
      if (v.error) { errors.push(v.error); continue }
      custom.push({ def: d, value: v.value })
    }
    return { patch, custom, errors }
  }

  const upsertCustom = async (tx, custom, recordKey) => {
    for (const { def, value } of custom) {
      const existing = await tx.run(SELECT.one.from('nadec.e2e.CustomFieldValues')
        .where({ def_ID: def.ID, recordKey }))
      if (existing) {
        await tx.run(UPDATE('nadec.e2e.CustomFieldValues').set({ value }).where({ ID: existing.ID }))
      } else {
        await tx.run(INSERT.into('nadec.e2e.CustomFieldValues')
          .entries({ ID: cds.utils.uuid(), def_ID: def.ID, recordKey, value }))
      }
    }
  }

  const USERS_DENOM = 1000, REQS_DENOM = 100
  const recomputeUtilization = async (tx, projectID) => {
    const p = await tx.run(SELECT.one.from('nadec.e2e.Projects')
      .columns('numberOfUsers', 'numberOfRequests').where({ ID: projectID }))
    if (!p) return
    const missing = (v) => v === null || v === undefined || v === ''
    const util = (missing(p.numberOfUsers) || missing(p.numberOfRequests)) ? null
      : Math.round(Math.min(1, (p.numberOfUsers / USERS_DENOM) * 0.5 +
                               (p.numberOfRequests / REQS_DENOM) * 0.5) * 10000) / 100
    await tx.run(UPDATE('nadec.e2e.Projects').set({ utilization: util }).where({ ID: projectID }))
  }

  const importProjects = async (tx, wb, summary) => {
    const parsed = sheetRows(wb.getWorksheet('Projects'))
    if (!parsed) { summary.errors.push({ sheet: 'Projects', row: 0, message: 'Sheet "Projects" not found in the file.' }); return }
    const ctx = await loadContext(tx,
      ['Employees', 'WorkCategories', 'BusinessDomains', 'Departments', 'BusinessOwners',
        'Priorities', 'Phases', 'RiskLevels'], ['Project'])
    const fields = visibleFields(PROJECT_FIELDS, ctx.hidden, 'Project')

    const existing = await tx.run(SELECT.from('nadec.e2e.Projects').columns('ID'))
    const ids = new Set(existing.map((p) => p.ID))
    let maxNum = 0
    for (const id of ids) { const m = /^PRJ-(\d+)$/i.exec(id); if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10)) }

    for (const { rowNo, cells } of parsed.rows) {
      const { patch, custom, errors } = parseRow(ctx, fields, ctx.defs.Project, cells)
      let id = cellStr(cells['Project ID']).toUpperCase()
      const isNew = !id || !ids.has(id)
      if (isNew && !id) { maxNum += 1; id = 'PRJ-' + String(maxNum).padStart(3, '0') }
      if (id.length > 10) errors.push(`Project ID "${id}" is longer than 10 characters.`)
      if (isNew && !patch.name) errors.push('New projects need a Name.')
      if (errors.length) {
        summary.errors.push({ sheet: 'Projects', row: rowNo, message: errors.join(' ') })
        summary.skipped += 1
        continue
      }
      if (isNew) {
        await tx.run(INSERT.into('nadec.e2e.Projects').entries({ ID: id, ...patch }))
        ids.add(id)
        summary.created += 1
      } else if (Object.keys(patch).length) {
        await tx.run(UPDATE('nadec.e2e.Projects').set(patch).where({ ID: id }))
        summary.updated += 1
      } else if (custom.length) {
        summary.updated += 1
      } else {
        summary.skipped += 1
        continue
      }
      if ('numberOfUsers' in patch || 'numberOfRequests' in patch) await recomputeUtilization(tx, id)
      await upsertCustom(tx, custom, id)
    }
  }

  const importHandover = async (tx, wb, summary) => {
    const ctx = await loadContext(tx, ['Employees', 'StageStatuses'], ['HandoverPlan', 'HandoverTask'])
    const planFields = visibleFields(PLAN_FIELDS, ctx.hidden, 'HandoverPlan')
    const taskFields = visibleFields(TASK_FIELDS, ctx.hidden, 'HandoverTask')

    const projects = await tx.run(SELECT.from('nadec.e2e.Projects').columns('ID'))
    const projectIds = new Set(projects.map((p) => p.ID))
    const plans = await tx.run(SELECT.from('nadec.e2e.HandoverPlans').columns('project_ID'))
    const planIds = new Set(plans.map((p) => p.project_ID))

    const planSheet = sheetRows(wb.getWorksheet('Handover Plans'))
    if (planSheet) {
      for (const { rowNo, cells } of planSheet.rows) {
        const { patch, custom, errors } = parseRow(ctx, planFields, ctx.defs.HandoverPlan, cells)
        const pid = cellStr(cells['Project ID']).toUpperCase()
        if (!pid) errors.push('Project ID is required.')
        else if (!projectIds.has(pid)) errors.push(`Project ${pid} does not exist.`)
        if (errors.length) {
          summary.errors.push({ sheet: 'Handover Plans', row: rowNo, message: errors.join(' ') })
          summary.skipped += 1
          continue
        }
        if (planIds.has(pid)) {
          if (Object.keys(patch).length) {
            await tx.run(UPDATE('nadec.e2e.HandoverPlans').set(patch).where({ project_ID: pid }))
            summary.updated += 1
          } else if (custom.length) {
            summary.updated += 1
          } else {
            summary.skipped += 1
            continue
          }
        } else {
          await tx.run(INSERT.into('nadec.e2e.HandoverPlans').entries({
            project_ID: pid, status_code: 'Not Started', ...patch
          }))
          planIds.add(pid)
          summary.created += 1
        }
        await upsertCustom(tx, custom, pid)
      }
    }

    const taskSheet = sheetRows(wb.getWorksheet('Handover Tasks'))
    if (taskSheet) {
      const tasks = await tx.run(SELECT.from('nadec.e2e.HandoverTasks').columns('ID', 'plan_project_ID', 'sort'))
      const taskById = new Map(tasks.map((t) => [String(t.ID).toLowerCase(), t]))
      const maxSort = new Map()
      for (const t of tasks) {
        maxSort.set(t.plan_project_ID, Math.max(maxSort.get(t.plan_project_ID) || 0, t.sort || 0))
      }
      for (const { rowNo, cells } of taskSheet.rows) {
        const { patch, custom, errors } = parseRow(ctx, taskFields, ctx.defs.HandoverTask, cells)
        const tid = cellStr(cells['Task ID'])
        const pid = cellStr(cells['Project ID']).toUpperCase()
        const existing = tid ? taskById.get(tid.toLowerCase()) : null
        if (tid && !existing) errors.push(`Task ID "${tid}" was not found (leave Task ID blank to create a new task).`)
        if (!existing) {
          if (!pid) errors.push('Project ID is required for new tasks.')
          else if (!planIds.has(pid)) errors.push(`Project ${pid} has no handover plan yet — add it to the "Handover Plans" sheet first.`)
          if (!patch.title) errors.push('New tasks need a Title.')
        }
        if (errors.length) {
          summary.errors.push({ sheet: 'Handover Tasks', row: rowNo, message: errors.join(' ') })
          summary.skipped += 1
          continue
        }
        let key
        if (existing) {
          key = existing.ID
          if (Object.keys(patch).length) {
            await tx.run(UPDATE('nadec.e2e.HandoverTasks').set(patch).where({ ID: existing.ID }))
            summary.updated += 1
          } else if (custom.length) {
            summary.updated += 1
          } else {
            summary.skipped += 1
            continue
          }
        } else {
          key = cds.utils.uuid()
          const next = (maxSort.get(pid) || 0) + 10
          maxSort.set(pid, next)
          await tx.run(INSERT.into('nadec.e2e.HandoverTasks').entries({
            ID: key, plan_project_ID: pid, status_code: 'Not Started', sort: next, ...patch
          }))
          taskById.set(key.toLowerCase(), { ID: key, plan_project_ID: pid })
          summary.created += 1
        }
        await upsertCustom(tx, custom, key)
      }
    }
    if (!planSheet && !taskSheet) {
      summary.errors.push({ sheet: '-', row: 0, message: 'Neither "Handover Plans" nor "Handover Tasks" sheet found in the file.' })
    }
  }

  // ---------- action handlers -------------------------------------------------
  const normTarget = (req) => {
    const t = String(req.data.target || '').trim().toLowerCase()
    if (t === 'project' || t === 'projects') return 'project'
    if (t === 'handover') return 'handover'
    req.reject(400, 'target must be "project" or "handover".')
  }

  srv.on('excelTemplate', async (req) => {
    const target = normTarget(req)
    const tx = cds.tx(req)
    return target === 'project' ? buildProjectWorkbook(tx, false) : buildHandoverWorkbook(tx, false)
  })

  srv.on('excelExport', async (req) => {
    const target = normTarget(req)
    const tx = cds.tx(req)
    return target === 'project' ? buildProjectWorkbook(tx, true) : buildHandoverWorkbook(tx, true)
  })

  srv.on('excelImport', async (req) => {
    const target = normTarget(req)
    const b = req.data.base64 || ''
    if (!b) return req.reject(400, 'No file content received.')
    let buf
    try { buf = Buffer.from(b, 'base64') } catch { return req.reject(400, 'Invalid file encoding.') }
    if (buf.length > 15 * 1024 * 1024) return req.reject(400, 'File is too large (15 MB max).')
    const wb = new ExcelJS.Workbook()
    try { await wb.xlsx.load(buf) } catch {
      return req.reject(400, 'Could not read that file — please upload a valid .xlsx workbook.')
    }
    const summary = { created: 0, updated: 0, skipped: 0, errors: [] }
    const tx = cds.tx(req)
    if (target === 'project') await importProjects(tx, wb, summary)
    else await importHandover(tx, wb, summary)
    return JSON.stringify(summary)
  })
}
