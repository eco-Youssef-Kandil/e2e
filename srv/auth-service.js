const cds = require('@sap/cds')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { clearRoleCache, rolesFor, canonicalRole, JWT_SECRET } = require('./role-guard')

const JWT_EXPIRES_IN = '2y'
const AUTH_MODE = process.env.AUTH_MODE || 'local'

// A stored value that already looks like a bcrypt hash must not be re-hashed.
const isBcrypt = (s) => typeof s === 'string' && /^\$2[aby]\$/.test(s)

module.exports = class AuthService extends cds.ApplicationService {
  async init() {
    const { Users } = this.entities

    // ---- Users administration (Admin only, enforced by @restrict) ----------

    // Never leak the password hash to the client.
    this.after('READ', 'Users', (rows) => {
      for (const r of (Array.isArray(rows) ? rows : [rows])) {
        if (r && 'password' in r) r.password = undefined
      }
    })

    // Hash a password on create/update (only when a new plaintext is supplied).
    const hashIncoming = async (req) => {
      const d = req.data
      if (d && d.password && !isBcrypt(d.password)) {
        d.password = await bcrypt.hash(String(d.password), 10)
      }
    }
    this.before('CREATE', 'Users', async (req) => {
      if (req.data.email) req.data.email = String(req.data.email).toLowerCase()
      if (req.data.role !== undefined) req.data.role = canonicalRole(req.data.role)
      await hashIncoming(req)
    })
    this.before('UPDATE', 'Users', async (req) => {
      if (req.data.role !== undefined) req.data.role = canonicalRole(req.data.role)
      await hashIncoming(req)
      await this._guardLastAdmin(req, 'UPDATE')
    })
    this.before('DELETE', 'Users', async (req) => {
      await this._guardLastAdmin(req, 'DELETE')
    })

    // After any change, drop the cached role so it takes effect on the next request.
    const bust = (req) => {
      const email = this._keyEmail(req) || (req.data && req.data.email)
      clearRoleCache(email)
    }
    this.after('CREATE', 'Users', (_, req) => bust(req))
    this.after('UPDATE', 'Users', (_, req) => bust(req))
    this.after('DELETE', 'Users', (_, req) => bust(req))

    // ---- Sign-in actions ----------------------------------------------------
    this.on('login', (req) => this._login(req))
    this.on('xsuaaLogin', (req) => this._xsuaaLogin(req))
    this.on('getCurrentUser', (req) => this._getCurrentUser(req))
    this.on('getAuthMode', () => ({ mode: AUTH_MODE }))

    console.log(`[Auth:init] AuthService ready AUTH_MODE=${AUTH_MODE}`)
    await super.init()
  }

  // The email key of the row being updated/deleted, from the request params.
  _keyEmail(req) {
    const p = req.params && req.params[req.params.length - 1]
    if (!p) return null
    return (typeof p === 'object' ? (p.email || p.ID) : p) || null
  }

  // Refuse any change that would remove the last remaining active Admin, so the
  // system can never be locked out of its own Users screen.
  async _guardLastAdmin(req, op) {
    const email = this._keyEmail(req)
    if (!email) return
    const db = cds.tx(req)
    const target = await db.run(
      SELECT.one.from('nadec.e2e.Users').columns('email', 'role', 'active').where({ email })
    )
    if (!target || target.role !== 'Admin' || target.active === false || target.active === 0) return

    // Would this op leave the target no longer an active Admin?
    let stillAdmin = true
    if (op === 'DELETE') {
      stillAdmin = false
    } else { // UPDATE
      const d = req.data || {}
      const nextRole = d.role !== undefined ? d.role : target.role
      const nextActive = d.active !== undefined ? d.active : target.active
      stillAdmin = nextRole === 'Admin' && nextActive !== false && nextActive !== 0
    }
    if (stillAdmin) return

    const otherAdmins = await db.run(
      SELECT.from('nadec.e2e.Users')
        .columns('email')
        .where({ role: 'Admin', active: true, email: { '<>': email } })
    )
    if (!otherAdmins || otherAdmins.length === 0) {
      req.reject(400, 'Cannot remove the last active Admin. Assign another Admin first.')
    }
  }

  // ---- login: local dev (bcrypt) → app JWT --------------------------------
  async _login(req) {
    const email = String(req.data.email || '').toLowerCase().trim()
    const password = String(req.data.password || '')
    if (!email || !password) return req.reject(400, 'Email and password are required.')

    const user = await SELECT.one.from('nadec.e2e.Users').where({ email })
    if (!user) return req.reject(401, 'Invalid email or password.')
    if (user.active === false || user.active === 0) return req.reject(401, 'Account is disabled.')

    const ok = user.password && await bcrypt.compare(password, user.password)
    if (!ok) return req.reject(401, 'Invalid email or password.')

    return this._issue(user)
  }

  // ---- xsuaaLogin: production — XSUAA identity → app JWT (SF provisioning) --
  async _xsuaaLogin(req) {
    const id = req.user && req.user.id
    if (!id || id === 'anonymous') {
      return req.reject(401, 'No valid XSUAA token found. Please authenticate via SAP IdP.')
    }
    const email = String(id).toLowerCase()

    let user = await SELECT.one.from('nadec.e2e.Users').where({ email })
    if (!user) {
      // First sign-in: pull the person's real name from SuccessFactors and
      // provision them as a plain Employee (the Admin can promote them later).
      let name = (req.user.attr && req.user.attr.name) || email
      let employeeId = (req.user.attr && req.user.attr.employeeId) || (email.match(/^(\d+)@/) || [])[1] || null
      try {
        const SFHRClient = require('./integration/sf-hr-client')
        const sf = employeeId ? await SFHRClient.lookupById(employeeId) : null
        if (sf) {
          name = `${sf.firstName || ''} ${sf.lastName || ''}`.trim() || name
          employeeId = sf.userId || employeeId
        }
      } catch (e) {
        console.warn('[Auth:xsuaaLogin] SF lookup skipped:', e.message)
      }
      await INSERT.into('nadec.e2e.Users').entries({ email, name, employeeId, role: 'Employee', password: '', active: true })
      user = await SELECT.one.from('nadec.e2e.Users').where({ email })
      console.log(`[Auth:xsuaaLogin] auto-provisioned ${email} as Employee`)
    }
    if (user.active === false || user.active === 0) return req.reject(401, 'Account is disabled.')
    return this._issue(user)
  }

  // Mint the signed app JWT + user summary returned to the browser.
  _issue(user) {
    // Canonicalize once so the role baked into the token AND the role the browser
    // stores (sessionStorage 'e2e-user-role' → client Create-button gate) are the
    // clean enum spelling, regardless of how it was stored in the DB.
    const role = canonicalRole(user.role)
    const token = jwt.sign(
      { email: user.email, name: user.name, employeeId: user.employeeId, role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    )
    return {
      token,
      user: { email: user.email, name: user.name, employeeId: user.employeeId, role }
    }
  }

  _getCurrentUser(req) {
    const u = req.user
    if (!u || u.id === 'anonymous') return req.reject(401, 'Not authenticated.')
    const role = (u.attr && u.attr.role) || 'Employee'
    return {
      email: u.id,
      name: (u.attr && u.attr.name) || u.id,
      employeeId: (u.attr && u.attr.employeeId) || null,
      role,
      roles: rolesFor(role)
    }
  }
}
