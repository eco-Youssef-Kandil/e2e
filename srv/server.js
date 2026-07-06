const cds = require('@sap/cds')
const express = require('express')
const path = require('path')
const fs = require('fs')

const AUTH_MODE = process.env.AUTH_MODE || 'local'

/**
 * Custom bootstrap: two small public endpoints for the LOCAL demo sign-in page.
 * (In production the login page is replaced by the XSUAA approuter, so these are
 * unused there — see README "Auth".)
 *
 *   GET  /login-users  → the sign-in roster (name + role + email; no password),
 *                        so newly-added users appear in the dropdown with no
 *                        code change.
 *   POST /login        → { email, password } → { token, user }. Thin wrapper over
 *                        AuthService.login (bcrypt check → app JWT). Kept as a
 *                        plain route so the static page can fetch() it without an
 *                        OData CSRF handshake.
 */
cds.on('bootstrap', (app) => {
  app.use(express.json())

  // Serve the static UI5 apps (project-portal, admin-lists, users-admin,
  // portfolio-health). In the deployed CAP module the `app/` folder is bundled
  // next to the service (gen/srv/app); locally cds already serves it. Registered
  // before the OData services so e.g. /project-portal/webapp/... resolves to a
  // file, while /governance, /auth, /login remain handled by the service/routes.
  const appDir = [
    path.join(__dirname, '..', 'app'),
    path.join(process.cwd(), 'app')
  ].find((p) => { try { return fs.existsSync(p) } catch { return false } })
  if (appDir) {
    console.log('[static] serving UI from', appDir)
    app.use(express.static(appDir))
  }

  // The bare root has no page of its own — send visitors to the portal, which
  // itself bounces to login.html when no account is chosen yet.
  app.get('/', (_req, res) => res.redirect(302, '/project-portal/webapp/index.html'))

  // The local sign-in roster + password endpoints are for LOCAL (app-JWT) auth
  // ONLY. In XSUAA mode the approuter authenticates via SAP SSO and login.html
  // exchanges that identity through /auth/xsuaaLogin — so these routes must NOT
  // exist in production: exposing them would leak the user roster and let anyone
  // mint an app JWT with the shared demo password, bypassing SSO entirely.
  if (AUTH_MODE !== 'xsuaa') {
    app.get('/login-users', async (req, res) => {
      try {
        const db = await cds.connect.to('db')
        const rows = await db.run(
          SELECT.from('nadec.e2e.Users')
            .columns('email', 'name', 'role')
            .where({ active: true })
            .orderBy('name')
        )
        res.setHeader('Cache-Control', 'no-store')
        res.json(rows || [])
      } catch (e) {
        console.error('[login-users] failed:', e.message)
        res.status(500).json({ error: 'Could not load users' })
      }
    })

    app.post('/login', async (req, res) => {
      try {
        const auth = await cds.connect.to('AuthService')
        const result = await auth.send('login', {
          email: req.body && req.body.email,
          password: req.body && req.body.password
        })
        res.json(result)
      } catch (e) {
        const code = Number(e.code) >= 400 && Number(e.code) < 600 ? Number(e.code) : 401
        res.status(code).json({ error: e.message || 'Sign-in failed' })
      }
    })
  }
})

module.exports = cds.server
