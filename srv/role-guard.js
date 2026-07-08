/**
 * Hybrid authentication middleware for the E2E Governance CAP service.
 *
 * Mirrors the NADEC Visitor-Gate auth model so every NADEC app behaves the same:
 *   - LOCAL dev  (AUTH_MODE=local)  → app-issued JWT (HS256), minted by the
 *                                     AuthService `login` action after a bcrypt
 *                                     password check against the Users table.
 *   - PRODUCTION (AUTH_MODE=xsuaa)  → SAP XSUAA / IAS Bearer token, verified with
 *                                     @sap/xssec. The user's identity (email /
 *                                     logon name) comes from SuccessFactors via
 *                                     the IdP; if we've never seen them, they are
 *                                     auto-provisioned from SuccessFactors as an
 *                                     Employee (see AuthService.xsuaaLogin).
 *
 * ROLES ARE HELD IN THE APP DB (Users.role), NOT in XSUAA scopes — that's why
 * xs-security.json ships with no role-templates. This lets the Admin grant /
 * revoke roles from the Users screen without a redeploy.
 *
 * The resolved cds.User carries:
 *   - id    = email (the stable identity)
 *   - attr  = { name, email, employeeId, role }   (name → project IT-owner match)
 *   - roles = a set derived from the single app role, with a small hierarchy so
 *             Manager-guarded rules automatically also apply to an Admin:
 *               Employee → { Employee }
 *               Manager  → { Manager }
 *               Admin    → { Admin, Manager }
 */

const cds = require('@sap/cds')
const jwt = require('jsonwebtoken')

const AUTH_MODE = process.env.AUTH_MODE || 'local'
const DEV_SECRET = 'e2e-governance-secret-key-change-in-production'

// Resolve the HS256 signing secret. Priority:
//   1. JWT_SECRET env var (local dev / overrides)
//   2. the bound 'nadec-e2e-governance-jwt' user-provided service (production) —
//      the secret lives ONLY there, never in mta.yaml / git.
//   3. a well-known dev default (local only).
function resolveJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  try {
    const xsenv = require('@sap/xsenv')
    const { jwt } = xsenv.getServices({ jwt: { name: 'nadec-e2e-governance-jwt' } })
    if (jwt && jwt['jwt-secret']) return jwt['jwt-secret']
  } catch { /* service not bound (e.g. local dev) → fall through */ }
  return DEV_SECRET
}
const JWT_SECRET = resolveJwtSecret()

// Fail fast: never run production (XSUAA) on the built-in default secret. In that
// mode a real secret MUST come from the bound service (or JWT_SECRET), not the default.
if (AUTH_MODE === 'xsuaa' && JWT_SECRET === DEV_SECRET) {
  throw new Error('[Auth] No production JWT secret found — bind the "nadec-e2e-governance-jwt" service (or set JWT_SECRET). Refusing to start on the development default.')
}

// Map any stored role value to its canonical enum spelling. Tolerant of casing
// and stray whitespace so a value like 'manager' / ' Manager ' — however it got
// into the DB or an old token — never silently downgrades the user to Employee.
const ROLE_CANON = { admin: 'Admin', manager: 'Manager', employee: 'Employee' }
function canonicalRole(appRole) {
  return ROLE_CANON[String(appRole || '').trim().toLowerCase()] || 'Employee'
}

// Resolve the granted cds-roles for an application role (the small hierarchy).
function rolesFor(appRole) {
  switch (canonicalRole(appRole)) {
    case 'Admin':   return ['Admin', 'Manager']
    case 'Manager': return ['Manager']
    default:        return ['Employee']
  }
}

// Cache role look-ups briefly so we don't hit the DB on every single request.
const roleCache = new Map()
const ROLE_CACHE_TTL = 5 * 60 * 1000

// Lazily-loaded XSUAA bits — zero cost / never required in local mode.
let xsuaaService = null
function getXsuaaService() {
  if (!xsuaaService) {
    const xssec = require('@sap/xssec')
    const xsenv = require('@sap/xsenv')
    const services = xsenv.getServices({ uaa: { tag: 'xsuaa' } })
    xsuaaService = new xssec.XsuaaService(services.uaa)
    console.log(`[Auth:xssec] XSUAA service initialized xsappname=${services.uaa.xsappname}`)
  }
  return xsuaaService
}

function peekAlg(token) {
  try {
    const h = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'))
    return typeof h.alg === 'string' ? h.alg : null
  } catch { return null }
}

// Look up a user's application role from the DB (cached). Returns the app role
// string ('Employee' | 'Manager' | 'Admin') + profile, or null if unknown/inactive.
async function loadUser(email) {
  const key = (email || '').toLowerCase()
  const cached = roleCache.get(key)
  if (cached && Date.now() - cached.ts < ROLE_CACHE_TTL) return cached.user

  const db = await cds.connect.to('db')
  const row = await db.run(
    SELECT.one.from('nadec.e2e.Users')
      .columns('email', 'name', 'employeeId', 'role', 'active')
      .where({ email: key })
  )
  if (!row || row.active === false || row.active === 0) {
    roleCache.set(key, { user: null, ts: Date.now() })
    return null
  }
  const user = { email: row.email, name: row.name, employeeId: row.employeeId, role: row.role }
  roleCache.set(key, { user, ts: Date.now() })
  return user
}

// Let the AuthService invalidate the cache after an Admin edits a user.
function clearRoleCache(email) {
  if (email) roleCache.delete(String(email).toLowerCase())
  else roleCache.clear()
}

function buildUser({ email, name, employeeId, role }) {
  const canon = canonicalRole(role)
  const user = new cds.User({
    id: email,
    roles: rolesFor(canon),
    attr: { name, email, employeeId, role: canon }
  })
  return user
}

function setUser(req, user) {
  req.user = user
  const ctx = cds.context
  if (ctx) ctx.user = user
}

function reject401(res, message) {
  return res.status(401).json({
    error: { code: '401', message: message || 'Session expired or invalid token. Please sign in again.' }
  })
}

async function guard(req, res, next) {
  try {
    // The approuter overwrites Authorization with its own token in xsuaa mode,
    // so an app token (if any) is forwarded as X-Token and wins when present.
    const xToken = req.headers['x-token'] || ''
    const authHeader = req.headers.authorization || ''
    const source = xToken || authHeader

    // No credentials → anonymous; CAP's @restrict returns 401/403 as needed.
    if (!source) { setUser(req, cds.User.anonymous); return next() }

    let token = source
    if (/^bearer /i.test(source)) token = source.slice(7)
    else if (/^token /i.test(source)) token = source.slice(6)

    // 1) App JWT (HS256) — issued by our own login / xsuaaLogin.
    if (peekAlg(token) === 'HS256') {
      try {
        const d = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
        // Re-resolve the CURRENT role/active from the DB (cached ~5 min) rather
        // than trusting the role baked into the (2-year) token. This makes an
        // Admin's role change take effect within ROLE_CACHE_TTL — and lets
        // clearRoleCache() genuinely revoke — instead of only at token expiry.
        //   fresh = user object → use live profile
        //   fresh = null        → row gone or active=false → session revoked
        //   fresh = undefined   → DB unreachable → fall back to the token payload
        let fresh
        try { fresh = await loadUser(d.email) } catch { fresh = undefined }
        if (fresh === null) {
          return reject401(res, 'Your access has changed. Please sign in again.')
        }
        setUser(req, buildUser(fresh || {
          email: d.email, name: d.name, employeeId: d.employeeId, role: d.role
        }))
        return next()
      } catch (e) {
        if (AUTH_MODE !== 'xsuaa') return reject401(res, `Invalid session: ${e.message}`)
        // else fall through to XSUAA validation
      }
    }

    // 2) XSUAA Bearer token (production).
    if (AUTH_MODE === 'xsuaa') {
      try {
        const sc = await getXsuaaService().createSecurityContext(token)
        const rawEmail = typeof sc.getEmail === 'function' ? sc.getEmail() : null
        const rawLogon = typeof sc.getLogonName === 'function' ? sc.getLogonName() : null
        const email = (rawEmail || rawLogon || '').toLowerCase()
        if (!email) { setUser(req, cds.User.anonymous); return next() }

        const known = await loadUser(email)
        if (known) {
          setUser(req, buildUser(known))
          return next()
        }
        // Unknown XSUAA user: authenticated but not yet provisioned. Treat as a
        // bare Employee for this request; AuthService.xsuaaLogin persists them
        // (pulling their name from SuccessFactors) on first sign-in.
        const given = typeof sc.getGivenName === 'function' ? sc.getGivenName() : ''
        const family = typeof sc.getFamilyName === 'function' ? sc.getFamilyName() : ''
        const name = [given, family].filter(Boolean).join(' ') || email
        setUser(req, buildUser({ email, name, employeeId: (email.match(/^(\d+)@/) || [])[1] || null, role: 'Employee' }))
        return next()
      } catch (e) {
        console.warn('[Auth:xsuaa] validation failed:', e.message)
      }
    }

    // A token was provided but nothing accepted it.
    return reject401(res, 'Token provided but could not be verified.')
  } catch (e) {
    console.error('[Auth:guard] unexpected error:', e.message)
    setUser(req, cds.User.anonymous)
    return next()
  }
}

module.exports = guard
module.exports.clearRoleCache = clearRoleCache
module.exports.rolesFor = rolesFor
module.exports.canonicalRole = canonicalRole
module.exports.JWT_SECRET = JWT_SECRET
